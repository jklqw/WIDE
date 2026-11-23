import type { CompilerDiagnostic } from "@ide/contracts";

/**
 * Deterministic compiler-output parsers. Each returns normalized
 * diagnostics with workspace-relative paths (container "/workspace/"
 * prefixes stripped) so host/container internals are never leaked.
 */

function stripWorkspacePrefix(file: string): string {
  return file.replace(/^\/workspace\//, "").replace(/^workspace\//, "");
}

const GCC_RE =
  /^(?<file>[^:\n]+\.[a-zA-Z0-9]+):(?<line>\d+):(?<col>\d+):\s+(?<severity>error|warning|note):\s+(?<message>.+)$/;
const GO_RE = /^(?<file>[^:\n]+\.go):(?<line>\d+):(?<col>\d+):\s+(?<message>.+)$/;
const JAVA_RE =
  /^(?<file>[^:\n]+\.java):(?<line>\d+):\s+(?<severity>error|warning):\s+(?<message>.+)$/;
const TSC_RE =
  /^(?<file>[^\n(]+)\((?<line>\d+),(?<col>\d+)\):\s+(?<severity>error|warning)\s+TS\d+:\s+(?<message>.+)$/;
const PYTHON_RE = /File "(?<file>[^"]+)", line (?<line>\d+)/;

export type CompilerKind = "gcc" | "go" | "javac" | "tsc" | "python";

export function parseDiagnostics(kind: CompilerKind, output: string): CompilerDiagnostic[] {
  const diags: CompilerDiagnostic[] = [];
  for (const rawLine of output.split("\n")) {
    const line = rawLine.trimEnd();
    if (!line) continue;

    if (kind === "python") {
      const m = PYTHON_RE.exec(line);
      if (m?.groups) {
        diags.push({
          file: stripWorkspacePrefix(m.groups.file!),
          line: parseInt(m.groups.line!, 10),
          severity: "error",
          message: line.trim(),
        });
      }
      continue;
    }

    const re =
      kind === "gcc" ? GCC_RE : kind === "go" ? GO_RE : kind === "javac" ? JAVA_RE : TSC_RE;
    const m = re.exec(line);
    if (!m?.groups) continue;

    const severity = (m.groups.severity ?? "error") as CompilerDiagnostic["severity"];
    const colRaw = m.groups.col;
    diags.push({
      file: stripWorkspacePrefix(m.groups.file!),
      line: parseInt(m.groups.line!, 10),
      ...(colRaw ? { col: parseInt(colRaw, 10) } : {}),
      severity,
      message: m.groups.message!.trim(),
    });
  }
  return diags;
}

/** Java: extract the public class name expected by javac output layout. */
export function javaMainClass(source: string, fallbackFile: string): string {
  const m = /public\s+(?:final\s+)?class\s+(\w+)/.exec(source);
  if (m?.[1]) return m[1];
  const base = fallbackFile.split("/").pop() ?? "Main";
  return base.replace(/\.java$/, "");
}
