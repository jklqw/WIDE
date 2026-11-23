import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { User } from "@prisma/client";
import { AppError } from "../lib/errors.js";
import { lookupSession, SESSION_COOKIE } from "../services/sessions.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: User;
    sessionId?: string;
  }
}

export function ipHash(req: FastifyRequest): string | null {
  if (!req.ip) return null;
  return createHash("sha256").update(req.ip).digest("hex").slice(0, 32);
}

export async function requireAuth(request: FastifyRequest): Promise<void> {
  const token = request.cookies[SESSION_COOKIE];
  if (!token) {
    throw AppError.unauthorized("UNAUTHENTICATED", "Authentication required");
  }
  const ctx = await lookupSession(request.server.prisma, token);
  if (!ctx) {
    throw AppError.unauthorized("SESSION_INVALID", "Session is invalid or expired");
  }
  request.user = ctx.user;
  request.sessionId = ctx.session.id;
}

export async function authPlugin(app: FastifyInstance): Promise<void> {
  app.decorateRequest("user", undefined);
  app.decorateRequest("sessionId", undefined);
  app.decorate("requireAuth", requireAuth);
}

declare module "fastify" {
  interface FastifyInstance {
    requireAuth: typeof requireAuth;
  }
}
