"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sun, Moon } from "lucide-react";

export default function Settings() {
  const router = useRouter();
  const [theme, setTheme] = useState<"dark"|"light">("dark");
  const [fontSize, setFontSize] = useState(13);
  const [tabSize, setTabSize] = useState(2);
  const [wordWrap, setWordWrap] = useState("off");
  const [minimap, setMinimap] = useState(true);
  const [autosave, setAutosave] = useState(750);

  useEffect(() => {
    const t = (localStorage.getItem("webide-theme") as "dark"|"light") ?? "dark";
    setTheme(t); document.documentElement.dataset.theme = t;
    const s = JSON.parse(localStorage.getItem("webide-settings") ?? "{}");
    if (s.fontSize) setFontSize(s.fontSize);
    if (s.tabSize) setTabSize(s.tabSize);
    if (s.wordWrap) setWordWrap(s.wordWrap);
    if (s.minimap !== undefined) setMinimap(s.minimap);
    if (s.autosave) setAutosave(s.autosave);
  }, []);

  function save(patch: Record<string, unknown>) {
    const s = { fontSize, tabSize, wordWrap, minimap, autosave, ...patch };
    localStorage.setItem("webide-settings", JSON.stringify(s));
  }

  const row = (label: string, control: React.ReactNode) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ color: "var(--text-primary)", fontSize: 13 }}>{label}</span>
      {control}
    </div>
  );
  const sel = (v: string, set: (x: string) => void, opts: string[]) => (
    <select value={v} onChange={(e) => { set(e.target.value); save({}); }} style={{ background: "var(--bg-surface)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 8px", fontSize: 12 }}>
      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-canvas)", padding: "32px" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 24 }}>Settings</h1>
        {row("Theme", (
          <button onClick={() => {
            const nt = theme === "dark" ? "light" : "dark";
            setTheme(nt); localStorage.setItem("webide-theme", nt);
            document.documentElement.dataset.theme = nt;
          }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-primary)", cursor: "pointer", fontSize: 12 }}>
            {theme === "dark" ? <Sun size={14}/> : <Moon size={14}/>} {theme}
          </button>
        ))}
        {row("Editor font size", sel(String(fontSize), (v) => { setFontSize(+v); save({ fontSize: +v }); }, ["11","12","13","14","15","16"]))}
        {row("Tab size", sel(String(tabSize), (v) => { setTabSize(+v); save({ tabSize: +v }); }, ["2","4","8"]))}
        {row("Word wrap", sel(wordWrap, (v) => { setWordWrap(v); save({ wordWrap: v }); }, ["off","on","wordWrapColumn"]))}
        {row("Minimap", (
          <input type="checkbox" checked={minimap} onChange={(e) => { setMinimap(e.target.checked); save({ minimap: e.target.checked }); }} />
        ))}
        {row("Autosave interval (ms)", sel(String(autosave), (v) => { setAutosave(+v); save({ autosave: +v }); }, ["0","500","750","1500","3000"]))}
        <button onClick={() => router.push("/dashboard")} style={{ marginTop: 20, padding: "7px 14px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-primary)", cursor: "pointer", fontSize: 13 }}>Back to dashboard</button>
      </div>
    </div>
  );
}
