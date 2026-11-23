import { describe, expect, it } from "vitest";
import {
  getRuntime,
  javaMainClass,
  languageForPath,
  parseDiagnostics,
  resolveArgv,
} from "./index.js";

describe("languageForPath", () => {
  it("maps extensions to languages", () => {
    expect(languageForPath("main.py")).toBe("python");
    expect(languageForPath("a/b/main.cpp")).toBe("cpp");
    expect(languageForPath("Main.java")).toBe("java");
    expect(languageForPath("x.go")).toBe("go");
    expect(languageForPath("README.md")).toBeNull();
    expect(languageForPath("noext")).toBeNull();
  });
});

describe("runtime registry", () => {
  it("pins allowlisted image tags", () => {
    expect(getRuntime("python").image).toBe("webide-runtime-python:local");
    expect(getRuntime("cpp").image).toBe("webide-runtime-cpp:local");
    expect(getRuntime("go").buildArgv?.[0]).toBe("go");
  });

  it("resolves argv placeholders safely", () => {
    const rt = getRuntime("cpp");
    const argv = resolveArgv(rt.buildArgv!, rt, "/workspace/main.cpp");
    expect(argv).toContain("/workspace/main.cpp");
    expect(argv).toContain("/tmp/build/app");
    expect(argv.join(" ")).not.toContain("{file}");
  });
});

describe("diagnostic parsers", () => {
  it("parses gcc errors and strips /workspace prefix", () => {
    const out = [
      "/workspace/main.cpp:3:5: error: expected ';' before '}' token",
      "/workspace/main.cpp:7:1: warning: unused variable 'x' [-Wunused-variable]",
      "some random compiler noise",
    ].join("\n");
    const diags = parseDiagnostics("gcc", out);
    expect(diags).toHaveLength(2);
    expect(diags[0]).toMatchObject({
      file: "main.cpp",
      line: 3,
      col: 5,
      severity: "error",
    });
    expect(diags[1]!.severity).toBe("warning");
  });

  it("parses go diagnostics", () => {
    const out = "/workspace/main.go:4:2: undefined: fmt.Prinln";
    const diags = parseDiagnostics("go", out);
    expect(diags[0]).toMatchObject({ file: "main.go", line: 4, col: 2 });
  });

  it("parses javac diagnostics", () => {
    const out = "/workspace/Main.java:2: error: class, interface, or enum expected";
    const diags = parseDiagnostics("javac", out);
    expect(diags[0]).toMatchObject({ file: "Main.java", line: 2, severity: "error" });
  });

  it("parses tsc diagnostics", () => {
    const out = "/workspace/main.ts(1,7): error TS2304: Cannot find name 'x'.";
    const diags = parseDiagnostics("tsc", out);
    expect(diags[0]).toMatchObject({
      file: "/workspace/main.ts".replace("/workspace/", ""),
      line: 1,
      col: 7,
      severity: "error",
    });
    expect(diags[0]!.message).toBe("Cannot find name 'x'.");
  });

  it("parses python tracebacks", () => {
    const out = 'Traceback (most recent call last):\n  File "/workspace/main.py", line 4, in <module>\n    foo()\nNameError: name \'foo\' is not defined';
    const diags = parseDiagnostics("python", out);
    expect(diags[0]).toMatchObject({ file: "main.py", line: 4 });
  });
});

describe("javaMainClass", () => {
  it("extracts public class name", () => {
    expect(javaMainClass("public class Foo {}", "Foo.java")).toBe("Foo");
    expect(javaMainClass("class Bar {}", "Bar.java")).toBe("Bar");
  });
});
