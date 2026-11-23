"use client";

let csrfToken: string | null = null;

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function ensureCsrf(): Promise<string> {
  if (csrfToken) return csrfToken;
  const res = await fetch(`${BASE}/api/v1/auth/csrf`, { credentials: "include" });
  const data = await res.json();
  csrfToken = data.csrfToken;
  return csrfToken!;
}

export function resetCsrf() {
  csrfToken = null;
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; raw?: boolean } = {},
): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined ? "POST" : "GET");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (method !== "GET") {
    headers["x-csrf-token"] = await ensureCsrf();
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: "include",
    headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  if (res.status === 401) resetCsrf();
  if (!res.ok) {
    let code = "ERROR";
    let message = res.statusText;
    let details: unknown;
    try {
      const j = await res.json();
      code = j?.error?.code ?? code;
      message = j?.error?.message ?? message;
      details = j?.error?.details;
    } catch { /* ignore */ }
    throw new ApiError(res.status, code, message, details);
  }
  if (opts.raw) return res as unknown as T;
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function uploadFile(
  wsId: string,
  path: string,
  file: File,
): Promise<unknown> {
  const fd = new FormData();
  fd.append("path", path);
  fd.append("file", file);
  const res = await fetch(`${BASE}/api/v1/workspaces/${wsId}/upload`, {
    method: "POST",
    credentials: "include",
    headers: { "x-csrf-token": await ensureCsrf() },
    body: fd,
  });
  if (!res.ok) throw new ApiError(res.status, "UPLOAD_FAILED", "Upload failed");
  return res.json();
}
