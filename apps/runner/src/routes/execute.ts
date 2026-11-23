import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getRuntime,
  javaMainClass,
  parseDiagnostics,
  resolveArgv,
} from "@ide/sandbox";
import type { LanguageId } from "@ide/contracts";
import { requireCapability } from "../auth/capability.js";
import type { SandboxManager } from "../sandbox/manager.js";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ExecuteRequestSchema = z.object({
  workspaceKey: z.string().regex(/^[a-zA-Z0-9_-]{8,64}$/),
  /** Workspace-relative source path, e.g. "main.py". */
  sourcePath: z.string().min(1).max(1024),
  languageId: z.enum(["python", "javascript", "typescript", "c", "cpp", "java", "go"]),
  stdin: z.string().max(64 * 1024).optional(),
  jobId: z.string().optional(),
});

function compilerKindFor(lang: LanguageId) {
  switch (lang) {
    case "c":
    case "cpp":
      return "gcc" as const;
    case "java":
      return "javac" as const;
    case "go":
      return "go" as const;
    case "typescript":
      return "tsc" as const;
    default:
      return "python" as const;
  }
}

export async function executeRoutes(app: FastifyInstance): Promise<void> {
  const manager = app.sandbox as SandboxManager;

  app.post("/internal/v1/execute", async (request, reply) => {
    const cap = await requireCapability(request, reply, "execute");
    if (!cap) return;

    const body = ExecuteRequestSchema.parse(request.body);
    // Capability binds the workspace; client cannot pick another.
    if (body.workspaceKey !== cap.storageKey) {
      return reply.status(403).send({ error: "workspace mismatch" });
    }

    const rt = getRuntime(body.languageId);
    const wsHost = cap.workspaceHostPath ?? manager.workspacePath(body.workspaceKey);
    const wsContainer = "/workspace";
    const fileInSandbox = `${wsContainer}/${body.sourcePath}`;

    // Sanity: sourcePath must be relative, no traversal.
    if (body.sourcePath.includes("..") || path.isAbsolute(body.sourcePath)) {
      return reply.status(400).send({ error: "invalid sourcePath" });
    }

    const needsCompile = rt.buildArgv !== null;
    const maxOut = rt.maxOutputBytes;

    const publish = async (event: Record<string, unknown>) => {
      if (body.jobId) {
        await app.redis.publish(`exec:${body.jobId}`, JSON.stringify(event)).catch(() => {});
      }
    };

    await publish({ type: "status", status: "preparing" });

    let compileDurationMs: number | undefined;
    let compileDiags: unknown[] = [];

    // Single sandbox container for compile+run so /tmp/build persists.
    const containerId = await manager.createIdle(
      {
        image: rt.image,
        workspaceHostPath: wsHost,
        needsBuildTmpfs: needsCompile,
        env: [],
      },
      body.workspaceKey,
    );

    try {
      if (needsCompile) {
        let className: string | undefined;
        if (body.languageId === "java") {
          try {
            const src = await readFile(path.join(wsHost, body.sourcePath), "utf8");
            className = javaMainClass(src, body.sourcePath);
          } catch {
            className = body.sourcePath.split("/").pop()?.replace(/\.java$/, "") ?? "Main";
          }
        }
        const buildArgv = resolveArgv(rt.buildArgv!, rt, fileInSandbox, className);
        const t0 = Date.now();
        await publish({ type: "status", status: "running" });
        const compile = await manager.execRun(containerId, buildArgv, {
          timeoutMs: rt.compileTimeoutMs,
          maxOutputBytes: maxOut,
          onChunk: (s, chunk) =>
            void publish({ type: s, data: chunk.toString("utf8") }),
        });
        compileDurationMs = Date.now() - t0;
        compileDiags = parseDiagnostics(compilerKindFor(body.languageId), compile.stderr + "\n" + compile.stdout);
        if (compile.exitCode !== 0 || compile.timedOut) {
          await publish({
            type: "compile_diagnostics",
            diagnostics: compileDiags,
            compileDurationMs,
          });
          await publish({ type: "stderr", data: compile.stderr });
          await publish({
            type: "completed",
            exitCode: compile.exitCode,
            durationMs: compile.durationMs,
            compileDurationMs,
          });
          return reply.send({
            ok: false,
            phase: "compile",
            exitCode: compile.exitCode,
            timedOut: compile.timedOut,
            diagnostics: compileDiags,
            stderr: compile.stderr,
            compileDurationMs,
          });
        }
        if (compileDiags.length > 0) {
          await publish({ type: "compile_diagnostics", diagnostics: compileDiags, compileDurationMs });
        }
      }

      const runArgv = resolveArgv(rt.runArgv, rt, fileInSandbox);
      await publish({ type: "status", status: "running" });
      const run = await manager.execRun(containerId, runArgv, {
        timeoutMs: rt.runTimeoutMs,
        maxOutputBytes: maxOut,
        ...(body.stdin !== undefined ? { stdin: body.stdin } : {}),
        onChunk: (s, chunk) => void publish({ type: s, data: chunk.toString("utf8") }),
      });

      // Stream captured output as events (runner already buffered it; for
      // live streaming the terminal path uses PTY — executions publish the
      // final payload, API replays to WS subscribers).
      if (run.stdout) await publish({ type: "stdout", data: run.stdout });
      if (run.stderr) await publish({ type: "stderr", data: run.stderr });

      const status = run.timedOut
        ? "timed_out"
        : run.outputTruncated
          ? "resource_limited"
          : run.exitCode === 0
            ? "completed"
            : "failed";

      await publish({
        type: "completed",
        exitCode: run.exitCode,
        durationMs: run.durationMs,
        compileDurationMs,
        status,
      });

      return reply.send({
        ok: run.exitCode === 0 && !run.timedOut && !run.outputTruncated,
        phase: "run",
        status,
        exitCode: run.exitCode,
        timedOut: run.timedOut,
        outputTruncated: run.outputTruncated,
        stdout: run.stdout,
        stderr: run.stderr,
        durationMs: run.durationMs,
        compileDurationMs,
        diagnostics: compileDiags,
      });
    } finally {
      await manager.destroy(containerId).catch(() => {});
    }
  });
}
