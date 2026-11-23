"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Plus, FolderGit2, Search, Trash2, LogOut, Sun, Moon } from "lucide-react";

interface Ws { id: string; name: string; templateId: string; updatedAt: string; description: string | null }
const TEMPLATES = ["blank","python","javascript","typescript","c","cpp","java","go","html-web"];

export default function Dashboard() {
  const router = useRouter();
  const [ws, setWs] = useState<Ws[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [tpl, setTpl] = useState("blank");
  const [theme, setTheme] = useState<"dark"|"light">("dark");
  const [me, setMe] = useState<{displayName:string}|null>(null);

  async function load() {
    try {
      const [list, user] = await Promise.all([
        api<{workspaces: Ws[]}>(`/api/v1/workspaces${q ? `?q=${encodeURIComponent(q)}` : ""}`),
        api<{displayName:string}>("/api/v1/auth/me"),
      ]);
      setWs(list.workspaces); setMe(user);
    } catch { router.replace("/login"); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const t = localStorage.getItem("webide-theme") as "dark"|"light"|null;
    if (t) { setTheme(t); document.documentElement.dataset.theme = t; }
  }, []);

  async function create() {
    if (!name.trim()) return;
    await api("/api/v1/workspaces", { body: { name: name.trim(), templateId: tpl } });
    setShowNew(false); setName(""); load();
  }
  async function del(w: Ws) {
    if (!confirm(`Delete workspace "${w.name}"?`)) return;
    await api(`/api/v1/workspaces/${w.id}`, { method: "DELETE" });
    load();
  }
  async function logout() {
    await api("/api/v1/auth/logout", { method: "POST" });
    router.replace("/login");
  }
  function toggleTheme() {
    const nt = theme === "dark" ? "light" : "dark";
    setTheme(nt); localStorage.setItem("webide-theme", nt);
    document.documentElement.dataset.theme = nt;
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-canvas)" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 24px", height: 48, borderBottom: "1px solid var(--border)", background: "var(--bg-surface)" }}>
        <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: -0.3 }}>WebIDE</span>
        <div style={{ flex: 1 }} />
        <button onClick={toggleTheme} aria-label="Toggle theme" style={iconBtn}>{theme === "dark" ? <Sun size={16}/> : <Moon size={16}/>}</button>
        <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>{me?.displayName}</span>
        <button onClick={logout} aria-label="Sign out" style={iconBtn}><LogOut size={16}/></button>
      </header>
      <main style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600 }}>Workspaces</h1>
          <div style={{ flex: 1 }} />
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: 9, color: "var(--text-muted)" }} />
            <input value={q} onChange={(e) => { setQ(e.target.value); }} onKeyDown={(e) => e.key === "Enter" && load()}
              placeholder="Filter…" style={{ padding: "7px 10px 7px 30px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-primary)", fontSize: 13, width: 200 }} />
          </div>
          <button onClick={() => setShowNew(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 6, background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            <Plus size={15}/> New workspace
          </button>
        </div>

        {loading ? (
          <div style={{ display: "grid", gap: 10 }}>{[0,1,2].map(i => <div key={i} style={{ height: 64, borderRadius: 8, background: "var(--bg-panel)", border: "1px solid var(--border)" }} />)}</div>
        ) : ws.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0", color: "var(--text-muted)" }}>
            <FolderGit2 size={32} style={{ margin: "0 auto 12px", opacity: 0.5 }} />
            <p>No workspaces yet. Create one to start coding.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {ws.map((w) => (
              <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer" }}
                onClick={() => router.push(`/workspace/${w.id}`)}>
                <FolderGit2 size={18} style={{ color: "var(--accent)", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{w.name}</div>
                  {w.description && <div style={{ color: "var(--text-muted)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.description}</div>}
                </div>
                <span style={{ fontSize: 11, color: "var(--text-muted)", background: "var(--bg-hover)", padding: "2px 8px", borderRadius: 10, border: "1px solid var(--border)" }}>{w.templateId}</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{new Date(w.updatedAt).toLocaleDateString()}</span>
                <button onClick={(e) => { e.stopPropagation(); del(w); }} aria-label="Delete" style={iconBtn}><Trash2 size={15}/></button>
              </div>
            ))}
          </div>
        )}
      </main>

      {showNew && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "grid", placeItems: "center", zIndex: 50 }} onClick={() => setShowNew(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 400, background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 10, padding: 24 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>New workspace</h2>
            <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>Name</label>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="my-project"
              style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-primary)", fontSize: 13, boxSizing: "border-box", marginBottom: 14 }} />
            <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Template</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginBottom: 18 }}>
              {TEMPLATES.map((t) => (
                <button key={t} onClick={() => setTpl(t)} style={{ padding: "8px 4px", borderRadius: 6, border: `1px solid ${tpl === t ? "var(--accent)" : "var(--border)"}`, background: tpl === t ? "var(--bg-hover)" : "var(--bg-surface)", color: "var(--text-primary)", fontSize: 11, cursor: "pointer", fontFamily: "monospace" }}>{t}</button>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setShowNew(false)} style={{ padding: "7px 14px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-primary)", cursor: "pointer", fontSize: 13 }}>Cancel</button>
              <button onClick={create} disabled={!name.trim()} style={{ padding: "7px 14px", borderRadius: 6, border: "none", background: "var(--accent)", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const iconBtn: React.CSSProperties = { padding: 6, borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer", display: "flex" };
