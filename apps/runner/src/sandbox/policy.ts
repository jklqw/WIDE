import type { RuntimeDefinition } from "@ide/sandbox";

/**
 * Container creation policy — Commit 10 baseline. The dedicated security
 * commit (Section 11) hardens every ceiling; keep changes there auditable.
 */

export const SANDBOX_UID = 10001;
export const SANDBOX_GID = 10001;

export interface ContainerSpec {
  image: string;
  workspaceHostPath: string;
  needsBuildTmpfs: boolean;
  cmd: string[];
  env?: string[];
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
    AutoRemove: boolean;
    Runtime?: string;
  };
}

export function buildContainerConfig(
  spec: ContainerSpec,
  opts: { ociRuntime?: string } = {},
): DockerContainerConfig {
  const tmpfs: Record<string, string> = {
    "/tmp": "rw,nosuid,nodev,size=128m",
  };
  if (spec.needsBuildTmpfs) {
    tmpfs["/tmp/build"] = "rw,nosuid,nodev,exec,size=64m";
  }

  const config: DockerContainerConfig = {
    Image: spec.image,
    Cmd: spec.cmd,
    User: `${SANDBOX_UID}:${SANDBOX_GID}`,
    WorkingDir: "/workspace",
    Env: [
      "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      "HOME=/tmp",
      "TERM=xterm-256color",
      ...(spec.env ?? []),
    ],
    Labels: { "managed-by": "webide-runner" },
    HostConfig: {
      Binds: [`${spec.workspaceHostPath}:/workspace`],
      Tmpfs: tmpfs,
      NetworkMode: "none",
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
