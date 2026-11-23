import { describe, expect, it } from "vitest";
import { signCapability, verifyCapability } from "./index.js";

const SECRET = "test-secret-0123456789abcdef0123456789";
const base = {
  userId: "u1",
  workspaceId: "w1",
  storageKey: "ws_abc12345",
  scope: "execute" as const,
};

describe("capability tokens", () => {
  it("round-trips a valid token", () => {
    const { token, payload } = signCapability(SECRET, base);
    const v = verifyCapability(SECRET, token, "execute");
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.payload.userId).toBe("u1");
      expect(v.payload.jti).toBe(payload.jti);
    }
  });

  it("rejects tampered payloads", () => {
    const { token } = signCapability(SECRET, base);
    const [body] = token.split(".");
    const forged = JSON.parse(Buffer.from(body!, "base64url").toString());
    forged.userId = "attacker";
    const forgedBody = Buffer.from(JSON.stringify(forged)).toString("base64url");
    const bad = `${forgedBody}.${token.split(".")[1]}`;
    expect(verifyCapability(SECRET, bad).ok).toBe(false);
  });

  it("rejects wrong secret", () => {
    const { token } = signCapability(SECRET, base);
    expect(verifyCapability("other-secret-0123456789abcdef0123", token).ok).toBe(false);
  });

  it("rejects expired tokens", () => {
    const { token } = signCapability(SECRET, base, {
      now: Date.now() - 120_000,
      ttlMs: 60_000,
    });
    expect(verifyCapability(SECRET, token).ok).toBe(false);
    const v = verifyCapability(SECRET, token);
    if (!v.ok) expect(v.reason).toBe("expired");
  });

  it("rejects wrong scope", () => {
    const { token } = signCapability(SECRET, base);
    const v = verifyCapability(SECRET, token, "terminal");
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("bad_scope");
  });

  it("rejects malformed tokens", () => {
    expect(verifyCapability(SECRET, "").ok).toBe(false);
    expect(verifyCapability(SECRET, "nodot").ok).toBe(false);
    expect(verifyCapability(SECRET, "a.b.c").ok).toBe(false);
  });

  it("caps TTL at 60s", () => {
    const before = Date.now();
    const { payload } = signCapability(SECRET, base, { ttlMs: 3_600_000 });
    expect(payload.exp - before).toBeLessThanOrEqual(60_000);
  });
});
