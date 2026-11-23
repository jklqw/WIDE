import { describe, expect, it } from "vitest";
import { languageForFile } from "./index.js";

describe("languageForFile", () => {
  it("maps common extensions", () => {
    expect(languageForFile("main.py")).toBe("python");
    expect(languageForFile("app.tsx")).toBe("typescript");
    expect(languageForFile("main.go")).toBe("go");
    expect(languageForFile("Main.java")).toBe("java");
    expect(languageForFile("Dockerfile")).toBe("dockerfile");
    expect(languageForFile("Makefile")).toBe("makefile");
    expect(languageForFile("README.md")).toBe("markdown");
    expect(languageForFile("unknown.xyz")).toBe("plaintext");
    expect(languageForFile("noext")).toBe("plaintext");
  });
});
