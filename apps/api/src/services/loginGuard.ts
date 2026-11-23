import { createHash } from "node:crypto";
import type { Redis } from "ioredis";

/**
 * Per-account brute-force guard: counts consecutive failed logins keyed by
 * a hash of the normalized email. After MAX_FAILURES failures the account
 * is locked for LOCK_MS. State lives in Redis when available (shared across
 * API replicas) with an in-process fallback for tests/dev.
 */

const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
const WINDOW_S = Math.ceil(LOCK_MS / 1000);

const memory = new Map<string, { failures: number; lockedUntil: number }>();

function keyFor(email: string): string {
  return `auth:loginfail:${createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 32)}`;
}

export interface LoginGuard {
  isLocked(email: string): Promise<boolean>;
  recordFailure(email: string): Promise<void>;
  recordSuccess(email: string): Promise<void>;
}

export function createLoginGuard(redis?: Redis): LoginGuard {
  async function redisLocked(email: string): Promise<boolean | null> {
    if (!redis) return null;
    try {
      const marker = await redis.get(`${keyFor(email)}:lock`);
      return marker !== null;
    } catch {
      return null;
    }
  }

  return {
    async isLocked(email) {
      const r = await redisLocked(email);
      if (r !== null) return r;
      const rec = memory.get(keyFor(email));
      return !!rec && rec.lockedUntil > Date.now();
    },

    async recordFailure(email) {
      const k = keyFor(email);
      if (redis) {
        try {
          const failures = await redis.incr(`${k}:n`);
          await redis.expire(`${k}:n`, WINDOW_S);
          if (failures >= MAX_FAILURES) {
            await redis.set(`${k}:lock`, "1", "PX", LOCK_MS);
            await redis.del(`${k}:n`);
          }
          return;
        } catch {
          // fall through to memory
        }
      }
      const rec = memory.get(k) ?? { failures: 0, lockedUntil: 0 };
      rec.failures += 1;
      if (rec.failures >= MAX_FAILURES) {
        rec.lockedUntil = Date.now() + LOCK_MS;
        rec.failures = 0;
      }
      memory.set(k, rec);
    },

    async recordSuccess(email) {
      const k = keyFor(email);
      memory.delete(k);
      if (redis) {
        try {
          await redis.del(`${k}:n`, `${k}:lock`);
        } catch {
          /* ignore */
        }
      }
    },
  };
}
