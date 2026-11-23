import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StarterFile } from "@ide/database";

/**
 * Minimal workspace storage bootstrap used at workspace creation time.
 * Template paths are server-controlled constants (trusted); user-supplied
 * path handling is hardened separately in the filesystem engine
 * (security commit). This module only ever writes inside
 * <root>/<storageKey>/.
 */
export function workspaceRoot(storageRoot: string, storageKey: string): string {
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(storageKey)) {
    throw new Error("invalid storage key");
  }
  return path.resolve(storageRoot, storageKey);
}

export async function hydrateWorkspace(
  storageRoot: string,
  storageKey: string,
  files: StarterFile[],
): Promise<string> {
  const root = workspaceRoot(storageRoot, storageKey);
  for (const file of files) {
    // Template paths are trusted constants; still normalize defensively.
    const rel = path.posix.normalize(file.path).replace(/^([/\\])+/, "");
    if (rel.includes("..") || path.isAbsolute(rel)) {
      throw new Error(`unsafe template path: ${file.path}`);
    }
    const target = path.join(root, rel);
    if (!target.startsWith(root + path.sep)) {
      throw new Error(`template path escapes root: ${file.path}`);
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.content, "utf8");
  }
  return root;
}
