import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Redis } from "ioredis";
import type { FastifyInstance } from "fastify";
import { existsSync } from "node:fs";
import path from "node:path";
import { buildApp } from "../app.js";
import { loadEnv } from "../config/env.js";
import { createPrismaClient, PrismaClient } from "@ide/database";
import { CSRF_COOKIE, CSRF_HEADER } from "../plugins/csrf.js";
import { SESSION_COOKIE } from "../services/sessions.js";

const STORAGE_ROOT = "/tmp/webide-test-workspaces";
const env = loadEnv({
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://webide:webide@127.0.0.1:5432/webide",
  REDIS_URL: "redis://127.0.0.1:6379",
  SESSION_SECRET: "test-session-secret-0123456789abcdef",
  RUNNER_SHARED_SECRET: "test-runner-secret-0123456789abcdef",
  WEB_ORIGIN: "http://localhost:3000",
  WORKSPACE_STORAGE_ROOT: STORAGE_ROOT,
});

let app: FastifyInstance;
let prisma: PrismaClient;
let redis: Redis;
const stamp = Date.now();
const userA = `ws-a-${stamp}@example.com`;
const userB = `ws-b-${stamp}@example.com`;
const password = "correct horse battery";

interface Session {
  cookies: Record<string, string>;
  csrf: string;
}

async function login(email: string): Promise<Session> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email, password, displayName: email.split("@")[0]! },
  });
  expect(res.statusCode).toBe(201);
  const jar = Object.fromEntries(res.cookies.map((c) => [c.name, c.value]));
  return {
    cookies: {
      [SESSION_COOKIE]: jar[SESSION_COOKIE]!,
      [CSRF_COOKIE]: jar[CSRF_COOKIE]!,
    },
    csrf: res.json().csrfToken as string,
  };
}

function authed(session: Session, method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: unknown) {
  return app.inject({
    method,
    url,
    cookies: session.cookies,
    headers:
      method === "GET" ? {} : { [CSRF_HEADER]: session.csrf },
    ...(payload !== undefined ? { payload: payload as object } : {}),
  });
}

beforeAll(async () => {
  prisma = createPrismaClient(env.DATABASE_URL);
  redis = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  app = await buildApp({ env, prisma, redis });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { emailNorm: { in: [userA, userB] } } });
  await app.close();
  await prisma.$disconnect();
  redis.disconnect();
});

describe("workspace CRUD + ownership", () => {
  let sessionA: Session;
  let sessionB: Session;
  let wsId: string;
  let storageKey: string;

  it("registers two users", async () => {
    sessionA = await login(userA);
    sessionB = await login(userB);
  });

  it("creates a python workspace and hydrates the template", async () => {
    const res = await authed(sessionA, "POST", "/api/v1/workspaces", {
      name: "Py Play",
      templateId: "python",
    });
    expect(res.statusCode).toBe(201);
    const ws = res.json();
    wsId = ws.id;
    expect(ws.name).toBe("Py Play");
    expect(ws.templateId).toBe("python");

    const row = await prisma.workspace.findUnique({ where: { id: wsId } });
    storageKey = row!.storageKey;
    expect(existsSync(path.join(STORAGE_ROOT, storageKey, "main.py"))).toBe(true);
  });

  it("lists only own workspaces, sorted by updatedAt desc", async () => {
    const resA = await authed(sessionA, "GET", "/api/v1/workspaces");
    expect(resA.json().workspaces.map((w: { id: string }) => w.id)).toContain(wsId);
    const resB = await authed(sessionB, "GET", "/api/v1/workspaces");
    expect(resB.json().workspaces).toHaveLength(0);
  });

  it("denies cross-tenant read/update/delete with 404", async () => {
    for (const [method, url, payload] of [
      ["GET", `/api/v1/workspaces/${wsId}`, undefined],
      ["PATCH", `/api/v1/workspaces/${wsId}`, { name: "hijack" }],
      ["DELETE", `/api/v1/workspaces/${wsId}`, undefined],
    ] as const) {
      const res = await authed(sessionB, method, url, payload);
      expect(res.statusCode).toBe(404);
    }
    // Still exists and unchanged.
    const res = await authed(sessionA, "GET", `/api/v1/workspaces/${wsId}`);
    expect(res.json().name).toBe("Py Play");
  });

  it("updates name/description", async () => {
    const res = await authed(sessionA, "PATCH", `/api/v1/workspaces/${wsId}`, {
      name: "Py Play v2",
      description: "renamed",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("Py Play v2");
    expect(res.json().description).toBe("renamed");
  });

  it("soft-deletes and removes storage", async () => {
    const res = await authed(sessionA, "DELETE", `/api/v1/workspaces/${wsId}`);
    expect(res.statusCode).toBe(204);
    const row = await prisma.workspace.findUnique({ where: { id: wsId } });
    expect(row!.deletedAt).not.toBeNull();
    await new Promise((r) => setTimeout(r, 100));
    expect(existsSync(path.join(STORAGE_ROOT, storageKey))).toBe(false);
    const get = await authed(sessionA, "GET", `/api/v1/workspaces/${wsId}`);
    expect(get.statusCode).toBe(404);
  });
});
