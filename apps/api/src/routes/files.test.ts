import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Redis } from "ioredis";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { loadEnv } from "../config/env.js";
import { createPrismaClient, PrismaClient } from "@ide/database";
import { CSRF_COOKIE, CSRF_HEADER } from "../plugins/csrf.js";
import { SESSION_COOKIE } from "../services/sessions.js";

const STORAGE_ROOT = "/tmp/webide-test-files";
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
const userA = `files-a-${stamp}@example.com`;
const userB = `files-b-${stamp}@example.com`;
const password = "correct horse battery";

interface Session {
  cookies: Record<string, string>;
  csrf: string;
}

async function register(email: string): Promise<Session> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email, password, displayName: "t" },
  });
  const jar = Object.fromEntries(res.cookies.map((c) => [c.name, c.value]));
  return {
    cookies: { [SESSION_COOKIE]: jar[SESSION_COOKIE]!, [CSRF_COOKIE]: jar[CSRF_COOKIE]! },
    csrf: res.json().csrfToken as string,
  };
}

function call(
  s: Session,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  opts: { payload?: unknown; query?: Record<string, string> } = {},
) {
  return app.inject({
    method,
    url,
    ...(opts.query ? { query: opts.query } : {}),
    cookies: s.cookies,
    headers: method === "GET" ? {} : { [CSRF_HEADER]: s.csrf },
    ...(opts.payload !== undefined ? { payload: opts.payload as object } : {}),
  });
}

let sA: Session;
let sB: Session;
let wsId: string;

beforeAll(async () => {
  prisma = createPrismaClient(env.DATABASE_URL);
  redis = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  app = await buildApp({ env, prisma, redis });
  sA = await register(userA);
  sB = await register(userB);
  const res = await call(sA, "POST", "/api/v1/workspaces", {
    payload: { name: "files", templateId: "blank" },
  });
  wsId = res.json().id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { emailNorm: { in: [userA, userB] } } });
  await app.close();
  await prisma.$disconnect();
  redis.disconnect();
});

describe("workspace filesystem API", () => {
  it("lists root entries", async () => {
    const res = await call(sA, "GET", `/api/v1/workspaces/${wsId}/files`);
    expect(res.statusCode).toBe(200);
    expect(res.json().entries.map((e: { name: string }) => e.name)).toContain("README.md");
  });

  it("writes and reads a file with revision", async () => {
    const w = await call(sA, "PUT", `/api/v1/workspaces/${wsId}/file`, {
      payload: { path: "hello.py", content: "print('hi')" },
    });
    expect(w.statusCode).toBe(200);
    const rev = w.json().revision as string;

    const r = await call(sA, "GET", `/api/v1/workspaces/${wsId}/file`, {
      query: { path: "hello.py" },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().content).toBe("print('hi')");
    expect(r.json().revision).toBe(rev);
  });

  it("returns 409 on stale revision", async () => {
    const w1 = await call(sA, "PUT", `/api/v1/workspaces/${wsId}/file`, {
      payload: { path: "c.txt", content: "one" },
    });
    const rev1 = w1.json().revision;
    await call(sA, "PUT", `/api/v1/workspaces/${wsId}/file`, {
      payload: { path: "c.txt", content: "two" },
    });
    const stale = await call(sA, "PUT", `/api/v1/workspaces/${wsId}/file`, {
      payload: { path: "c.txt", content: "three", expectedRevision: rev1 },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe("REVISION_CONFLICT");
  });

  it("rejects traversal paths at the API layer", async () => {
    const res = await call(sA, "PUT", `/api/v1/workspaces/${wsId}/file`, {
      payload: { path: "../escape.txt", content: "x" },
    });
    expect(res.statusCode).toBe(400);
    const res2 = await call(sA, "GET", `/api/v1/workspaces/${wsId}/file`, {
      query: { path: "%2e%2e/escape" },
    });
    expect([400, 404]).toContain(res2.statusCode);
  });

  it("creates, renames, and deletes entries", async () => {
    const mk = await call(sA, "POST", `/api/v1/workspaces/${wsId}/files`, {
      payload: { path: "adir", kind: "directory" },
    });
    expect(mk.statusCode).toBe(201);

    const rn = await call(sA, "PATCH", `/api/v1/workspaces/${wsId}/files`, {
      payload: { from: "adir", to: "bdir" },
    });
    expect(rn.statusCode).toBe(200);

    const del = await call(sA, "DELETE", `/api/v1/workspaces/${wsId}/files`, {
      query: { path: "bdir" },
    });
    expect(del.statusCode).toBe(204);
  });

  it("handles multipart upload and download", async () => {
    const boundary = "----testboundary";
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="path"\r\n\r\nuploaded.txt\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="u.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`,
      ),
      Buffer.from("uploaded-content"),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const up = await app.inject({
      method: "POST",
      url: `/api/v1/workspaces/${wsId}/upload`,
      cookies: sA.cookies,
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
        [CSRF_HEADER]: sA.csrf,
      },
      payload: body,
    });
    expect(up.statusCode).toBe(201);

    const dl = await call(sA, "GET", `/api/v1/workspaces/${wsId}/download`, {
      query: { path: "uploaded.txt" },
    });
    expect(dl.statusCode).toBe(200);
    expect(String(dl.headers["x-content-type-options"])).toBe("nosniff");
    expect(dl.body).toBe("uploaded-content");
  });

  it("denies cross-tenant file access", async () => {
    const res = await call(sB, "GET", `/api/v1/workspaces/${wsId}/files`);
    expect(res.statusCode).toBe(404);
  });
});
