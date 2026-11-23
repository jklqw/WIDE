import type { FastifyInstance } from "fastify";
import { CreateExecutionRequestSchema, ExecutionJobSchema } from "@ide/contracts";
import { languageForPath as langForPath } from "@ide/sandbox";
import { AppError } from "../lib/errors.js";
import { assertWorkspaceAccess } from "../services/authorization.js";
import { mintCapability, runnerFetch } from "../services/runner-client.js";

const MAX_CONCURRENT_RUNS = 2;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;

// Simple in-memory sliding windows (per user). Documented limitation:
// per-instance only; Redis-backed limiter lands with production scaling.
const runTimestamps = new Map<string, number[]>();
const activeRuns = new Map<string, number>();

function toJob(j: {
  id: string; workspaceId: string; sourcePath: string; languageId: string;
  status: string; queuedAt: Date; startedAt: Date | null; finishedAt: Date | null;
  compileDurationMs: number | null; durationMs: number | null;
  exitCode: number | null; resourceLimitReason: string | null; outputBytes: number;
}) {
  return ExecutionJobSchema.parse({
    id: j.id, workspaceId: j.workspaceId, sourcePath: j.sourcePath,
    languageId: j.languageId, status: j.status.toLowerCase(),
    queuedAt: j.queuedAt.toISOString(),
    startedAt: j.startedAt?.toISOString() ?? null,
    finishedAt: j.finishedAt?.toISOString() ?? null,
    compileDurationMs: j.compileDurationMs, durationMs: j.durationMs,
    exitCode: j.exitCode, resourceLimitReason: j.resourceLimitReason,
    outputBytes: j.outputBytes,
  });
}

const STATUS_MAP: Record<string, string> = {
  completed: "COMPLETED", failed: "FAILED", timed_out: "TIMED_OUT",
  resource_limited: "RESOURCE_LIMITED", cancelled: "CANCELLED",
};

export async function executionRoutes(app: FastifyInstance): Promise<void> {
  const authed = { preHandler: app.requireAuth };

  app.post("/api/v1/workspaces/:workspaceId/executions", authed, async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const body = CreateExecutionRequestSchema.parse(request.body);
    const userId = request.user!.id;
    const ws = await assertWorkspaceAccess(app.prisma, userId, workspaceId);

    // Rate limit: 20 runs/min/user.
    const now = Date.now();
    const ts = (runTimestamps.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
    ts.push(now);
    runTimestamps.set(userId, ts);
    if (ts.length > RATE_MAX) {
      throw AppError.tooMany("EXEC_RATE_LIMIT", "Too many executions; slow down");
    }
    if ((activeRuns.get(userId) ?? 0) >= MAX_CONCURRENT_RUNS) {
      throw AppError.tooMany("EXEC_CONCURRENT", "Too many concurrent executions");
    }

    const languageId = langForPath(body.sourcePath);
    if (!languageId) {
      throw AppError.badRequest("UNSUPPORTED_LANGUAGE", "File extension has no runnable language");
    }

    const job = await app.prisma.executionJob.create({
      data: {
        workspaceId: ws.id, userId, sourcePath: body.sourcePath,
        languageId, status: "QUEUED",
      },
    });

    activeRuns.set(userId, (activeRuns.get(userId) ?? 0) + 1);
    void (async () => {
      try {
        await app.prisma.executionJob.update({
          where: { id: job.id },
          data: { status: "PREPARING", startedAt: new Date() },
        });
        const { token } = mintCapability(app, {
          userId, workspaceId: ws.id, storageKey: ws.storageKey,
          scope: "execute",
          workspaceHostPath: `${app.env.WORKSPACE_STORAGE_ROOT}/${ws.storageKey}`,
        });
        const { status, json } = await runnerFetch(
          app,
          "/internal/v1/execute",
          {
            workspaceKey: ws.storageKey,
            sourcePath: body.sourcePath,
            languageId,
            stdin: body.stdin,
            jobId: job.id,
          },
          token,
        );
        const result = (json ?? {}) as Record<string, unknown>;
        if (status !== 200) {
          throw new Error(`runner error ${status}`);
        }
        const finalStatus = (STATUS_MAP[String(result.status)] ??
          (result.exitCode === 0 ? "COMPLETED" : "FAILED")) as never;
        const diagnostics = Array.isArray(result.diagnostics) ? result.diagnostics : [];
        await app.prisma.executionJob.update({
          where: { id: job.id },
          data: {
            status: finalStatus,
            finishedAt: new Date(),
            compileDurationMs: (result.compileDurationMs as number) ?? null,
            durationMs: (result.durationMs as number) ?? null,
            exitCode: (result.exitCode as number) ?? null,
            resourceLimitReason:
              result.timedOut ? "timeout" : result.outputTruncated ? "output_limit" : null,
            outputBytes: Buffer.byteLength(
              String(result.stdout ?? "") + String(result.stderr ?? ""),
            ),
          },
        });
        void diagnostics;
        await app.redis.publish(
          `exec:${job.id}`,
          JSON.stringify({
            type: "job_finished",
            status: String(result.status ?? "completed"),
          }),
        ).catch(() => {});
      } catch (err) {
        app.log.error({ err, jobId: job.id }, "execution failed");
        await app.prisma.executionJob.update({
          where: { id: job.id },
          data: { status: "FAILED", finishedAt: new Date() },
        }).catch(() => {});
        await app.redis.publish(
          `exec:${job.id}`,
          JSON.stringify({ type: "error", code: "EXECUTION_ERROR", message: "Execution failed" }),
        ).catch(() => {});
      } finally {
        activeRuns.set(userId, Math.max(0, (activeRuns.get(userId) ?? 1) - 1));
      }
    })();

    return reply.status(202).send(toJob(job));
  });

  app.get("/api/v1/executions/:jobId", authed, async (request) => {
    const { jobId } = request.params as { jobId: string };
    const job = await app.prisma.executionJob.findUnique({ where: { id: jobId } });
    if (!job) throw AppError.notFound("JOB_NOT_FOUND", "Execution not found");
    await assertWorkspaceAccess(app.prisma, request.user!.id, job.workspaceId);
    return toJob(job);
  });

  app.post("/api/v1/executions/:jobId/cancel", authed, async (request) => {
    const { jobId } = request.params as { jobId: string };
    const job = await app.prisma.executionJob.findUnique({ where: { id: jobId } });
    if (!job) throw AppError.notFound("JOB_NOT_FOUND", "Execution not found");
    await assertWorkspaceAccess(app.prisma, request.user!.id, job.workspaceId);
    if (["COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT", "RESOURCE_LIMITED"].includes(job.status)) {
      return toJob(job);
    }
    await app.prisma.executionJob.update({
      where: { id: job.id },
      data: { status: "CANCELLED", finishedAt: new Date() },
    });
    await app.redis.publish(
      `exec:${job.id}`,
      JSON.stringify({ type: "status", status: "cancelled" }),
    ).catch(() => {});
    return toJob(await app.prisma.executionJob.findUniqueOrThrow({ where: { id: job.id } }));
  });

  // Live event stream: subscribes to Redis exec:<jobId> pub/sub channel.
  app.get("/api/v1/executions/:jobId/stream", { websocket: true }, async (socket, request) => {
    const { jobId } = request.params as { jobId: string };
    // Auth via session cookie on the WS upgrade request.
    const { lookupSession, SESSION_COOKIE } = await import("../services/sessions.js");
    const cookies = (request.headers.cookie ?? "").split(";").map((c) => c.trim());
    const sessionCookie = cookies.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
    const token = sessionCookie?.slice(SESSION_COOKIE.length + 1);
    const ctx = token ? await lookupSession(app.prisma, decodeURIComponent(token)) : null;
    if (!ctx) {
      socket.close(4401, "unauthorized");
      return;
    }
    const job = await app.prisma.executionJob.findUnique({ where: { id: jobId } });
    if (!job) {
      socket.close(4404, "not found");
      return;
    }
    try {
      await assertWorkspaceAccess(app.prisma, ctx.user.id, job.workspaceId);
    } catch {
      socket.close(4403, "forbidden");
      return;
    }

    const sub = app.redis.duplicate();
    await sub.subscribe(`exec:${jobId}`);
    sub.on("message", (_ch, msg) => {
      try {
        socket.send(msg);
      } catch {
        /* socket closed */
      }
    });
    socket.on("close", () => {
      void sub.unsubscribe(`exec:${jobId}`).finally(() => sub.disconnect());
    });
    socket.on("message", (raw: Buffer | string) => {
      // Client may send {"type":"ping"} — respond pong.
      try {
        const m = JSON.parse(String(raw));
        if (m?.type === "ping") socket.send(JSON.stringify({ type: "pong" }));
      } catch {
        /* ignore malformed */
      }
    });
    // Send current job snapshot immediately.
    socket.send(JSON.stringify({ type: "job", job: toJob(job) }));
  });
}
