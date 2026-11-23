import type { PrismaClient } from "@prisma/client";
import { AppError } from "../lib/errors.js";

/**
 * Centralized workspace authorization. Callers must NEVER trust a
 * workspaceId alone — ownership (or membership) is always verified here.
 * Cross-tenant access returns 404 (not 403) to avoid confirming the
 * existence of other users' resources.
 */
export async function assertWorkspaceAccess(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
): Promise<{ id: string; ownerId: string; storageKey: string }> {
  const ws = await prisma.workspace.findFirst({
    where: { id: workspaceId, deletedAt: null },
    select: { id: true, ownerId: true, storageKey: true },
  });
  if (!ws) throw AppError.notFound("WORKSPACE_NOT_FOUND", "Workspace not found");

  if (ws.ownerId === userId) return ws;

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!member) throw AppError.notFound("WORKSPACE_NOT_FOUND", "Workspace not found");
  return ws;
}
