"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { useWorkbench } from "@/store/workbench";
import { Explorer } from "@/components/Explorer";
import { EditorTabs } from "@/components/EditorTabs";
import { MonacoPane } from "@/components/MonacoEditor";
import { BottomPanel } from "@/components/BottomPanel";
import { PanelLeft, Play, TerminalSquare, Sun, Moon, Search, Settings } from "lucide-react";
import { languageForFile } from "@ide/editor";

export default function WorkspacePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const [wsName, setWsName] = useState("…");
  const [palette, setPalette] = useState<null | { mode: "open" | "command" }>(null);
  const [paletteQ, setPaletteQ] = useState("");
  const [results, setResults] = useState<{ path: string; name: string }[]>([]);
  const files = useWorkbench((s) => s.files);
  const activePath = useWorkbench((s) => s.activePath);
  const openFile = useWorkbench((s) => s.openFile);
  const panel = useWorkbench((s) => s.panel);
  const togglePanel = useWorkbench((s) => s.togglePanel);
  const theme = useWorkbench((s) => s.theme);
  const setTheme = useWorkbench((s) => s.setTheme);
  const sandboxStatus = useWorkbench((s) => s.sandboxStatus);
  const cursor = useWorkbench((s) => s.cursor);
  const sidebarOpen = useWorkbench((s) => s.sidebarOpen);
  const setSidebarOpen = useWorkbench((s) => s.setSidebarOpen);

  useEffect(() => {
    api<{ name: string }>(`/api/v1/workspaces/${workspaceId}`)
      .then((w) => setWsName(w.name))
      .catch(() => router.replace("/dashboard"));
  }, [workspaceId, router]);

  // Global shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "s") { e.preventDefault(); }
      if (mod && e.key === "`") { e.preventDefault(); togglePanel("terminal"); }
      if (mod && e.key === "p" && e.shiftKey) { e.preventDefault(); setPalette({ mode: "command" }); setPaletteQ(""); }
      else if (mod && e.key === "p") { e.preventDefault(); setPalette({ mode: "open" }); setPaletteQ(""); }
      if (e.key === "F5" && e.shiftKey) { e.preventDefault(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePanel]);

  // Palette file search
  useEffect(() => {
    if (!palette || palette.mode !== "open" || !paletteQ) { setResults([]); return; }
    const t = setTimeout(async () => {
      try {
        // walk root listing shallowly — quick-open searches top 2 levels
        const all: { path: string; name: string }[] = [];
        async function walk(p: string, depth: number) {
          if (depth > 3) return;
          const r = await api<{ entries: { path: string; kind: string; name: string }[] }>(
            `/api/v1/workspaces/${workspaceId}/files?path=${encodeURIComponent(p)}`);
          for (const e of r.entries) {
            if (e.kind === "file" && e.name.toLowerCase().includes(paletteQ.toLowerCase())) all.push({ path: e.path, name: e.name });
            if (e.kind === "directory") await walk(e.path, depth + 1);
          }
        }
        await walk("", 0);
        setResults(all.slice(0, 20));
      } catch { /* ignore */ }
    }, 150);
    return () => clearTimeout(t);
  }, [palette, paletteQ, workspaceId]);

  async function quickOpen(path: string) {
    setPalette(null);
    const existing = files.find((f) => f.path === path);
    if (existing) { openFile(existing); return; }
    try {
      const f = await api<{ path: string; content: string; revision: string }>(
        `/api/v1/workspaces/${workspaceId}/file?path=${encodeURIComponent(path)}`);
      openFile({ path: f.path, name: f.path.split("/").pop()!, content: f.content, revision: f.revision, language: languageForFile(f.path), dirty: false, saving: false });
    } catch { /* ignore */ }
  }

  const commands = [
    { label: "Run file", hint: "Ctrl+Enter", run: () => document.querySelector<HTMLButtonElement>('[title="Run (Ctrl+Enter)"]')?.click() },
    { label: "Toggle terminal", hint: "Ctrl+`", run: () => togglePanel("terminal") },
    { label: "Toggle theme", run: () => { const nt = theme === "dark" ? "light" : "dark"; setTheme(nt); localStorage.setItem("webide-theme", nt); document.documentElement.dataset.theme = nt; } },
    { label: "Toggle sidebar", run: () => setSidebarOpen(!sidebarOpen) },
    { label: "Settings", run: () => router.push("/settings") },
    { label: "Dashboard", run: () => router.push("/dashboard") },
  ];

  const filteredCmds = commands.filter((c) => c.label.toLowerCase().includes(paletteQ.toLowerCase()));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg-canvas)" }}>
      {/* Top bar */}
      <header style={{ display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 12px", borderBottom: "1px solid var(--border)", background: "var(--bg-surface)", flexShrink: 0 }}>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle sidebar" style={ib}><PanelLeft size={15}/></button>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{wsName}</span>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>/ {files.find((f) => f.path === activePath)?.name ?? ""}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: sandboxStatus === "idle" ? "var(--text-muted)" : "var(--warning)", display: "flex", alignItems: "center", gap: 5 }}>
          {sandboxStatus !== "idle" && <span className="live-dot" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--warning)", display: "inline-block" }} />}
          {sandboxStatus}
        </span>
        <button onClick={() => setPalette({ mode: "open" })} title="Quick open (Ctrl+P)" style={{ ...ib, fontSize: 11, gap: 4 }}><Search size={13}/><span style={{ color: "var(--text-muted)" }}>Ctrl+P</span></button>
        <button onClick={() => togglePanel("output")} title="Run" style={ib}><Play size={14}/></button>
        <button onClick={() => togglePanel("terminal")} title="Terminal (Ctrl+`)" style={ib}><TerminalSquare size={14}/></button>
        <button onClick={() => { const nt = theme === "dark" ? "light" : "dark"; setTheme(nt); localStorage.setItem("webide-theme", nt); document.documentElement.dataset.theme = nt; }} aria-label="Theme" style={ib}>{theme === "dark" ? <Sun size={14}/> : <Moon size={14}/>}</button>
        <button onClick={() => router.push("/settings")} aria-label="Settings" style={ib}><Settings size={14}/></button>
      </header>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {sidebarOpen && (
          <aside style={{ width: 240, borderRight: "1px solid var(--border)", background: "var(--bg-surface)", overflow: "hidden", flexShrink: 0 }}>
            <Explorer wsId={workspaceId} />
          </aside>
        )}
        <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
          <EditorTabs />
          <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
            <MonacoPane wsId={workspaceId} />
          </div>
          <div style={{ height: panel ? 220 : 32, flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {panel && <BottomPanel wsId={workspaceId} />}
          </div>
        </main>
      </div>

      {/* Status bar */}
      <footer style={{ display: "flex", alignItems: "center", gap: 14, height: 24, padding: "0 12px", borderTop: "1px solid var(--border)", background: "var(--bg-panel)", fontSize: 11, color: "var(--text-secondary)", flexShrink: 0 }}>
        <span style={{ color: "var(--accent)" }}>●</span>
        <span>Ln {cursor.line}, Col {cursor.col}</span>
        <span>{files.find((f) => f.path === activePath)?.language ?? "plaintext"}</span>
        <span>{files.find((f) => f.path === activePath)?.dirty ? "Modified" : "Saved"}</span>
        <div style={{ flex: 1 }} />
        <span>UTF-8</span>
        <span>Spaces: {JSON.parse(localStorage.getItem("webide-settings") ?? "{}").tabSize ?? 2}</span>
      </footer>

      {/* Command palette / quick open */}
      {palette && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 60, display: "flex", justifyContent: "center", paddingTop: "12vh" }} onClick={() => setPalette(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 560, background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", alignSelf: "flex-start" }}>
            <input autoFocus value={paletteQ} onChange={(e) => setPaletteQ(e.target.value)}
              placeholder={palette.mode === "open" ? "Search files by name…" : "Type a command…"}
              style={{ width: "100%", padding: "12px 16px", border: "none", borderBottom: "1px solid var(--border)", background: "var(--bg-panel)", color: "var(--text-primary)", fontSize: 14, outline: "none" }} />
            <div style={{ maxHeight: 320, overflow: "auto" }}>
              {palette.mode === "open" ? (
                results.map((r) => (
                  <button key={r.path} onClick={() => quickOpen(r.path)}
                    style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 16px", border: "none", background: "transparent", color: "var(--text-primary)", fontSize: 13, cursor: "pointer" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                    {r.path}
                  </button>
                ))
              ) : (
                filteredCmds.map((c) => (
                  <button key={c.label} onClick={() => { setPalette(null); c.run(); }}
                    style={{ display: "flex", justifyContent: "space-between", width: "100%", textAlign: "left", padding: "8px 16px", border: "none", background: "transparent", color: "var(--text-primary)", fontSize: 13, cursor: "pointer" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                    {c.label}<span style={{ color: "var(--text-muted)", fontSize: 11 }}>{c.hint}</span>
                  </button>
                ))
              )}
              {palette.mode === "open" && results.length === 0 && paletteQ && (
                <div style={{ padding: 16, color: "var(--text-muted)", textAlign: "center", fontSize: 12 }}>No files found</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const ib: React.CSSProperties = { padding: 5, border: "1px solid var(--border)", borderRadius: 5, background: "transparent", color: "var(--text-secondary)", cursor: "pointer", display: "flex", alignItems: "center" };
