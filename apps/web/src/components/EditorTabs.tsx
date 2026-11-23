"use client";
import { useWorkbench } from "@/store/workbench";
import { X } from "lucide-react";

export function EditorTabs() {
  const files = useWorkbench((s) => s.files);
  const activePath = useWorkbench((s) => s.activePath);
  const setActive = useWorkbench((s) => s.setActive);
  const closeFile = useWorkbench((s) => s.closeFile);

  return (
    <div style={{ display: "flex", overflowX: "auto", background: "var(--bg-panel)", borderBottom: "1px solid var(--border)", height: 34, alignItems: "stretch" }}>
      {files.map((f) => (
        <div key={f.path}
          onClick={() => setActive(f.path)}
          onAuxClick={(e) => { if (e.button === 1) closeFile(f.path); }}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 12px", fontSize: 12, cursor: "pointer", borderRight: "1px solid var(--border)", color: activePath === f.path ? "var(--text-primary)" : "var(--text-secondary)", background: activePath === f.path ? "var(--bg-surface)" : "transparent", whiteSpace: "nowrap", userSelect: "none" }}>
          <span>{f.name}</span>
          {f.dirty && <span style={{ color: "var(--accent)", fontSize: 10 }}>●</span>}
          <button onClick={(e) => { e.stopPropagation(); closeFile(f.path); }} aria-label="Close" style={{ border: "none", background: "transparent", color: "inherit", cursor: "pointer", padding: 2, display: "flex", opacity: 0.6 }}>
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
