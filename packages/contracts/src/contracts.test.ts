import { describe, expect, it } from "vitest";
import {
  ApiErrorSchema,
  CreateExecutionRequestSchema,
  CreateWorkspaceRequestSchema,
  LoginRequestSchema,
  RegisterRequestSchema,
  TerminalClientMessageSchema,
  WriteFileRequestSchema,
} from "./index.js";

describe("ApiErrorSchema", () => {
  it("accepts a canonical error envelope", () => {
    const parsed = ApiErrorSchema.parse({
      error: { code: "NOT_FOUND", message: "missing", requestId: "r1" },
    });
    expect(parsed.error.code).toBe("NOT_FOUND");
  });

  it("rejects envelopes missing requestId", () => {
    expect(() =>
      ApiErrorSchema.parse({ error: { code: "X", message: "y" } }),
    ).toThrow();
  });
});

describe("AuthSchemas", () => {
  it("accepts a valid registration", () => {
    const r = RegisterRequestSchema.parse({
      email: "a@b.co",
      password: "long-enough-password",
      displayName: "A",
    });
    expect(r.email).toBe("a@b.co");
  });

  it("rejects short passwords and bad emails", () => {
    expect(() =>
      RegisterRequestSchema.parse({
        email: "not-an-email",
        password: "short",
        displayName: "A",
      }),
    ).toThrow();
  });

  it("login requires email + password", () => {
    expect(LoginRequestSchema.safeParse({ email: "a@b.co" }).success).toBe(false);
    expect(LoginRequestSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
  });
});

describe("WorkspaceSchemas", () => {
  it("defaults templateId to blank", () => {
    const r = CreateWorkspaceRequestSchema.parse({ name: "ws" });
    expect(r.templateId).toBe("blank");
  });

  it("rejects unknown template ids", () => {
    expect(() =>
      CreateWorkspaceRequestSchema.parse({ name: "ws", templateId: "rust" }),
    ).toThrow();
  });
});

describe("FilesystemSchemas", () => {
  it("enforces the 2 MiB write ceiling", () => {
    const ok = WriteFileRequestSchema.parse({
      path: "main.py",
      content: "print('hi')",
    });
    expect(ok.path).toBe("main.py");
    expect(() =>
      WriteFileRequestSchema.parse({
        path: "big.bin",
        content: "x".repeat(2 * 1024 * 1024 + 1),
      }),
    ).toThrow();
  });
});

describe("ExecutionSchemas", () => {
  it("accepts a run request and rejects empty sourcePath", () => {
    expect(
      CreateExecutionRequestSchema.safeParse({ sourcePath: "main.py" }).success,
    ).toBe(true);
    expect(CreateExecutionRequestSchema.safeParse({ sourcePath: "" }).success).toBe(false);
  });
});

describe("TerminalSchemas", () => {
  it("bounds cols/rows", () => {
    expect(
      TerminalClientMessageSchema.safeParse({
        type: "resize",
        cols: 10,
        rows: 5,
      }).success,
    ).toBe(false);
    expect(
      TerminalClientMessageSchema.safeParse({
        type: "resize",
        cols: 80,
        rows: 24,
      }).success,
    ).toBe(true);
  });

  it("accepts input/ping and rejects unknown types", () => {
    expect(
      TerminalClientMessageSchema.safeParse({ type: "input", data: "ls\n" }).success,
    ).toBe(true);
    expect(TerminalClientMessageSchema.safeParse({ type: "hack" }).success).toBe(false);
  });
});
