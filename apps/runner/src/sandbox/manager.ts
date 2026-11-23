import Docker from "dockerode";
import { Writable } from "node:stream";
import type { RunnerEnv } from "../config/env.js";
import { buildContainerConfig, type ContainerSpec } from "./policy.js";

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  outputTruncated: boolean;
}

export interface RunOptions {
  timeoutMs: number;
  maxOutputBytes: number;
  stdin?: string;
  /** Live chunk callback for streaming (stdout/stderr demuxed). */
  onChunk?: (stream: "stdout" | "stderr", chunk: Buffer) => void;
}

interface Lease {
  containerId: string;
  workspaceKey: string;
  createdAt: number;
  lastActivity: number;
}

const LEASE_TTL_MS = 30 * 60 * 1000;
const REAPER_INTERVAL_MS = 60 * 1000;

interface DemuxedOutput {
  stdoutChunks: Buffer[];
  stderrChunks: Buffer[];
  outputBytes: number;
  truncated: boolean;
  done: Promise<void>;
}

export class SandboxManager {
  private docker: Docker;
  private leases = new Map<string, Lease>();
  private reaper: NodeJS.Timeout | null = null;

  constructor(private readonly env: RunnerEnv) {
    this.docker = new Docker({ socketPath: "/var/run/docker.sock" });
  }

  startReaper(): void {
    if (this.reaper) return;
    this.reaper = setInterval(() => void this.reap(), REAPER_INTERVAL_MS);
    this.reaper.unref();
  }

  stopReaper(): void {
    if (this.reaper) clearInterval(this.reaper);
    this.reaper = null;
  }

  /** Destroy expired leases plus orphaned managed containers left behind
   *  by a previous runner process (crash recovery). */
  async reap(): Promise<number> {
    const now = Date.now();
    let removed = 0;
    for (const [id, lease] of this.leases) {
      if (now - lease.lastActivity > LEASE_TTL_MS) {
        await this.destroy(id).catch(() => {});
        this.leases.delete(id);
        removed += 1;
      }
    }
    try {
      const containers = await this.docker.listContainers({
        all: true,
        filters: { label: ["managed-by=webide-runner"] },
      });
      for (const c of containers) {
        const tracked = this.leases.has(c.Id);
        const active = c.State === "running" || c.State === "created";
        if (!tracked || (!active && now - new Date(c.Created).getTime() > LEASE_TTL_MS)) {
          await this.docker.getContainer(c.Id).remove({ force: true }).catch(() => {});
          this.leases.delete(c.Id);
          removed += 1;
        }
      }
    } catch {
      // daemon hiccup — retry next tick
    }
    return removed;
  }

  /** Create a long-lived idle sandbox (used by interactive terminals). */
  async createIdle(
    spec: Omit<ContainerSpec, "cmd">,
    workspaceKey: string,
  ): Promise<string> {
    return this.create({ ...spec, cmd: ["sleep", "infinity"] }, workspaceKey);
  }

  async create(spec: ContainerSpec, workspaceKey: string): Promise<string> {
    const config = buildContainerConfig(spec, {
      ...(this.env.SANDBOX_OCI_RUNTIME
        ? { ociRuntime: this.env.SANDBOX_OCI_RUNTIME }
        : {}),
    });
    const container = await this.docker.createContainer(
      config as unknown as Docker.ContainerCreateOptions,
    );
    this.leases.set(container.id, {
      containerId: container.id,
      workspaceKey,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    });
    return container.id;
  }

  /**
   * One-shot run: fresh container whose Cmd IS the argv (no shell, no
   * exec layer) → attach multiplexed log stream → start → wait → destroy.
   */
  async runOnce(
    image: string,
    workspaceHostPath: string,
    workspaceKey: string,
    argv: string[],
    needsBuildTmpfs: boolean,
    opts: RunOptions,
  ): Promise<RunResult> {
    const containerId = await this.create(
      { image, workspaceHostPath, needsBuildTmpfs, cmd: argv },
      workspaceKey,
    );
    try {
      return await this.runAndWait(containerId, opts);
    } finally {
      await this.destroy(containerId).catch(() => {});
    }
  }

  /** Run argv inside an existing (idle) container via docker exec. */
  async execRun(
    containerId: string,
    argv: string[],
    opts: RunOptions,
  ): Promise<RunResult> {
    this.touch(containerId);
    const container = this.docker.getContainer(containerId);
    const started = Date.now();

    const exec = await container.exec({
      Cmd: argv,
      AttachStdout: true,
      AttachStderr: true,
      AttachStdin: !!opts.stdin,
      Tty: false,
      Env: ["HOME=/tmp"],
      WorkingDir: "/workspace",
    });
    const stream = (await exec.start({ hijack: true, stdin: !!opts.stdin })) as NodeJS.ReadWriteStream & {
      destroy(): void;
    };
    const logs = this.demuxStream(stream, opts.maxOutputBytes);
    if (opts.stdin) {
      stream.write(opts.stdin);
      stream.end();
    }

    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      void container.kill().catch(() => {});
    }, opts.timeoutMs);

    const deadline = Date.now() + opts.timeoutMs + 10_000;
    let exitCode = -1;
    for (;;) {
      const st = await exec.inspect().catch(() => null);
      if (st && st.Running === false) {
        exitCode = st.ExitCode ?? -1;
        break;
      }
      if (Date.now() > deadline) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    clearTimeout(timeout);
    stream.destroy();
    await Promise.race([logs.done, new Promise((r) => setTimeout(r, 800))]);

    return {
      exitCode,
      stdout: Buffer.concat(logs.stdoutChunks).toString("utf8"),
      stderr: Buffer.concat(logs.stderrChunks).toString("utf8"),
      durationMs: Date.now() - started,
      timedOut,
      outputTruncated: logs.truncated,
    };
  }

  private demuxStream(
    stream: NodeJS.ReadWriteStream,
    maxOutputBytes: number,
    onChunk?: (stream: "stdout" | "stderr", chunk: Buffer) => void,
  ): DemuxedOutput {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const state = { outputBytes: 0, truncated: false };
    const modem = (
      this.docker as unknown as {
        modem: {
          demux: (
            s: NodeJS.ReadableStream,
            o: NodeJS.WritableStream,
            e: NodeJS.WritableStream,
          ) => void;
        };
      }
    ).modem;

    const makeSink = (chunks: Buffer[], which: "stdout" | "stderr") =>
      new Writable({
        write(chunk: Buffer, _enc, cb) {
          state.outputBytes += chunk.length;
          if (state.outputBytes <= maxOutputBytes) chunks.push(chunk);
          else state.truncated = true;
          onChunk?.(which, chunk);
          cb();
        },
      });

    const done = new Promise<void>((resolve) => {
      stream.on("end", resolve);
      stream.on("close", resolve);
      stream.on("error", resolve);
    });
    modem.demux(stream, makeSink(stdoutChunks, "stdout"), makeSink(stderrChunks, "stderr"));

    return {
      stdoutChunks,
      stderrChunks,
      outputBytes: state.outputBytes,
      get truncated() {
        return state.truncated;
      },
      done,
    };
  }

  private async runAndWait(
    containerId: string,
    opts: RunOptions,
  ): Promise<RunResult> {
    const container = this.docker.getContainer(containerId);
    const started = Date.now();

    // Attach BEFORE start so no output frame is missed.
    const logStream = (await container.attach({
      stream: true,
      stdout: true,
      stderr: true,
      stdin: !!opts.stdin,
    })) as NodeJS.ReadWriteStream & { destroy(): void };
    const logs = this.demuxStream(logStream, opts.maxOutputBytes);

    await container.start();
    if (opts.stdin) {
      logStream.write(opts.stdin);
      logStream.end();
    }

    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      void container.kill().catch(() => {});
    }, opts.timeoutMs);

    const waitResult = await container
      .wait()
      .catch(() => ({ StatusCode: -1 }))
      .finally(() => clearTimeout(timeout));

    await Promise.race([logs.done, new Promise((r) => setTimeout(r, 1500))]);
    logStream.destroy();

    return {
      exitCode: waitResult.StatusCode ?? -1,
      stdout: Buffer.concat(logs.stdoutChunks).toString("utf8"),
      stderr: Buffer.concat(logs.stderrChunks).toString("utf8"),
      durationMs: Date.now() - started,
      timedOut,
      outputTruncated: logs.truncated,
    };
  }

  async destroy(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId);
    await container.kill().catch(() => {});
    await container.remove({ force: true }).catch(() => {});
    this.leases.delete(containerId);
  }

  async destroyWorkspaceSandboxes(workspaceKey: string): Promise<void> {
    for (const [id, lease] of this.leases) {
      if (lease.workspaceKey === workspaceKey) {
        await this.destroy(id).catch(() => {});
      }
    }
  }

  leaseCount(): number {
    return this.leases.size;
  }

  touch(containerId: string): void {
    const lease = this.leases.get(containerId);
    if (lease) lease.lastActivity = Date.now();
  }

  workspacePath(storageKey: string): string {
    return `${this.env.WORKSPACE_STORAGE_ROOT}/${storageKey}`;
  }
}
