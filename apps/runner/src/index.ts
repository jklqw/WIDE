import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { loadRunnerEnv, type RunnerEnv } from "./config/env.js";
import { SandboxManager } from "./sandbox/manager.js";
import { executeRoutes } from "./routes/execute.js";
import { terminalRoutes } from "./routes/terminal.js";
import { Redis } from "ioredis";

declare module "fastify" {
  interface FastifyInstance {
    env: RunnerEnv;
    sandbox: SandboxManager;
    redis: Redis;
  }
}

async function main() {
  const env = loadRunnerEnv();
  const manager = new SandboxManager(env);
  manager.startReaper();

  const redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    lazyConnect: true,
  });
  redis.on("error", (err) => console.error("redis error:", err.message));

  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      redact: {
        paths: ["req.headers.authorization", "*.token", "*.secret"],
        censor: "[redacted]",
      },
      genReqId: () => randomUUID(),
    },
    trustProxy: false,
    bodyLimit: 1024 * 1024,
  });

  app.decorate("env", env);
  app.decorate("sandbox", manager);
  app.decorate("redis", redis);

  app.get("/health", async () => ({
    status: "ok",
    service: "runner",
    isolation: env.SANDBOX_OCI_RUNTIME || "runc",
    timestamp: new Date().toISOString(),
  }));

  await app.register(executeRoutes);
  await app.register(terminalRoutes);

  app.get("/ready", async (_request, reply) => {
    try {
      await app.sandbox.reap();
      return { status: "ready", service: "runner" };
    } catch (err) {
      return reply.status(503).send({
        status: "degraded",
        error: (err as Error).message,
      });
    }
  });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "runner shutting down");
    manager.stopReaper();
    await app.close();
    redis.disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ host: env.RUNNER_HOST, port: env.RUNNER_PORT });
  app.log.info(
    { port: env.RUNNER_PORT, host: env.RUNNER_HOST, oci: env.SANDBOX_OCI_RUNTIME || "runc" },
    "runner listening",
  );
}

main().catch((err) => {
  console.error("fatal runner startup error:", err);
  process.exit(1);
});
