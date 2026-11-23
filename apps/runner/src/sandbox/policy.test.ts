import { describe, expect, it } from "vitest";
import { getRuntime } from "@ide/sandbox";
import {
  buildContainerConfig,
  LIMITS,
  needsBuildTmpfs,
  SANDBOX_GID,
  SANDBOX_UID,
} from "./policy.js";

const baseSpec = {
  image: "webide-runtime-python:local",
  workspaceHostPath: "/data/workspaces/ws_abc123",
  needsBuildTmpfs: false,
  cmd: ["python3", "-I", "-u", "/workspace/main.py"],
};

describe("sandbox container policy invariants", () => {
  const cfg = buildContainerConfig(baseSpec, {
    seccompProfilePath: "/tmp/seccomp.json",
  });
  const hc = cfg.HostConfig;

  it("runs as non-root sandbox user", () => {
    expect(cfg.User).toBe(`${SANDBOX_UID}:${SANDBOX_GID}`);
    expect(SANDBOX_UID).toBe(10001);
  });

  it("drops all capabilities and sets no-new-privileges", () => {
    expect(hc.CapDrop).toEqual(["ALL"]);
    expect(hc.SecurityOpt).toContain("no-new-privileges:true");
    expect(hc.SecurityOpt.some((s) => s.startsWith("seccomp="))).toBe(true);
    expect(hc.Privileged).toBe(false);
  });

  it("enforces read-only rootfs and tmpfs mounts", () => {
    expect(hc.ReadonlyRootfs).toBe(true);
    expect(hc.Tmpfs["/tmp"]).toContain("nosuid");
    expect(hc.Tmpfs["/tmp"]).toContain("nodev");
    expect(hc.Tmpfs["/tmp/build"]).toBeUndefined(); // interpreted lang
  });

  it("adds /tmp/build exec tmpfs only for compiled languages", () => {
    const cpp = buildContainerConfig(
      { ...baseSpec, needsBuildTmpfs: true },
      { seccompProfilePath: "/tmp/seccomp.json" },
    );
    expect(cpp.HostConfig.Tmpfs["/tmp/build"]).toContain("exec");
    expect(needsBuildTmpfs(getRuntime("cpp"))).toBe(true);
    expect(needsBuildTmpfs(getRuntime("python"))).toBe(false);
  });

  it("enforces cgroup ceilings", () => {
    expect(hc.NanoCpus).toBe(LIMITS.NANO_CPUS);
    expect(hc.Memory).toBe(512 * 1024 * 1024);
    expect(hc.MemorySwap).toBe(hc.Memory); // no swap
    expect(hc.PidsLimit).toBe(64);
  });

  it("enforces ulimits", () => {
    const nofile = hc.Ulimits.find((u) => u.Name === "nofile");
    const fsize = hc.Ulimits.find((u) => u.Name === "fsize");
    expect(nofile?.Hard).toBe(256);
    expect(fsize?.Hard).toBe(32 * 1024 * 1024);
  });

  it("mounts ONLY the workspace bind, never host paths", () => {
    expect(hc.Binds).toHaveLength(1);
    expect(hc.Binds[0]).toContain(":/workspace");
    expect(hc.Binds[0]).not.toContain("docker.sock");
    expect(hc.Binds[0]).not.toContain("/etc");
    expect(hc.Binds[0]).not.toContain("/home");
  });

  it("supports read-only workspace mount option", () => {
    const ro = buildContainerConfig(
      { ...baseSpec, workspaceReadOnly: true },
      { seccompProfilePath: "/tmp/seccomp.json" },
    );
    expect(ro.HostConfig.Binds[0]).toMatch(/:ro$/);
  });

  it("passes through OCI runtime override", () => {
    const g = buildContainerConfig(baseSpec, {
      seccompProfilePath: "/tmp/seccomp.json",
      ociRuntime: "runsc",
    });
    expect(g.HostConfig.Runtime).toBe("runsc");
  });

  it("has no shell in env and pins minimal PATH", () => {
    expect(cfg.Env.join(" ")).not.toContain("/bin/sh -c");
    expect(cfg.Env.find((e) => e.startsWith("PATH="))).toBeDefined();
  });
});
