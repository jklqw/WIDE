import type { PrismaClient } from "@prisma/client";

export type AuditAction =
  | "auth.register"
  | "auth.login.success"
  | "auth.login.failure"
  | "auth.logout"
  | "workspace.create"
  | "workspace.delete"
  | "workspace.rename";

export async function audit(
  prisma: PrismaClient,
  entry: {
    action: AuditAction | string;
    outcome: "success" | "failure" | "denied";
    userId?: string | null;
    workspaceId?: string | null;
    requestId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await prisma.auditEvent.create({
      data: {
        action: entry.action,
        outcome: entry.outcome,
        userId: entry.userId ?? null,
        workspaceId: entry.workspaceId ?? null,
        requestId: entry.requestId ?? null,
        metadataJson: entry.metadata ? JSON.parse(JSON.stringify(entry.metadata)) : undefined,
      },
    });
  } catch {
    // Audit must never break the request path.
  }
}
