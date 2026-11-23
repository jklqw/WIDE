import { createHash, randomBytes } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { AppError } from "../lib/errors.js";

/**
 * Hardened workspace filesystem engine.
 *
 * Security invariants:
 *  - Every user-supplied path is normalized and proven to resolve strictly
 *    inside <storageRoot>/<storageKey> before any filesystem touch.
 *  - Absolute paths, drive letters, NUL bytes, backslashes, ".." segments,
 *    percent-encoded traversal, and control characters are rejected.
 *  - Symlinks are rejected outright (documented policy: workspaces contain
 *    no symlinks; creation of symlinks is impossible via the API).
 *  - Quotas: 2 MiB text file, 10 MiB upload, 100 MiB workspace, 500 entries,
 *    depth 12.
 *  - Writes are atomic (temp file + rename) and guarded by revision ETags.
 */

export const LIMITS = {
  MAX_TEXT_FILE_BYTES: 2 * 1024 * 1024,
  MAX_UPLOAD_BYTES: 10 * 1024 * 1024,
  MAX_WORKSPACE_BYTES: 100 * 1024 * 1024,
  MAX_FILE_COUNT: 500,
  MAX_DEPTH: 12,
  MAX_PATH_LENGTH: 1024,
} as const;

// eslint-disable-next-line no-control-regex -- intentionally matching control chars
const FORBIDDEN_CHARS = /[\0-\x1f\x7f]/;

export class WorkspaceFS {
  readonly root: string;

  constructor(
    private readonly storageRoot: string,
    readonly storageKey: string,
  ) {
    if (!/^[a-zA-Z0-9_-]{8,64}$/.test(storageKey)) {
      throw new AppError(500, "INVALID_STORAGE_KEY", "Invalid workspace storage key");
    }
    this.root = path.resolve(storageRoot, storageKey);
  }

  /** Normalize + validate a user path; returns absolute path inside root. */
  resolve(userPath: string): string {
    if (typeof userPath !== "string" || userPath.length === 0 || userPath.length > LIMITS.MAX_PATH_LENGTH) {
      throw AppError.badRequest("INVALID_PATH", "Invalid path");
    }
    if (FORBIDDEN_CHARS.test(userPath)) {
      throw AppError.badRequest("INVALID_PATH", "Path contains control characters");
    }
    // Reject percent-encoded traversal attempts outright.
    let decoded: string;
    try {
      decoded = decodeURIComponent(userPath);
    } catch {
      throw AppError.badRequest("INVALID_PATH", "Malformed percent-encoding");
    }
    if (decoded !== userPath && /%2e|%2f|%5c/i.test(userPath)) {
      throw AppError.badRequest("INVALID_PATH", "Encoded traversal is not allowed");
    }
    if (path.isAbsolute(userPath) || path.win32.isAbsolute(userPath)) {
      throw AppError.badRequest("INVALID_PATH", "Absolute paths are not allowed");
    }
    if (/^[a-zA-Z]:/.test(userPath) || userPath.includes("\\")) {
      throw AppError.badRequest("INVALID_PATH", "Invalid path separators");
    }

    const rel = path.posix.normalize(userPath.replace(/\\/g, "/"));
    if (rel === ".." || rel.startsWith("../") || rel.includes("/../")) {
      throw AppError.badRequest("PATH_TRAVERSAL", "Path escapes workspace root");
    }
    const segments = rel.split("/").filter((s) => s.length > 0);
    if (segments.length > LIMITS.MAX_DEPTH) {
      throw AppError.badRequest("PATH_TOO_DEEP", "Path exceeds maximum depth");
    }
    const abs = path.resolve(this.root, ...segments);
    if (abs !== this.root && !abs.startsWith(this.root + path.sep)) {
      throw AppError.badRequest("PATH_TRAVERSAL", "Path escapes workspace root");
    }
    return abs;
  }

  /** Walk each existing path segment; reject symlinks anywhere. */
  private async assertNoSymlink(abs: string): Promise<void> {
    const rel = path.relative(this.root, abs);
    let current = this.root;
    for (const seg of rel.split(path.sep).filter(Boolean)) {
      current = path.join(current, seg);
      try {
        const lst = await lstat(current);
        if (lst.isSymbolicLink()) {
          throw AppError.forbidden("SYMLINK_FORBIDDEN", "Symlinks are not allowed in workspaces");
        }
      } catch (err) {
        if (err instanceof AppError) throw err;
        // ENOENT — remaining segments don't exist yet; stop walking.
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
        throw err;
      }
    }
  }

  async ensureRoot(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    // Sandbox containers run as uid/gid 10001 — the workspace root must be
    // traversable/writable by them. Best-effort chmod; production deployments
    // should align uids via userns-remap instead.
    await chmod(this.root, 0o777).catch(() => {});
  }

  async listDir(userPath = ""): Promise<{
    entries: { name: string; path: string; kind: "file" | "directory"; size?: number; modifiedAt?: string }[];
  }> {
    const abs = this.resolve(userPath || ".");
    await this.assertNoSymlink(abs);
    const lst = await lstat(abs).catch(() => null);
    if (!lst) throw AppError.notFound("NOT_FOUND", "Path not found");
    if (!lst.isDirectory()) throw AppError.badRequest("NOT_DIRECTORY", "Path is not a directory");

    const dirents = await readdir(abs, { withFileTypes: true });
    const entries = await Promise.all(
      dirents.map(async (d) => {
        const childAbs = path.join(abs, d.name);
        const relPath = path.relative(this.root, childAbs).split(path.sep).join("/");
        const st = await stat(childAbs).catch(() => null);
        return {
          name: d.name,
          path: relPath,
          kind: (d.isDirectory() ? "directory" : "file") as "file" | "directory",
          ...(st && d.isFile() ? { size: st.size } : {}),
          ...(st ? { modifiedAt: st.mtime.toISOString() } : {}),
        };
      }),
    );
    entries.sort((a, b) =>
      a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "directory" ? -1 : 1,
    );
    return { entries };
  }

  async statEntry(userPath: string) {
    const abs = this.resolve(userPath);
    await this.assertNoSymlink(abs);
    const st = await stat(abs).catch(() => null);
    if (!st) throw AppError.notFound("NOT_FOUND", "Path not found");
    return { abs, st };
  }

  async readFile(userPath: string): Promise<{
    path: string;
    content: Buffer;
    revision: string;
    size: number;
    isBinary: boolean;
  }> {
    const { abs, st } = await this.statEntry(userPath);
    if (!st.isFile()) throw AppError.badRequest("NOT_A_FILE", "Path is not a file");
    if (st.size > LIMITS.MAX_UPLOAD_BYTES) {
      throw AppError.badRequest("FILE_TOO_LARGE", "File exceeds readable size limit");
    }
    const content = await readFile(abs);
    return {
      path: path.relative(this.root, abs).split(path.sep).join("/"),
      content,
      revision: revisionOf(content, st),
      size: st.size,
      isBinary: looksBinary(content),
    };
  }

  async writeFile(
    userPath: string,
    content: Buffer | string,
    opts: { expectedRevision?: string; maxBytes?: number } = {},
  ): Promise<{ path: string; revision: string; size: number }> {
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
    const maxBytes = opts.maxBytes ?? LIMITS.MAX_TEXT_FILE_BYTES;
    if (buf.length > maxBytes) {
      throw AppError.badRequest("FILE_TOO_LARGE", `File exceeds ${maxBytes} byte limit`);
    }

    const abs = this.resolve(userPath);
    await this.assertNoSymlink(abs);
    await this.checkQuotas(abs, buf.length);

    // Optimistic concurrency: if expectedRevision given, existing file
    // must match exactly.
    if (opts.expectedRevision !== undefined) {
      const existing = await stat(abs).catch(() => null);
      if (!existing || !existing.isFile()) {
        throw AppError.conflict("REVISION_CONFLICT", "File does not exist on server", {
          serverRevision: null,
        });
      }
      const cur = await readFile(abs);
      const curRev = revisionOf(cur, existing);
      if (curRev !== opts.expectedRevision) {
        throw AppError.conflict("REVISION_CONFLICT", "File was modified elsewhere", {
          serverRevision: curRev,
        });
      }
    }

    await mkdir(path.dirname(abs), { recursive: true });
    // Atomic write: temp file in same dir, then rename.
    const tmp = path.join(
      path.dirname(abs),
      `.write-${randomBytes(8).toString("hex")}.tmp`,
    );
    await writeFile(tmp, buf);
    await rename(tmp, abs);

    const st = await stat(abs);
    return {
      path: path.relative(this.root, abs).split(path.sep).join("/"),
      revision: revisionOf(buf, st),
      size: buf.length,
    };
  }

  async mkdirEntry(userPath: string): Promise<{ path: string }> {
    const abs = this.resolve(userPath);
    await this.assertNoSymlink(abs);
    await this.checkQuotas(abs, 0);
    await mkdir(abs, { recursive: false });
    return { path: path.relative(this.root, abs).split(path.sep).join("/") };
  }

  async renameEntry(from: string, to: string): Promise<{ from: string; to: string }> {
    const absFrom = this.resolve(from);
    const absTo = this.resolve(to);
    await this.assertNoSymlink(absFrom);
    await this.assertNoSymlink(absTo);
    const st = await stat(absFrom).catch(() => null);
    if (!st) throw AppError.notFound("NOT_FOUND", "Source path not found");
    await mkdir(path.dirname(absTo), { recursive: true });
    await rename(absFrom, absTo);
    return {
      from: path.relative(this.root, absFrom).split(path.sep).join("/"),
      to: path.relative(this.root, absTo).split(path.sep).join("/"),
    };
  }

  async deleteEntry(userPath: string): Promise<void> {
    const abs = this.resolve(userPath);
    await this.assertNoSymlink(abs);
    const st = await lstat(abs).catch(() => null);
    if (!st) throw AppError.notFound("NOT_FOUND", "Path not found");
    if (st.isDirectory()) {
      await rm(abs, { recursive: true, force: false });
    } else {
      await unlink(abs);
    }
  }

  /** Enforce workspace-wide quotas before creating/writing. */
  private async checkQuotas(targetAbs: string, incomingBytes: number): Promise<void> {
    const usage = await this.usage();
    const existing = await stat(targetAbs).catch(() => null);
    if (!existing && usage.fileCount >= LIMITS.MAX_FILE_COUNT) {
      throw AppError.tooMany("QUOTA_FILES", "Workspace file count limit reached");
    }
    const isFile = !!existing?.isFile();
    const delta = isFile
      ? Math.max(0, incomingBytes - (existing?.size ?? 0))
      : incomingBytes;
    if (usage.totalBytes + delta > LIMITS.MAX_WORKSPACE_BYTES) {
      throw AppError.tooMany("QUOTA_SIZE", "Workspace size limit reached");
    }
  }

  async usage(): Promise<{ totalBytes: number; fileCount: number }> {
    let totalBytes = 0;
    let fileCount = 0;
    const walk = async (dir: string, depth: number): Promise<void> => {
      if (depth > LIMITS.MAX_DEPTH + 2) return;
      const dirents = await readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const d of dirents) {
        const p = path.join(dir, d.name);
        if (d.isSymbolicLink()) continue; // never follow
        if (d.isDirectory()) {
          await walk(p, depth + 1);
        } else if (d.isFile()) {
          fileCount += 1;
          const st = await stat(p).catch(() => null);
          if (st) totalBytes += st.size;
        }
      }
    };
    await walk(this.root, 0);
    return { totalBytes, fileCount };
  }
}

export function revisionOf(content: Buffer, st?: { mtimeMs?: number; size?: number }): string {
  const hash = createHash("sha256").update(content).digest("hex").slice(0, 16);
  const mtime = st?.mtimeMs !== undefined ? Math.floor(st.mtimeMs) : 0;
  return `${hash}.${mtime.toString(36)}`;
}

export function looksBinary(buf: Buffer): boolean {
  const sample = buf.subarray(0, 8000);
  for (const b of sample) {
    if (b === 0) return true;
  }
  return false;
}
