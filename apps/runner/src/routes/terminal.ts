import type { FastifyInstance } from "fastify";
import { z } from "zod";
import Docker from "dockerode";
import { requireCapability } from "../auth/capability.js";
import type { SandboxManager } from "../sandbox/manager.js";
import { needsBuildTmpfs, getRuntime } from "@ide/sandbox";

const TerminalCreateSchema = z.object({
  workspaceKey: z.string().regex(/^[a-zA-Z0-9_-]{8,64}$/),
  cols: z.number().int().min(20).max(300).default(120),
  rows: z.number().int().min(5).max(120).default(30),
  terminalId: z.string().min(8).max(64),
});

interface TermSession {
  stream: NodeJS.ReadWriteStream & { destroy(): void };
  exec: { resize: (o: { h: number; w: number }) => Promise<unknown> };
  containerId: string;
  workspaceKey: string;
}

export async function terminalRoutes(app: FastifyInstance): Promise<void> {
  const sessions = new Map<string, TermSession>();
  app.decorate("terminalSessions", sessions);

  const docker = new Docker({ socketPath: "/var/run/docker.sock" });

  app.post("/internal/v1/terminal", async (request, reply) => {
    const cap = await requireCapability(request, reply, "terminal");
    if (!cap) return;
    const body = TerminalCreateSchema.parse(request.body);
    if (body.workspaceKey !== cap.storageKey) {
      return reply.status(403).send({ error: "workspace mismatch" });
    }
    if (!cap.workspaceHostPath) {
      return reply.status(400).send({ error: "missing workspace path" });
    }

    const manager = app.sandbox as SandboxManager;
    const rt = getRuntime("javascript"); // generic POSIX shell image
    const containerId = await manager.createIdle(
      {
        image: rt.image,
        workspaceHostPath: cap.workspaceHostPath,
        needsBuildTmpfs: needsBuildTmpfs(rt),
        env: [],
      },
      body.workspaceKey,
    );
    const container = docker.getContainer(containerId);
    await container.start();

    const exec = await container.exec({
      Cmd: ["sh", "-l"],
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      Env: ["HOME=/tmp", "TERM=xterm-256color"],
      WorkingDir: "/workspace",
    });
    const stream = (await exec.start({ hijack: true, stdin: true })) as TermSession["stream"];
    stream.on("data", (chunk: Buffer) => {
      void app.redis
        .publish(
          `term:${body.terminalId}`,
          JSON.stringify({ type: "data", data: chunk.toString("utf8") }),
        )
        .catch(() => {});
    });
    stream.on("close", () => {
      void app.redis
        .publish(`term:${body.terminalId}`, JSON.stringify({ type: "exit", exitCode: null }))
        .catch(() => {});
    });

    sessions.set(body.terminalId, {
      stream,
      exec: exec as unknown as TermSession["exec"],
      containerId,
      workspaceKey: body.workspaceKey,
    });
    return reply.send({ terminalId: body.terminalId, containerId });
  });

  app.post("/internal/v1/terminal/:id/input", async (request, reply) => {
    const cap = await requireCapability(request, reply, "terminal");
    if (!cap) return;
    const s = sessions.get((request.params as { id: string }).id);
    if (!s) return reply.status(404).send({ error: "terminal not found" });
    const { data } = z.object({ data: z.string().max(16 * 1024) }).parse(request.body);
    s.stream.write(data);
    return { ok: true };
  });

  app.post("/internal/v1/terminal/:id/resize", async (request, reply) => {
    const cap = await requireCapability(request, reply, "terminal");
    if (!cap) return;
    const s = sessions.get((request.params as { id: string }).id);
    if (!s) return reply.status(404).send({ error: "terminal not found" });
    const { cols, rows } = z
      .object({
        cols: z.number().int().min(20).max(300),
        rows: z.number().int().min(5).max(120),
      })
      .parse(request.body);
    await s.exec.resize({ h: rows, w: cols });
    return { ok: true };
  });

  app.delete("/internal/v1/terminal/:id", async (request, reply) => {
    const cap = await requireCapability(request, reply, "terminal");
    if (!cap) return;
    const id = (request.params as { id: string }).id;
    const s = sessions.get(id);
    if (s) {
      s.stream.destroy();
      sessions.delete(id);
      await (app.sandbox as SandboxManager).destroy(s.containerId).catch(() => {});
    }
    return { ok: true };
  });
}

declare module "fastify" {
  interface FastifyInstance {
    terminalSessions: Map<string, TermSession>;
  }
}
