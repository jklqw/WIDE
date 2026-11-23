import type { RuntimeDefinition } from "@ide/sandbox";
import { accessSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Container creation policy — hardened security boundaries.
 * Every ceiling is a server-side constant; no client input can raise them.
 */

export const SANDBOX_UID = 10001;
export const SANDBOX_GID = 10001;

export const LIMITS = {
  NANO_CPUS: 1_000_000_000, // 1 vCPU
  MEMORY_BYTES: 512 * 1024 * 1024, // 512 MiB
  PIDS_LIMIT: 64,
  NOFILE: 256,
  FSIZE_BYTES: 32 * 1024 * 1024,
  TMPFS_TMP: "rw,nosuid,nodev,size=128m",
  TMPFS_BUILD: "rw,nosuid,nodev,exec,size=64m",
} as const;

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** infra/docker/seccomp-sandbox.json resolved from the runner package. */
export function defaultSeccompProfilePath(): string {
  // apps/runner/src/sandbox -> repo root is four levels up from src, or
  // resolve via env override SANDBOX_SECCOMP_PROFILE.
  const candidates = [
    process.env.SANDBOX_SECCOMP_PROFILE,
    path.resolve(HERE, "../../../../infra/docker/seccomp-sandbox.json"),
    path.resolve(process.cwd(), "infra/docker/seccomp-sandbox.json"),
  ].filter((p): p is string => !!p);
  for (const c of candidates) {
    try {
      accessSync(c);
      return c;
    } catch {
      /* try next */
    }
  }
  return candidates[candidates.length - 1]!;
}

export interface ContainerSpec {
  image: string;
  workspaceHostPath: string;
  needsBuildTmpfs: boolean;
  cmd: string[];
  env?: string[];
  /** Mount workspace read-only (default rw for compile/run). */
  workspaceReadOnly?: boolean;
}

export interface DockerContainerConfig {
  Image: string;
  Cmd: string[];
  User: string;
  WorkingDir: string;
  Env: string[];
  Labels: Record<string, string>;
  HostConfig: {
    Binds: string[];
    Tmpfs: Record<string, string>;
    NetworkMode: string;
    ReadonlyRootfs: boolean;
    CapDrop: string[];
    SecurityOpt: string[];
    Privileged: boolean;
    NanoCpus: number;
    Memory: number;
    MemorySwap: number;
    PidsLimit: number;
    Ulimits: { Name: string; Soft: number; Hard: number }[];
    AutoRemove: boolean;
    Runtime?: string;
  };
}

export interface PolicyOptions {
  seccompProfilePath?: string;
  ociRuntime?: string;
}

export function buildContainerConfig(
  spec: ContainerSpec,
  opts: PolicyOptions = {},
): DockerContainerConfig {
  const tmpfs: Record<string, string> = {
    "/tmp": LIMITS.TMPFS_TMP,
  };
  if (spec.needsBuildTmpfs) {
    tmpfs["/tmp/build"] = LIMITS.TMPFS_BUILD;
  }

  const securityOpt = ["no-new-privileges:true"];
  const seccomp = opts.seccompProfilePath ?? defaultSeccompProfilePath();
  securityOpt.push(`seccomp=${seccomp}`);

  const config: DockerContainerConfig = {
    Image: spec.image,
    Cmd: spec.cmd,
    User: `${SANDBOX_UID}:${SANDBOX_GID}`,
    WorkingDir: "/workspace",
    Env: [
      "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      "HOME=/tmp",
      "TERM=xterm-256color",
      "GOCACHE=/tmp/gocache",
      "GOPATH=/tmp/gopath",
      "GOPROXY=off",
      "PYTHONDONTWRITEBYTECODE=1",
      "PYTHONUNBUFFERED=1",
      ...(spec.env ?? []),
    ],
    Labels: { "managed-by": "webide-runner" },
    HostConfig: {
      Binds: [
        `${spec.workspaceHostPath}:/workspace${spec.workspaceReadOnly ? ":ro" : ""}`,
      ],
      Tmpfs: tmpfs,
      NetworkMode: "none",
      ReadonlyRootfs: true,
      CapDrop: ["ALL"],
      SecurityOpt: securityOpt,
      Privileged: false,
      NanoCpus: LIMITS.NANO_CPUS,
      Memory: LIMITS.MEMORY_BYTES,
      MemorySwap: LIMITS.MEMORY_BYTES, // swap disabled
      PidsLimit: LIMITS.PIDS_LIMIT,
      Ulimits: [
        { Name: "nofile", Soft: LIMITS.NOFILE, Hard: LIMITS.NOFILE },
        { Name: "fsize", Soft: LIMITS.FSIZE_BYTES, Hard: LIMITS.FSIZE_BYTES },
      ],
      AutoRemove: false,
    },
  };

  if (opts.ociRuntime) {
    config.HostConfig.Runtime = opts.ociRuntime;
  }

  return config;
}

export function needsBuildTmpfs(rt: RuntimeDefinition): boolean {
  return rt.buildArgv !== null;
}
