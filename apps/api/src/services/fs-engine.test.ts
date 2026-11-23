import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { LIMITS, WorkspaceFS } from "./fs-engine.js";

let storageRoot: string;
let fs: WorkspaceFS;

beforeAll(async () => {
  storageRoot = await mkdtemp(path.join(tmpdir(), "webide-fs-"));
  fs = new WorkspaceFS(storageRoot, "ws_testkey123");
  await fs.ensureRoot();
});

afterAll(async () => {
  await rm(storageRoot, { recursive: true, force: true });
});

describe("path normalization & traversal defense", () => {
  const bad = [
    "../escape.txt",
    "a/../../escape.txt",
    "..",
    "%2e%2e/escape.txt",
    "%2E%2E%2Fescape",
    "/etc/passwd",
    "C:\\windows\\system32",
    "C:/windows/system32",
    "a\0b.txt",
    "a\nb.txt",
    "a/b/c/d/e/f/g/h/i/j/k/l/m.txt", // depth 13 > 12
    "", 
  ];

  for (const p of bad) {
    it(`rejects ${JSON.stringify(p)}`, async () => {
      await expect(fs.writeFile(p, "x")).rejects.toMatchObject({
        statusCode: expect.any(Number),
      });
    });
  }

  it("accepts normal nested paths", async () => {
    const res = await fs.writeFile("src/deep/nested/file.txt", "hello");
    expect(res.path).toBe("src/deep/nested/file.txt");
    const read = await fs.readFile("src/deep/nested/file.txt");
    expect(read.content.toString()).toBe("hello");
  });
});

describe("symlink defense", () => {
  it("rejects operations through a symlinked directory", async () => {
    const outside = await mkdtemp(path.join(tmpdir(), "webide-outside-"));
    try {
      await writeFile(path.join(outside, "secret.txt"), "topsecret");
      await symlink(outside, path.join(fs.root, "linkdir"));
      await expect(fs.readFile("linkdir/secret.txt")).rejects.toMatchObject({
        code: "SYMLINK_FORBIDDEN",
      });
      await expect(fs.listDir("linkdir")).rejects.toMatchObject({
        code: "SYMLINK_FORBIDDEN",
      });
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});

describe("quotas", () => {
  it("enforces the 2 MiB text file ceiling", async () => {
    const big = Buffer.alloc(LIMITS.MAX_TEXT_FILE_BYTES + 1, 0x61);
    await expect(fs.writeFile("big.txt", big)).rejects.toMatchObject({
      code: "FILE_TOO_LARGE",
    });
  });

  it("allows upload-sized writes via maxBytes override up to 10 MiB", async () => {
    const upload = Buffer.alloc(3 * 1024 * 1024, 0x62);
    const res = await fs.writeFile("upload.bin", upload, {
      maxBytes: LIMITS.MAX_UPLOAD_BYTES,
    });
    expect(res.size).toBe(3 * 1024 * 1024);
  });
});

describe("optimistic concurrency", () => {
  it("detects revision conflicts", async () => {
    const w1 = await fs.writeFile("conflict.txt", "v1");
    await fs.writeFile("conflict.txt", "v2");
    await expect(
      fs.writeFile("conflict.txt", "v3", { expectedRevision: w1.revision }),
    ).rejects.toMatchObject({
      statusCode: 409,
      details: { serverRevision: expect.any(String) },
    });
    // Correct revision succeeds.
    const cur = await fs.readFile("conflict.txt");
    const ok = await fs.writeFile("conflict.txt", "v3", {
      expectedRevision: cur.revision,
    });
    expect(ok.revision).not.toBe(cur.revision);
  });
});

describe("atomicity & listing", () => {
  it("leaves no temp files after writes", async () => {
    const { entries } = await fs.listDir("");
    expect(entries.filter((e) => e.name.includes(".write-"))).toHaveLength(0);
  });

  it("lists directories first then files, alphabetically", async () => {
    await fs.mkdirEntry("zdir");
    await fs.writeFile("afile.txt", "a");
    const { entries } = await fs.listDir("");
    const kinds = entries.map((e) => e.kind);
    expect(kinds.indexOf("directory")).toBeLessThan(kinds.lastIndexOf("file"));
  });

  it("renames within workspace", async () => {
    await fs.writeFile("old/name.txt", "x").catch(async () => {
      await fs.mkdirEntry("old");
      await fs.writeFile("old/name.txt", "x");
    });
    const res = await fs.renameEntry("old/name.txt", "newname.txt");
    expect(res.to).toBe("newname.txt");
    const read = await fs.readFile("newname.txt");
    expect(read.content.toString()).toBe("x");
  });

  it("deletes files and directories", async () => {
    await fs.deleteEntry("newname.txt");
    await expect(fs.readFile("newname.txt")).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
