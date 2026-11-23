import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

const base = {
  DATABASE_URL: "postgresql://x",
  REDIS_URL: "redis://x",
  SESSION_SECRET: "a".repeat(32),
  RUNNER_SHARED_SECRET: "b".repeat(32),
};

describe("loadEnv", () => {
  it("applies defaults and marks non-production", () => {
    const env = loadEnv(base);
    expect(env.API_PORT).toBe(3001);
    expect(env.isProduction).toBe(false);
  });

  it("rejects missing required vars", () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });

  it("rejects short secrets", () => {
    expect(() => loadEnv({ ...base, SESSION_SECRET: "short" })).toThrow(
      /SESSION_SECRET/,
    );
  });

  it("refuses placeholder secrets in production", () => {
    expect(() =>
      loadEnv({
        ...base,
        NODE_ENV: "production",
        SESSION_SECRET: "change-me-generate-with-openssl-rand-hex-32",
      }),
    ).toThrow(/placeholder/);
  });
});
