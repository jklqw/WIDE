import { loadEnv } from "./config/env.js";
import { buildApp } from "./app.js";
import { createPrismaClient } from "@ide/database";
import { Redis } from "ioredis";

async function main() {
  const env = loadEnv();
  const prisma = createPrismaClient(env.DATABASE_URL);
  const redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    lazyConnect: true,
  });
  redis.on("error", (err) => {
    // Logged via console fallback; Fastify logger not yet attached.
    console.error("redis error:", err.message);
  });

  const app = await buildApp({ env, prisma, redis });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    await prisma.$disconnect();
    redis.disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ host: env.API_HOST, port: env.API_PORT });
  app.log.info(
    { port: env.API_PORT, host: env.API_HOST },
    "api listening",
  );
}

main().catch((err) => {
  console.error("fatal startup error:", err);
  process.exit(1);
});
