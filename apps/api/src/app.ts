import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import multipart from "@fastify/multipart";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import type { AppEnv } from "./config/env.js";
import { AppError } from "./lib/errors.js";
import { healthRoutes } from "./routes/health.js";
import type { PrismaClient } from "@prisma/client";
import { Redis } from "ioredis";

export interface AppDeps {
  env: AppEnv;
  prisma?: PrismaClient;
  redis?: Redis;
}

declare module "fastify" {
  interface FastifyInstance {
    env: AppEnv;
    prisma: PrismaClient;
    redis: Redis;
  }
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { env } = deps;

  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "*.password",
          "*.token",
          "*.secret",
          "req.body.password",
          "req.body.token",
        ],
        censor: "[redacted]",
      },
      genReqId: () => randomUUID(),
    },
    trustProxy: false,
    bodyLimit: 5 * 1024 * 1024,
    requestIdHeader: "x-request-id",
  });

  app.decorate("env", env);
  if (deps.prisma) app.decorate("prisma", deps.prisma);
  if (deps.redis) app.decorate("redis", deps.redis);

  await app.register(helmet, {
    contentSecurityPolicy: false, // tuned later for the web app; API serves JSON
    crossOriginResourcePolicy: { policy: "same-site" },
  });
  await app.register(cors, {
    origin: env.WEB_ORIGIN.split(",").map((s) => s.trim()),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
    keyGenerator: (req) => req.ip,
  });
  await app.register(websocket);
  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 4 },
  });

  app.setErrorHandler((error, request, reply) => {
    const requestId = request.id;

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          requestId,
          ...(error.details !== undefined ? { details: error.details } : {}),
        },
      });
    }

    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          requestId,
          details: error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
      });
    }

    // Fastify/framework errors with statusCode (e.g. body too large)
    const statusCode =
      typeof (error as { statusCode?: number }).statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : 500;

    if (statusCode >= 500) {
      request.log.error({ err: error }, "unhandled error");
    }

    return reply.status(statusCode).send({
      error: {
        code: statusCode >= 500 ? "INTERNAL" : "REQUEST_ERROR",
        message:
          statusCode >= 500
            ? "Internal server error"
            : (error as Error).message || "Request error",
        requestId,
      },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    return reply.status(404).send({
      error: {
        code: "NOT_FOUND",
        message: `Route ${request.method} ${request.url} not found`,
        requestId: request.id,
      },
    });
  });

  await app.register(healthRoutes);

  return app;
}
