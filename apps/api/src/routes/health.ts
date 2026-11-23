import type { FastifyInstance } from "fastify";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/health", async () => ({
    status: "ok",
    service: "api",
    timestamp: new Date().toISOString(),
  }));

  app.get("/api/v1/ready", async (request, reply) => {
    const checks: Record<string, string> = {};
    let ok = true;

    try {
      await request.server.prisma.$queryRaw`SELECT 1`;
      checks.postgres = "ok";
    } catch {
      checks.postgres = "error";
      ok = false;
    }

    try {
      const pong = await request.server.redis.ping();
      checks.redis = pong === "PONG" ? "ok" : "error";
      if (pong !== "PONG") ok = false;
    } catch {
      checks.redis = "error";
      ok = false;
    }

    return reply.status(ok ? 200 : 503).send({
      status: ok ? "ready" : "degraded",
      checks,
      timestamp: new Date().toISOString(),
    });
  });
}
