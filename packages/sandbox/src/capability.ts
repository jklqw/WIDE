import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Short-lived HMAC-SHA256 capability tokens authenticating
 * API -> runner requests. Format: base64url(json).base64url(sig).
 * TTL is capped at 60s; single-use jti replay protection is enforced by
 * the runner via Redis SET NX EX.
 */

export const CAPABILITY_TTL_MS = 60_000;
export const CAPABILITY_SCOPES = ["execute", "terminal"] as const;
export type CapabilityScope = (typeof CAPABILITY_SCOPES)[number];

export interface CapabilityPayload {
  jti: string;
  userId: string;
  workspaceId: string;
  storageKey: string;
  scope: CapabilityScope;
  /** Absolute workspace dir on the runner host. */
  workspaceHostPath?: string;
  exp: number; // epoch ms
}

export interface SignOptions {
  ttlMs?: number;
  now?: number;
  jti?: string;
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

function sign(secret: string, payloadB64: string): string {
  return createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

export function signCapability(
  secret: string,
  claims: Omit<CapabilityPayload, "jti" | "exp">,
  opts: SignOptions = {},
): { token: string; payload: CapabilityPayload } {
  const now = opts.now ?? Date.now();
  const ttl = Math.min(opts.ttlMs ?? CAPABILITY_TTL_MS, CAPABILITY_TTL_MS);
  const payload: CapabilityPayload = {
    ...claims,
    jti: opts.jti ?? randomBytes(16).toString("base64url"),
    exp: now + ttl,
  };
  const body = b64url(JSON.stringify(payload));
  return { token: `${body}.${sign(secret, body)}`, payload };
}

export type VerifyResult =
  | { ok: true; payload: CapabilityPayload }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "bad_scope" };

export function verifyCapability(
  secret: string,
  token: string,
  expectedScope?: CapabilityScope,
  now = Date.now(),
): VerifyResult {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return { ok: false, reason: "malformed" };
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = sign(secret, body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload: CapabilityPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (
    typeof payload.jti !== "string" ||
    typeof payload.exp !== "number" ||
    typeof payload.scope !== "string"
  ) {
    return { ok: false, reason: "malformed" };
  }
  if (payload.exp <= now) return { ok: false, reason: "expired" };
  if (expectedScope && payload.scope !== expectedScope) {
    return { ok: false, reason: "bad_scope" };
  }
  return { ok: true, payload };
}
