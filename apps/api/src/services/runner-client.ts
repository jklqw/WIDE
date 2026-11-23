import type { FastifyInstance } from "fastify";
import {
  signCapability,
  type CapabilityPayload,
  type CapabilityScope,
} from "@ide/sandbox";
import { AppError } from "../lib/errors.js";

/** Mint a short-lived capability for the private runner service. */
export function mintCapability(
  app: FastifyInstance,
  claims: {
    userId: string;
    workspaceId: string;
    storageKey: string;
    scope: CapabilityScope;
    workspaceHostPath: string;
  },
): { token: string; payload: CapabilityPayload } {
  return signCapability(app.env.RUNNER_SHARED_SECRET, {
    userId: claims.userId,
    workspaceId: claims.workspaceId,
    storageKey: claims.storageKey,
    scope: claims.scope,
    workspaceHostPath: claims.workspaceHostPath,
  });
}

export async function runnerFetch(
  app: FastifyInstance,
  path: string,
  body: unknown,
  capability: string,
): Promise<{ status: number; json: unknown }> {
  const base = process.env.RUNNER_INTERNAL_URL ?? "http://127.0.0.1:3002";
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-runner-capability": capability,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

export { AppError };
