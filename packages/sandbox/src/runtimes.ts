import type { LanguageId } from "@ide/contracts";

/**
 * Server-side allowlist of sandbox runtime images. Client requests can
 * only select a language — the image tag, argv templates, timeouts, and
 * output ceilings are pinned here and cannot be influenced by request
 * payloads.
 */

export interface RuntimeDefinition {
  languageId: LanguageId;
  /** Pinned local image tag built by infra/docker/build-images.sh */
  image: string;
  /** Fixed compile argv (run inside sandbox, cwd=/workspace). null = interpreted. */
  buildArgv: string[] | null;
  /** Fixed run argv. "{file}" and "{class}" placeholders substituted safely. */
  runArgv: string[];
  /** Placeholder token replaced by the validated workspace-relative path. */
  filePlaceholder: string;
  /** Extra placeholder for Java main class name. */
  classPlaceholder?: string;
  compileTimeoutMs: number;
  runTimeoutMs: number;
  maxOutputBytes: number;
}

const IMG = (name: string) => `webide-runtime-${name}:local`;

export const RUNTIMES: Record<LanguageId, RuntimeDefinition> = {
  python: {
    languageId: "python",
    image: IMG("python"),
    buildArgv: null,
    runArgv: ["python3", "-I", "-u", "{file}"],
    filePlaceholder: "{file}",
    compileTimeoutMs: 0,
    runTimeoutMs: 10_000,
    maxOutputBytes: 1024 * 1024,
  },
  javascript: {
    languageId: "javascript",
    image: IMG("node"),
    buildArgv: null,
    runArgv: ["node", "{file}"],
    filePlaceholder: "{file}",
    compileTimeoutMs: 0,
    runTimeoutMs: 10_000,
    maxOutputBytes: 1024 * 1024,
  },
  typescript: {
    languageId: "typescript",
    image: IMG("node"),
    buildArgv: ["tsc", "--noEmit", "--pretty", "false", "{file}"],
    runArgv: ["tsx", "{file}"],
    filePlaceholder: "{file}",
    compileTimeoutMs: 15_000,
    runTimeoutMs: 10_000,
    maxOutputBytes: 1024 * 1024,
  },
  c: {
    languageId: "c",
    image: IMG("cpp"),
    buildArgv: ["gcc", "-std=c17", "-Wall", "-Wextra", "-O2", "{file}", "-o", "/tmp/build/app"],
    runArgv: ["/tmp/build/app"],
    filePlaceholder: "{file}",
    compileTimeoutMs: 15_000,
    runTimeoutMs: 10_000,
    maxOutputBytes: 1024 * 1024,
  },
  cpp: {
    languageId: "cpp",
    image: IMG("cpp"),
    buildArgv: ["g++", "-std=c++20", "-Wall", "-Wextra", "-O2", "{file}", "-o", "/tmp/build/app"],
    runArgv: ["/tmp/build/app"],
    filePlaceholder: "{file}",
    compileTimeoutMs: 15_000,
    runTimeoutMs: 10_000,
    maxOutputBytes: 1024 * 1024,
  },
  java: {
    languageId: "java",
    image: IMG("java"),
    buildArgv: ["javac", "-d", "/tmp/build", "{file}"],
    runArgv: ["java", "-cp", "/tmp/build", "{class}"],
    filePlaceholder: "{file}",
    classPlaceholder: "{class}",
    compileTimeoutMs: 20_000,
    runTimeoutMs: 10_000,
    maxOutputBytes: 1024 * 1024,
  },
  go: {
    languageId: "go",
    image: IMG("go"),
    buildArgv: ["go", "build", "-o", "/tmp/build/app", "{file}"],
    runArgv: ["/tmp/build/app"],
    filePlaceholder: "{file}",
    compileTimeoutMs: 30_000,
    runTimeoutMs: 10_000,
    maxOutputBytes: 1024 * 1024,
  },
};

export const LANGUAGE_BY_EXTENSION: Record<string, LanguageId> = {
  ".py": "python",
  ".js": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".ts": "typescript",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".hpp": "cpp",
  ".java": "java",
  ".go": "go",
};

export function languageForPath(filePath: string): LanguageId | null {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  if (!filePath.includes(".")) return null;
  return LANGUAGE_BY_EXTENSION[ext] ?? null;
}

export function getRuntime(languageId: LanguageId): RuntimeDefinition {
  const rt = RUNTIMES[languageId];
  if (!rt) throw new Error(`no runtime for language ${languageId}`);
  return rt;
}

/** Substitute placeholders with already-validated paths/classes. */
export function resolveArgv(
  argv: string[],
  rt: RuntimeDefinition,
  filePath: string,
  className?: string,
): string[] {
  return argv.map((arg) => {
    let out = arg.split(rt.filePlaceholder).join(filePath);
    if (rt.classPlaceholder && className) {
      out = out.split(rt.classPlaceholder).join(className);
    }
    return out;
  });
}
