import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyCapability, type CapabilityPayload } from "@ide/sandbox";
import type { Redis } from "ioredis";

declare module "fastify" {
  interface FastifyRequest {
    capability?: CapabilityPayload;
  }
}

/**
 * Verifies the X-Runner-Capability header: HMAC signature, expiry, scope,
 * and single-use jti replay protection via Redis SET NX EX.
 */
export async function requireCapability(
  request: FastifyRequest,
  reply: FastifyReply,
  scope: CapabilityPayload["scope"],
): Promise<CapabilityPayload> {
  const token = request.headers["x-runner-capability"];
  const header = Array.isArray(token) ? token[0] : token;
  if (!header) {
    return reply.status(401).send({ error: "missing capability" });
  }
  const result = verifyCapability(
    request.server.env.RUNNER_SHARED_SECRET,
    header,
    scope,
  );
  if (!result.ok) {
    const status = result.reason === "expired" ? 401 : 403;
    return reply.status(status).send({ error: `capability ${result.reason}` });
  }

  // Single-use jti replay protection.
  const redis = request.server.redis as Redis | undefined;
  if (redis) {
    try {
      const key = `cap:jti:${result.payload.jti}`;
      const ok = await redis.set(key, "1", "PX", result.payload.exp - Date.now(), "NX");
      if (ok !== "OK") {
        return reply.status(401).send({ error: "capability replayed" });
      }
    } catch {
      // Redis down: fail closed for execute/terminal scopes.
      return reply.status(503).send({ error: "capability store unavailable" });
    }
  }

  request.capability = result.payload;
  return result.payload;
}
