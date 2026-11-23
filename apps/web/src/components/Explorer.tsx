"use client";
import { useEffect, useState, useCallback } from "react";
import { api, ApiError, uploadFile } from "@/lib/api-client";
import { FilePlus, FolderPlus, RefreshCw } from "lucide-react";
import { languageForFile } from "@ide/editor";
import { useWorkbench } from "@/store/workbench";

interface Entry { name: string; path: string; kind: "file"|"directory"; size?: number }

export function Explorer({ wsId }: { wsId: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [path, setPath] = useState("");
  const [creating, setCreating] = useState<null | { kind: "file"|"directory" }>(null);
  const [newName, setNewName] = useState("");
  const [menu, setMenu] = useState<{x:number;y:number;entry:Entry}|null>(null);
  const openFile = useWorkbench((s) => s.openFile);

  const load = useCallback(async (p = path) => {
    try {
      const r = await api<{entries: Entry[]}>(`/api/v1/workspaces/${wsId}/files?path=${encodeURIComponent(p)}`);
      setEntries(r.entries);
    } catch { setEntries([]); }
  }, [wsId, path]);

  useEffect(() => { load(path); }, [path]);

  async function open(e: Entry) {
    if (e.kind === "directory") { setPath(e.path); return; }
    try {
      const f = await api<{path:string;content:string;revision:string}>(`/api/v1/workspaces/${wsId}/file?path=${encodeURIComponent(e.path)}`);
      openFile({ path: f.path, name: f.path.split("/").pop()!, content: f.content, revision: f.revision, language: languageForFile(f.path), dirty: false, saving: false });
    } catch (err) {
      if (err instanceof ApiError && err.code === "BINARY_FILE") alert("Binary file — cannot edit as text");
      else alert((err as Error).message);
    }
  }

  async function create() {
    if (!newName.trim() || !creating) return;
    const p = path ? `${path}/${newName.trim()}` : newName.trim();
    await api(`/api/v1/workspaces/${wsId}/files`, { body: { path: p, kind: creating.kind } });
    setCreating(null); setNewName(""); load();
  }

  async function rename(e: Entry) {
    const to = prompt("Rename to:", e.name);
    if (!to || to === e.name) return;
    const toPath = (e.path.split("/").slice(0,-1).concat([to]).join("/"));
    await api(`/api/v1/workspaces/${wsId}/files`, { method: "PATCH", body: { from: e.path, to: toPath } });
    load();
  }

  async function del(e: Entry) {
    if (!confirm(`Delete ${e.path}?`)) return;
    await api(`/api/v1/workspaces/${wsId}/files?path=${encodeURIComponent(e.path)}`, { method: "DELETE" });
    load();
  }

  async function download(e: Entry) {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/workspaces/${wsId}/download?path=${encodeURIComponent(e.path)}`, { credentials: "include" });
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = e.name; a.click();
  }

  async function upload(file: File) {
    const target = path ? `${path}/${file.name}` : file.name;
    await uploadFile(wsId, target, file);
    load();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", fontSize: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 8px", borderBottom: "1px solid var(--border)" }}>
        <span style={{ flex: 1, color: "var(--text-secondary)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Explorer</span>
        <button onClick={() => setCreating({kind:"file"})} title="New file" style={ib}><FilePlus size={14}/></button>
        <button onClick={() => setCreating({kind:"directory"})} title="New folder" style={ib}><FolderPlus size={14}/></button>
        <button onClick={() => load()} title="Refresh" style={ib}><RefreshCw size={13}/></button>
        <label title="Upload" style={{ ...ib, cursor: "pointer" }}>
          <input type="file" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        </label>
      </div>
      {path && (
        <button onClick={() => setPath(path.split("/").slice(0,-1).join("/"))} style={{ textAlign: "left", padding: "4px 10px", border: "none", background: "transparent", color: "var(--accent)", fontSize: 11, cursor: "pointer" }}>
          ← {path.split("/").pop()}
        </button>
      )}
      {creating && (
        <div style={{ padding: "4px 8px" }}>
          <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") create(); if (e.key === "Escape") setCreating(null); }}
            placeholder={creating.kind === "file" ? "filename.py" : "folder-name"}
            style={{ width: "100%", padding: "4px 8px", fontSize: 12, borderRadius: 4, border: "1px solid var(--accent)", background: "var(--bg-surface)", color: "var(--text-primary)" }} />
        </div>
      )}
      <div style={{ flex: 1, overflow: "auto", padding: "4px 0" }}>
        {entries.map((e) => (
          <div key={e.path}
            onClick={() => open(e)}
            onContextMenu={(ev) => { ev.preventDefault(); setMenu({x: ev.clientX, y: ev.clientY, entry: e}); }}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 10px", cursor: "pointer", color: "var(--text-primary)", whiteSpace: "nowrap" }}
            onMouseEnter={(ev) => (ev.currentTarget.style.background = "var(--bg-hover)")}
            onMouseLeave={(ev) => (ev.currentTarget.style.background = "transparent")}>
            <span style={{ color: e.kind === "directory" ? "var(--warning)" : "var(--text-secondary)", fontSize: 11, width: 14, textAlign: "center" }}>{e.kind === "directory" ? "▸" : "·"}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</span>
          </div>
        ))}
        {entries.length === 0 && <div style={{ padding: 16, color: "var(--text-muted)", textAlign: "center" }}>Empty</div>}
      </div>
      {menu && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
          <div style={{ position: "fixed", left: menu.x, top: menu.y, zIndex: 41, background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 6, padding: 4, minWidth: 140, boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}>
            {[
              ["Rename", () => rename(menu.entry)],
              ["Download", () => download(menu.entry)],
              ["Delete", () => del(menu.entry)],
            ].map(([label, fn]) => (
              <button key={label as string} onClick={() => { setMenu(null); (fn as () => void)(); }}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "6px 10px", border: "none", background: "transparent", color: label === "Delete" ? "var(--error)" : "var(--text-primary)", fontSize: 12, cursor: "pointer", borderRadius: 4, textAlign: "left" }}>
                {label === "Rename" ? "✎" : label === "Download" ? "↓" : "🗑"}{" "}{label as string}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const ib: React.CSSProperties = { padding: 4, border: "none", background: "transparent", color: "var(--text-secondary)", cursor: "pointer", display: "flex", borderRadius: 4 };
