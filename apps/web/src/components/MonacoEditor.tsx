"use client";
import dynamic from "next/dynamic";
import { useWorkbench } from "@/store/workbench";

const Editor = dynamic(() => import("@monaco-editor/react").then((m) => m.default), { ssr: false });

export function MonacoPane({ wsId }: { wsId: string }) {
  const activePath = useWorkbench((s) => s.activePath);
  const files = useWorkbench((s) => s.files);
  const updateContent = useWorkbench((s) => s.updateContent);
  const markSaved = useWorkbench((s) => s.markSaved);
  const setCursor = useWorkbench((s) => s.setCursor);
  const theme = useWorkbench((s) => s.theme);
  const file = files.find((f) => f.path === activePath) ?? null;

  if (!file) {
    return (
      <div style={{ flex: 1, display: "grid", placeItems: "center", color: "var(--text-muted)", fontSize: 13 }}>
        Select a file from the explorer, or press Ctrl+P to quick-open.
      </div>
    );
  }

  const active = file;
  async function save() {
    const f = useWorkbench.getState().files.find((x) => x.path === active.path);
    if (!f?.dirty) return;
    useWorkbench.setState((s) => ({ files: s.files.map((x) => x.path === active.path ? { ...x, saving: true } : x) }));
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/workspaces/${wsId}/file`, {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json", "x-csrf-token": await getCsrf() },
        body: JSON.stringify({ path: f.path, content: f.content, expectedRevision: f.revision }),
      });
      if (res.status === 409) {
        if (confirm("File changed on server. Reload server version?")) {
          const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/workspaces/${wsId}/file?path=${encodeURIComponent(f.path)}`, { credentials: "include" });
          const j = await r.json();
          markSaved(active.path, j.revision);
          useWorkbench.getState().files.find((x) => x.path === f.path);
          // force content update
          updateContent(f.path, j.content);
          markSaved(active.path, j.revision);
        }
        return;
      }
      if (!res.ok) throw new Error("save failed");
      const j = await res.json();
      markSaved(active.path, j.revision);
    } catch { alert("Save failed"); }
    finally { useWorkbench.setState((s) => ({ files: s.files.map((x) => x.path === active.path ? { ...x, saving: false } : x) })); }
  }

  return (
    <Editor
      height="100%"
      theme={theme === "dark" ? "vs-dark" : "light"}
      language={active.language}
      value={active.content}
      onChange={(v) => updateContent(active.path, v ?? "")}
      onMount={(editor, monaco) => {
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => save());
        editor.onDidChangeCursorPosition((e) => setCursor(e.position.lineNumber, e.position.column));
        // autosave debounce
        let t: ReturnType<typeof setTimeout>;
        const settings = JSON.parse(localStorage.getItem("webide-settings") ?? "{}");
        const interval = settings.autosave ?? 750;
        if (interval > 0) {
          editor.onDidChangeModelContent(() => {
            clearTimeout(t);
            t = setTimeout(() => {
              const f = useWorkbench.getState().files.find((x) => x.path === active.path);
              if (f?.dirty) save();
            }, interval);
          });
        }
      }}
      options={{
        fontSize: JSON.parse(localStorage.getItem("webide-settings") ?? "{}").fontSize ?? 13,
        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
        minimap: { enabled: JSON.parse(localStorage.getItem("webide-settings") ?? "{}").minimap ?? true },
        wordWrap: (JSON.parse(localStorage.getItem("webide-settings") ?? "{}").wordWrap ?? "off") as "off" | "on" | "wordWrapColumn",
        tabSize: JSON.parse(localStorage.getItem("webide-settings") ?? "{}").tabSize ?? 2,
        automaticLayout: true,
        scrollBeyondLastLine: false,
        renderLineHighlight: "line",
        padding: { top: 8 },
      }}
    />
  );
}

async function getCsrf(): Promise<string> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/csrf`, { credentials: "include" });
  return (await res.json()).csrfToken;
}
