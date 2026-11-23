import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { PrismaClient, Session, User } from "@prisma/client";

export const SESSION_COOKIE = "webide_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url"); // 256-bit
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface SessionContext {
  session: Session;
  user: User;
}

export async function createSession(
  prisma: PrismaClient,
  userId: string,
  meta: { userAgent?: string | null; ipHash?: string | null } = {},
): Promise<{ token: string; session: Session }> {
  const token = generateSessionToken();
  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      userAgent: meta.userAgent ?? null,
      ipHash: meta.ipHash ?? null,
      lastSeenAt: new Date(),
    },
  });
  return { token, session };
}

export async function revokeSession(prisma: PrismaClient, sessionId: string) {
  await prisma.session.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserSessions(prisma: PrismaClient, userId: string) {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function lookupSession(
  prisma: PrismaClient,
  token: string,
): Promise<SessionContext | null> {
  if (!token || token.length > 128) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.revokedAt) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;
  if (session.user.status !== "ACTIVE") return null;
  return { session, user: session.user };
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
