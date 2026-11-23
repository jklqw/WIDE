import type { FastifyInstance } from "fastify";
import {
  AuthSessionSchema,
  LoginRequestSchema,
  RegisterRequestSchema,
  UserProfileSchema,
} from "@ide/contracts";
import { AppError } from "../lib/errors.js";
import { audit } from "../services/audit.js";
import { createLoginGuard } from "../services/loginGuard.js";
import { hashPassword, verifyPassword } from "../services/passwords.js";
import { ipHash } from "../plugins/auth.js";
import {
  createSession,
  lookupSession,
  revokeSession,
  SESSION_COOKIE,
  SESSION_TTL_MS,
} from "../services/sessions.js";
import { CSRF_COOKIE, issueCsrfToken } from "../plugins/csrf.js";

const AUTH_RATE_LIMIT = {
  max: 10,
  timeWindow: "1 minute",
  keyGenerator: (req: { ip: string }) => `auth:${req.ip}`,
};

function sessionCookieOptions(env: { isProduction: boolean }) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.isProduction,
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}

function csrfCookieOptions(env: { isProduction: boolean }) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "strict" as const,
    secure: env.isProduction,
    maxAge: 12 * 60 * 60,
  };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const guard = createLoginGuard(app.hasDecorator("redis") ? app.redis : undefined);

  const setSessionCookies = (
    reply: import("fastify").FastifyReply,
    token: string,
    csrfToken: string,
  ) => {
    reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions(app.env));
    reply.setCookie(CSRF_COOKIE, csrfToken, csrfCookieOptions(app.env));
  };

  app.post(
    "/api/v1/auth/register",
    { config: { rateLimit: AUTH_RATE_LIMIT } },
    async (request, reply) => {
      const body = RegisterRequestSchema.parse(request.body);
      const emailNorm = body.email.toLowerCase();

      const existing = await app.prisma.user.findUnique({ where: { emailNorm } });
      if (existing) {
        // Constant-shape error to avoid account enumeration.
        throw AppError.conflict("EMAIL_TAKEN", "Unable to create account with these details");
      }

      const passwordHash = await hashPassword(body.password);
      const user = await app.prisma.user.create({
        data: {
          email: body.email,
          emailNorm,
          passwordHash,
          displayName: body.displayName,
        },
      });

      const { token } = await createSession(app.prisma, user.id, {
        userAgent: request.headers["user-agent"] ?? null,
        ipHash: ipHash(request),
      });
      const csrf = issueCsrfToken(app.env.SESSION_SECRET);
      setSessionCookies(reply, token, csrf.token);

      await audit(app.prisma, {
        action: "auth.register",
        outcome: "success",
        userId: user.id,
        requestId: request.id,
      });

      return reply.status(201).send({
        user: UserProfileSchema.parse({
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          status: user.status.toLowerCase(),
          createdAt: user.createdAt.toISOString(),
        }),
        csrfToken: csrf.token,
      });
    },
  );

  app.post(
    "/api/v1/auth/login",
    { config: { rateLimit: AUTH_RATE_LIMIT } },
    async (request, reply) => {
      const body = LoginRequestSchema.parse(request.body);
      const emailNorm = body.email.toLowerCase();

      if (await guard.isLocked(emailNorm)) {
        await audit(app.prisma, {
          action: "auth.login.failure",
          outcome: "denied",
          requestId: request.id,
          metadata: { reason: "locked" },
        });
        // Same shape as bad credentials — do not reveal lockout state.
        throw AppError.unauthorized("INVALID_CREDENTIALS", "Invalid email or password");
      }

      const user = await app.prisma.user.findUnique({ where: { emailNorm } });
      const ok =
        user &&
        user.status === "ACTIVE" &&
        (await verifyPassword(user.passwordHash, body.password));

      if (!ok) {
        await guard.recordFailure(emailNorm);
        await audit(app.prisma, {
          action: "auth.login.failure",
          outcome: "failure",
          userId: user?.id ?? null,
          requestId: request.id,
        });
        // Constant-shape error: never reveal whether the email exists.
        throw AppError.unauthorized("INVALID_CREDENTIALS", "Invalid email or password");
      }

      await guard.recordSuccess(emailNorm);
      // Rotate: revoke prior sessions, issue a fresh token.
      await app.prisma.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const { token } = await createSession(app.prisma, user.id, {
        userAgent: request.headers["user-agent"] ?? null,
        ipHash: ipHash(request),
      });
      const csrf = issueCsrfToken(app.env.SESSION_SECRET);
      setSessionCookies(reply, token, csrf.token);

      await audit(app.prisma, {
        action: "auth.login.success",
        outcome: "success",
        userId: user.id,
        requestId: request.id,
      });

      return AuthSessionSchema.parse({
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          status: user.status.toLowerCase(),
          createdAt: user.createdAt.toISOString(),
        },
        csrfToken: csrf.token,
      });
    },
  );

  app.post("/api/v1/auth/logout", async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) {
      const ctx = await lookupSession(app.prisma, token);
      if (ctx) {
        await revokeSession(app.prisma, ctx.session.id);
        await audit(app.prisma, {
          action: "auth.logout",
          outcome: "success",
          userId: ctx.user.id,
          requestId: request.id,
        });
      }
    }
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    reply.clearCookie(CSRF_COOKIE, { path: "/" });
    return reply.status(204).send();
  });

  app.get("/api/v1/auth/me", { preHandler: app.requireAuth }, async (request) => {
    const user = request.user!;
    return UserProfileSchema.parse({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      status: user.status.toLowerCase(),
      createdAt: user.createdAt.toISOString(),
    });
  });

  app.get("/api/v1/auth/csrf", async (_request, reply) => {
    const csrf = issueCsrfToken(app.env.SESSION_SECRET);
    reply.setCookie(CSRF_COOKIE, csrf.token, csrfCookieOptions(app.env));
    return { csrfToken: csrf.token };
  });
}
