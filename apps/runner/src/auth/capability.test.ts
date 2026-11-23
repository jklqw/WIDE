import { describe, expect, it, beforeAll, afterAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { requireCapability } from "./capability.js";
import { signCapability } from "@ide/sandbox";
import { Redis } from "ioredis";

const SECRET = "runner-test-secret-0123456789abcdef";
let app: FastifyInstance;
let redis: Redis;

beforeAll(async () => {
  redis = new Redis("redis://127.0.0.1:6379", { lazyConnect: true });
  app = Fastify();
  app.decorate("env", { RUNNER_SHARED_SECRET: SECRET, RUNNER_PORT: 0, RUNNER_HOST: "127.0.0.1", NODE_ENV: "test", LOG_LEVEL: "fatal", WORKSPACE_STORAGE_ROOT: "/tmp", SANDBOX_OCI_RUNTIME: "", REDIS_URL: "redis://127.0.0.1:6379", isProduction: false });
  app.decorate("redis", redis);
  app.decorate("sandbox", {} as never);
  app.post("/internal/v1/ping", async (request, reply) => {
    const cap = await requireCapability(request, reply, "execute");
    if (!cap) return;
    return { ok: true, workspaceId: cap.workspaceId };
  });
  app.post("/internal/v1/term", async (request, reply) => {
    const cap = await requireCapability(request, reply, "terminal");
    if (!cap) return;
    return { ok: true };
  });
});

afterAll(async () => {
  await app.close();
  redis.disconnect();
});

const claims = { userId: "u", workspaceId: "w", storageKey: "ws_key12345", scope: "execute" as const };

async function post(url: string, token?: string) {
  return app.inject({
    method: "POST",
    url,
    headers: token ? { "x-runner-capability": token } : {},
  });
}

describe("runner capability enforcement", () => {
  it("rejects missing token", async () => {
    const res = await post("/internal/v1/ping");
    expect(res.statusCode).toBe(401);
  });

  it("rejects tampered token", async () => {
    const { token } = signCapability(SECRET, claims);
    const bad = token.slice(0, -2) + "xx";
    const res = await post("/internal/v1/ping", bad);
    expect(res.statusCode).toBe(403);
  });

  it("rejects wrong scope", async () => {
    const { token } = signCapability(SECRET, claims);
    const res = await post("/internal/v1/term", token);
    expect(res.statusCode).toBe(403);
  });

  it("accepts valid token once, rejects replay", async () => {
    const { token } = signCapability(SECRET, claims);
    const r1 = await post("/internal/v1/ping", token);
    expect(r1.statusCode).toBe(200);
    const r2 = await post("/internal/v1/ping", token);
    expect(r2.statusCode).toBe(401);
    expect(r2.json().error).toContain("replayed");
  });

  it("rejects expired token", async () => {
    const { token } = signCapability(SECRET, claims, { ttlMs: 1, now: Date.now() - 10 });
    const res = await post("/internal/v1/ping", token);
    expect(res.statusCode).toBe(401);
  });
});
