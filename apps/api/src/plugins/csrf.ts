import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { AppError } from "../lib/errors.js";
import { SESSION_COOKIE } from "../services/sessions.js";

export const CSRF_COOKIE = "webide_csrf";
export const CSRF_HEADER = "x-csrf-token";
const CSRF_TTL_MS = 12 * 60 * 60 * 1000; // 12h, refreshed on issue

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function sign(secret: string, nonce: string): string {
  return createHmac("sha256", secret).update(`csrf:${nonce}`).digest("base64url");
}

export function issueCsrfToken(secret: string): { token: string; maxAge: number } {
  const nonce = randomBytes(24).toString("base64url");
  const sig = sign(secret, nonce);
  return { token: `${nonce}.${sig}`, maxAge: CSRF_TTL_MS / 1000 };
}

export function verifyCsrfToken(secret: string, token: string): boolean {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;
  const nonce = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(secret, nonce);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Double-submit CSRF guard for cookie-authenticated mutations.
 * Requires X-CSRF-Token header to equal the webide_csrf cookie AND be a
 * valid HMAC-signed token. Requests authenticated by non-cookie means
 * (e.g. bearer) are out of scope for this deployment.
 */
export async function csrfGuard(request: FastifyRequest): Promise<void> {
  if (SAFE_METHODS.has(request.method)) return;
  // Unauthenticated requests will be rejected by requireAuth anyway; only
  // enforce CSRF when a session cookie is present.
  if (!request.cookies[SESSION_COOKIE]) return;

  const cookieToken = request.cookies[CSRF_COOKIE];
  const headerToken = request.headers[CSRF_HEADER];
  const header = Array.isArray(headerToken) ? headerToken[0] : headerToken;

  if (
    !cookieToken ||
    !header ||
    cookieToken !== header ||
    !verifyCsrfToken(request.server.env.SESSION_SECRET, header)
  ) {
    throw AppError.forbidden("CSRF_INVALID", "CSRF token missing or invalid");
  }
}

export async function csrfPlugin(app: FastifyInstance): Promise<void> {
  app.decorate("issueCsrf", (secret: string) => issueCsrfToken(secret));
}

declare module "fastify" {
  interface FastifyInstance {
    issueCsrf: typeof issueCsrfToken;
  }
}
