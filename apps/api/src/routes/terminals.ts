import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import {
  CreateTerminalRequestSchema,
  TerminalClientMessageSchema,
} from "@ide/contracts";
import { AppError } from "../lib/errors.js";
import { assertWorkspaceAccess } from "../services/authorization.js";
import { mintCapability, runnerFetch } from "../services/runner-client.js";

const MAX_TERMINALS_PER_WORKSPACE = 2;
const TICKET_TTL_S = 30;

// In-memory ticket store (single API instance; Redis for multi-instance).
const tickets = new Map<string, { terminalId: string; workspaceId: string; userId: string; expires: number }>();

export async function terminalApiRoutes(app: FastifyInstance): Promise<void> {
  const authed = { preHandler: app.requireAuth };

  app.post("/api/v1/workspaces/:workspaceId/terminals", authed, async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const body = CreateTerminalRequestSchema.parse(request.body ?? {});
    const userId = request.user!.id;
    const ws = await assertWorkspaceAccess(app.prisma, userId, workspaceId);

    const active = await app.prisma.terminalSession.count({
      where: { workspaceId: ws.id, status: "active" },
    });
    if (active >= MAX_TERMINALS_PER_WORKSPACE) {
      throw AppError.tooMany("TERMINAL_QUOTA", "Terminal session limit reached");
    }

    const terminalId = `term_${randomBytes(12).toString("base64url")}`;
    const { token } = mintCapability(app, {
      userId, workspaceId: ws.id, storageKey: ws.storageKey, scope: "terminal",
      workspaceHostPath: `${app.env.WORKSPACE_STORAGE_ROOT}/${ws.storageKey}`,
    });
    const { status, json } = await runnerFetch(
      app, "/internal/v1/terminal",
      { workspaceKey: ws.storageKey, cols: body.cols, rows: body.rows, terminalId },
      token,
    );
    if (status !== 200) throw AppError.internal("Failed to start terminal sandbox");
    void json;

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const session = await app.prisma.terminalSession.create({
      data: {
        id: terminalId, workspaceId: ws.id, userId,
        status: "active", expiresAt,
      },
    });

    // Single-use WS ticket.
    const ticket = randomBytes(24).toString("base64url");
    tickets.set(ticket, {
      terminalId, workspaceId: ws.id, userId,
      expires: Date.now() + TICKET_TTL_S * 1000,
    });

    return reply.status(201).send({
      id: session.id, workspaceId: ws.id, status: "active",
      createdAt: session.createdAt.toISOString(),
      ticket, ticketTtlSeconds: TICKET_TTL_S,
    });
  });

  app.get("/api/v1/workspaces/:workspaceId/terminals", authed, async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const ws = await assertWorkspaceAccess(app.prisma, request.user!.id, workspaceId);
    const sessions = await app.prisma.terminalSession.findMany({
      where: { workspaceId: ws.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return {
      terminals: sessions.map((s) => ({
        id: s.id, workspaceId: s.workspaceId, status: s.status,
        createdAt: s.createdAt.toISOString(),
      })),
    };
  });

  app.delete("/api/v1/terminals/:terminalId", authed, async (request, reply) => {
    const { terminalId } = request.params as { terminalId: string };
    const session = await app.prisma.terminalSession.findUnique({ where: { id: terminalId } });
    if (!session) throw AppError.notFound("TERMINAL_NOT_FOUND", "Terminal not found");
    await assertWorkspaceAccess(app.prisma, request.user!.id, session.workspaceId);

    const ws = await app.prisma.workspace.findUnique({ where: { id: session.workspaceId } });
    if (ws) {
      const { token } = mintCapability(app, {
        userId: request.user!.id, workspaceId: ws.id, storageKey: ws.storageKey,
        scope: "terminal",
        workspaceHostPath: `${app.env.WORKSPACE_STORAGE_ROOT}/${ws.storageKey}`,
      });
      await runnerFetch(app, `/internal/v1/terminal/${terminalId}`, {}, token)
        .catch(() => {});
      // DELETE via fetch helper is POST-shaped; call method directly:
      const base = process.env.RUNNER_INTERNAL_URL ?? "http://127.0.0.1:3002";
      await fetch(`${base}/internal/v1/terminal/${terminalId}`, {
        method: "DELETE",
        headers: { "x-runner-capability": token },
      }).catch(() => {});
    }
    await app.prisma.terminalSession.update({
      where: { id: terminalId },
      data: { status: "closed", closedAt: new Date() },
    });
    return reply.status(204).send();
  });

  // WebSocket bridge: /api/v1/terminals/:id/stream?ticket=...
  app.get("/api/v1/terminals/:terminalId/stream", { websocket: true }, async (socket, request) => {
    const { terminalId } = request.params as { terminalId: string };
    const url = new URL(request.url, "http://x");
    const ticket = url.searchParams.get("ticket") ?? "";
    const t = tickets.get(ticket);
    tickets.delete(ticket); // single-use
    if (!t || t.expires < Date.now() || t.terminalId !== terminalId) {
      socket.close(4401, "invalid ticket");
      return;
    }
    const session = await app.prisma.terminalSession.findUnique({ where: { id: terminalId } });
    if (!session || session.userId !== t.userId || session.status !== "active") {
      socket.close(4403, "forbidden");
      return;
    }

    // Output: subscribe Redis term:<id>.
    const sub = app.redis.duplicate();
    await sub.subscribe(`term:${terminalId}`);
    const MAX_BUFFER = 512 * 1024;
    sub.on("message", (_ch, msg) => {
      try {
        if (socket.bufferedAmount > MAX_BUFFER) return; // backpressure: drop
        socket.send(msg);
      } catch { /* ignore */ }
    });

    socket.on("message", async (raw: Buffer | string) => {
      try {
        const m = TerminalClientMessageSchema.parse(JSON.parse(String(raw)));
        const ws = await app.prisma.workspace.findUnique({ where: { id: session.workspaceId } });
        if (!ws) return;
        const { token } = mintCapability(app, {
          userId: t.userId, workspaceId: ws.id, storageKey: ws.storageKey,
          scope: "terminal",
          workspaceHostPath: `${app.env.WORKSPACE_STORAGE_ROOT}/${ws.storageKey}`,
        });
        const base = process.env.RUNNER_INTERNAL_URL ?? "http://127.0.0.1:3002";
        if (m.type === "input") {
          await fetch(`${base}/internal/v1/terminal/${terminalId}/input`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-runner-capability": token },
            body: JSON.stringify({ data: m.data }),
          });
        } else if (m.type === "resize") {
          await fetch(`${base}/internal/v1/terminal/${terminalId}/resize`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-runner-capability": token },
            body: JSON.stringify({ cols: m.cols, rows: m.rows }),
          });
        } else if (m.type === "ping") {
          socket.send(JSON.stringify({ type: "pong" }));
        }
      } catch { /* malformed frame */ }
    });
    socket.on("close", () => {
      void sub.unsubscribe(`term:${terminalId}`).finally(() => sub.disconnect());
      void app.prisma.terminalSession.update({
        where: { id: terminalId },
        data: { lastActivityAt: new Date() },
      }).catch(() => {});
    });
    socket.send(JSON.stringify({ type: "data", data: "\x1b[?2004h" }));
  });
}
