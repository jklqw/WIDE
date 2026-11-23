import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Redis } from "ioredis";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { loadEnv } from "../config/env.js";
import { createPrismaClient, PrismaClient } from "@ide/database";
import { CSRF_COOKIE, CSRF_HEADER } from "../plugins/csrf.js";
import { SESSION_COOKIE } from "../services/sessions.js";

const env = loadEnv({
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://webide:webide@127.0.0.1:5432/webide",
  REDIS_URL: "redis://127.0.0.1:6379",
  SESSION_SECRET: "test-session-secret-0123456789abcdef",
  RUNNER_SHARED_SECRET: "test-runner-secret-0123456789abcdef",
  WEB_ORIGIN: "http://localhost:3000",
});

let app: FastifyInstance;
let prisma: PrismaClient;
let redis: Redis;
const stamp = Date.now();
const email = `auth-test-${stamp}@example.com`;
const password = "correct horse battery";

function cookiesOf(res: { cookies: { name: string; value: string }[] }) {
  return Object.fromEntries(res.cookies.map((c) => [c.name, c.value]));
}

beforeAll(async () => {
  prisma = createPrismaClient(env.DATABASE_URL);
  redis = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  app = await buildApp({ env, prisma, redis });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { emailNorm: email } });
  await app.close();
  await prisma.$disconnect();
  redis.disconnect();
});

describe("auth flow", () => {
  it("registers, sets HttpOnly cookies, and returns a CSRF token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email, password, displayName: "Auth Test" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user.email).toBe(email);
    expect(body.csrfToken).toContain(".");

    const cookies = res.cookies;
    const session = cookies.find((c) => c.name === SESSION_COOKIE);
    const csrf = cookies.find((c) => c.name === CSRF_COOKIE);
    expect(session?.httpOnly).toBe(true);
    expect(session?.sameSite?.toLowerCase()).toBe("lax");
    expect(csrf?.httpOnly).toBe(true);
    expect(csrf?.sameSite?.toLowerCase()).toBe("strict");
  });

  it("rejects duplicate registration with constant-shape error", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email, password, displayName: "Dup" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("EMAIL_TAKEN");
  });

  it("me requires auth", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/auth/me" });
    expect(res.statusCode).toBe(401);
  });

  it("login returns session + csrf and me works with cookies", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password },
    });
    expect(login.statusCode).toBe(200);
    const jar = cookiesOf(login);

    const me = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      cookies: { [SESSION_COOKIE]: jar[SESSION_COOKIE]! },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().email).toBe(email);
  });

  it("rejects bad credentials with constant-shape 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password: "wrong-password-1" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.message).toBe("Invalid email or password");

    const ghost = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: `ghost-${stamp}@example.com`, password: "whatever-123" },
    });
    expect(ghost.statusCode).toBe(401);
    expect(ghost.json().error.message).toBe(res.json().error.message);
  });

  it("enforces CSRF on cookie-authenticated mutations", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password },
    });
    const jar = cookiesOf(login);
    const cookies = {
      [SESSION_COOKIE]: jar[SESSION_COOKIE]!,
      [CSRF_COOKIE]: jar[CSRF_COOKIE]!,
    };

    // No CSRF header -> rejected
    const noCsrf = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      cookies,
    });
    expect(noCsrf.statusCode).toBe(403);
    expect(noCsrf.json().error.code).toBe("CSRF_INVALID");

    // Wrong header -> rejected
    const badCsrf = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      cookies,
      headers: { [CSRF_HEADER]: "forged.token" },
    });
    expect(badCsrf.statusCode).toBe(403);

    // Correct double-submit -> accepted
    const ok = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      cookies,
      headers: { [CSRF_HEADER]: jar[CSRF_COOKIE]! },
    });
    expect(ok.statusCode).toBe(204);
  });

  it("revoked session cannot authenticate", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password },
    });
    const jar = cookiesOf(login);
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      cookies: {
        [SESSION_COOKIE]: jar[SESSION_COOKIE]!,
        [CSRF_COOKIE]: jar[CSRF_COOKIE]!,
      },
      headers: { [CSRF_HEADER]: jar[CSRF_COOKIE]! },
    });
    const me = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      cookies: { [SESSION_COOKIE]: jar[SESSION_COOKIE]! },
    });
    expect(me.statusCode).toBe(401);
  });
});
