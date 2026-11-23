import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import {
  CreateWorkspaceRequestSchema,
  UpdateWorkspaceRequestSchema,
  WorkspaceListQuerySchema,
  WorkspaceSummarySchema,
} from "@ide/contracts";
import { getTemplate } from "@ide/database";
import { AppError } from "../lib/errors.js";
import { assertWorkspaceAccess } from "../services/authorization.js";
import { audit } from "../services/audit.js";
import { hydrateWorkspace } from "../services/workspace-storage.js";
import { rm } from "node:fs/promises";
import path from "node:path";

const MAX_WORKSPACES_PER_USER = 20;

function toSummary(ws: {
  id: string;
  name: string;
  description: string | null;
  templateId: string;
  runtimePreference: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return WorkspaceSummarySchema.parse({
    id: ws.id,
    name: ws.name,
    description: ws.description,
    templateId: ws.templateId,
    runtimePreference: ws.runtimePreference,
    createdAt: ws.createdAt.toISOString(),
    updatedAt: ws.updatedAt.toISOString(),
  });
}

export async function workspaceRoutes(app: FastifyInstance): Promise<void> {
  const authed = { preHandler: app.requireAuth };

  app.get("/api/v1/workspaces", authed, async (request) => {
    const query = WorkspaceListQuerySchema.parse(request.query ?? {});
    const userId = request.user!.id;
    const workspaces = await app.prisma.workspace.findMany({
      where: {
        ownerId: userId,
        deletedAt: null,
        ...(query.q
          ? { name: { contains: query.q, mode: "insensitive" } }
          : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    return { workspaces: workspaces.map(toSummary) };
  });

  app.post("/api/v1/workspaces", authed, async (request, reply) => {
    const body = CreateWorkspaceRequestSchema.parse(request.body);
    const userId = request.user!.id;

    const count = await app.prisma.workspace.count({
      where: { ownerId: userId, deletedAt: null },
    });
    if (count >= MAX_WORKSPACES_PER_USER) {
      throw AppError.tooMany(
        "WORKSPACE_QUOTA",
        `Workspace limit reached (${MAX_WORKSPACES_PER_USER})`,
      );
    }

    const template = getTemplate(body.templateId) ?? getTemplate("blank")!;
    const storageKey = `ws_${randomBytes(12).toString("base64url")}`;

    const ws = await app.prisma.workspace.create({
      data: {
        ownerId: userId,
        name: body.name,
        description: body.description ?? null,
        templateId: template.id,
        storageKey,
      },
    });

    try {
      await hydrateWorkspace(app.env.WORKSPACE_STORAGE_ROOT, storageKey, template.files);
    } catch (err) {
      // Roll back the DB row if hydration fails.
      await app.prisma.workspace.delete({ where: { id: ws.id } });
      throw err;
    }

    await audit(app.prisma, {
      action: "workspace.create",
      outcome: "success",
      userId,
      workspaceId: ws.id,
      requestId: request.id,
      metadata: { templateId: template.id },
    });

    return reply.status(201).send(toSummary(ws));
  });

  app.get("/api/v1/workspaces/:workspaceId", authed, async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const ws = await assertWorkspaceAccess(app.prisma, request.user!.id, workspaceId);
    const full = await app.prisma.workspace.findUniqueOrThrow({ where: { id: ws.id } });
    return toSummary(full);
  });

  app.patch("/api/v1/workspaces/:workspaceId", authed, async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const body = UpdateWorkspaceRequestSchema.parse(request.body);
    const ws = await assertWorkspaceAccess(app.prisma, request.user!.id, workspaceId);

    const updated = await app.prisma.workspace.update({
      where: { id: ws.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.runtimePreference !== undefined
          ? { runtimePreference: body.runtimePreference }
          : {}),
      },
    });

    if (body.name !== undefined) {
      await audit(app.prisma, {
        action: "workspace.rename",
        outcome: "success",
        userId: request.user!.id,
        workspaceId: ws.id,
        requestId: request.id,
      });
    }
    return toSummary(updated);
  });

  app.delete("/api/v1/workspaces/:workspaceId", authed, async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const ws = await assertWorkspaceAccess(app.prisma, request.user!.id, workspaceId);

    await app.prisma.workspace.update({
      where: { id: ws.id },
      data: { deletedAt: new Date() },
    });

    // Best-effort cleanup of on-disk storage and any live sandboxes.
    try {
      const root = path.resolve(app.env.WORKSPACE_STORAGE_ROOT, ws.storageKey);
      const base = path.resolve(app.env.WORKSPACE_STORAGE_ROOT);
      if (root.startsWith(base + path.sep)) {
        await rm(root, { recursive: true, force: true });
      }
    } catch {
      request.log.warn({ workspaceId }, "workspace storage cleanup failed");
    }

    await audit(app.prisma, {
      action: "workspace.delete",
      outcome: "success",
      userId: request.user!.id,
      workspaceId: ws.id,
      requestId: request.id,
    });

    return reply.status(204).send();
  });
}
