"use client";
import { useEffect, useRef, useState } from "react";
import { Play, Square, Trash2 } from "lucide-react";
import { useWorkbench } from "@/store/workbench";
import { api } from "@/lib/api-client";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function BottomPanel({ wsId }: { wsId: string }) {
  const panel = useWorkbench((s) => s.panel);
  const setPanel = useWorkbench((s) => s.setPanel);
  const output = useWorkbench((s) => s.output);
  const appendOutput = useWorkbench((s) => s.appendOutput);
  const clearOutput = useWorkbench((s) => s.clearOutput);
  const diagnostics = useWorkbench((s) => s.diagnostics);
  const files = useWorkbench((s) => s.files);
  const openFile = useWorkbench((s) => s.openFile);
  const setActive = useWorkbench((s) => s.setActive);
  const sandboxStatus = useWorkbench((s) => s.sandboxStatus);
  const setSandboxStatus = useWorkbench((s) => s.setSandboxStatus);
  const [termId, setTermId] = useState<string | null>(null);
  const [termStatus, setTermStatus] = useState<"idle"|"connecting"|"connected"|"closed">("idle");
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<{ write:(d:string)=>void; dispose:()=>void; onData:(cb:(d:string)=>void)=>void; fit:()=>void; cols:number; rows:number } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const runWsRef = useRef<WebSocket | null>(null);

  // xterm lazy load
  useEffect(() => {
    if (panel !== "terminal" || !termRef.current) return;
    let disposed = false;
    (async () => {
      const { Terminal } = await import("@xterm/xterm");
      const { FitAddon } = await import("@xterm/addon-fit");
      const { WebLinksAddon } = await import("@xterm/addon-web-links");
      if (disposed || !termRef.current) return;
      const term = new Terminal({
        fontFamily: '"JetBrains Mono", monospace', fontSize: 13,
        theme: { background: "#11141A", foreground: "#E6EDF3", cursor: "#3B82F6" },
        cursorBlink: true, scrollback: 5000,
      });
      const fit = new FitAddon();
      term.loadAddon(fit); term.loadAddon(new WebLinksAddon());
      term.open(termRef.current);
      fit.fit();
      const wrapped = { write: (d: string) => term.write(d), dispose: () => term.dispose(), onData: (cb: (d: string) => void) => term.onData(cb), fit: () => fit.fit(), cols: term.cols, rows: term.rows, _t: term };
      xtermRef.current = wrapped as never;
      const ro = new ResizeObserver(() => fit.fit());
      ro.observe(termRef.current);
      return () => { ro.disconnect(); term.dispose(); };
    })();
    return () => { disposed = true; };
  }, [panel]);

  async function startTerminal() {
    setTermStatus("connecting");
    try {
      const t = await api<{id:string;ticket:string}>(`/api/v1/workspaces/${wsId}/terminals`, { body: { cols: xtermRef.current?.cols ?? 120, rows: xtermRef.current?.rows ?? 30 } });
      setTermId(t.id);
      const proto = API.startsWith("https") ? "wss" : "ws";
      const host = API.replace(/^https?:\/\//, "");
      const ws = new WebSocket(`${proto}://${host}/api/v1/terminals/${t.id}/stream?ticket=${t.ticket}`);
      wsRef.current = ws;
      ws.onopen = () => setTermStatus("connected");
      ws.onmessage = (ev) => {
        try {
          const m = JSON.parse(String(ev.data));
          if (m.type === "data" && xtermRef.current) xtermRef.current.write(m.data);
          if (m.type === "exit") setTermStatus("closed");
        } catch { /* raw */ }
      };
      ws.onclose = () => setTermStatus("closed");
      xtermRef.current?.onData((d) => {
        ws.send(JSON.stringify({ type: "input", data: d }));
      });
    } catch { setTermStatus("closed"); }
  }

  async function runActive() {
    const f = files.find((x) => x.path === useWorkbench.getState().activePath);
    if (!f) return;
    setSandboxStatus("compiling");
    appendOutput("system", `$ run ${f.path}\n`);
    try {
      const job = await api<{id:string;status:string}>(`/api/v1/workspaces/${wsId}/executions`, { body: { sourcePath: f.path } });
      const proto = API.startsWith("https") ? "wss" : "ws";
      const host = API.replace(/^https?:\/\//, "");
      const ws = new WebSocket(`${proto}://${host}/api/v1/executions/${job.id}/stream`);
      runWsRef.current = ws;
      ws.onmessage = (ev) => {
        try {
          const m = JSON.parse(String(ev.data));
          if (m.type === "stdout") { appendOutput("stdout", m.data); }
          else if (m.type === "stderr") appendOutput("stderr", m.data);
          else if (m.type === "compile_diagnostics") useWorkbench.getState().setDiagnostics(m.diagnostics ?? []);
          else if (m.type === "completed" || m.type === "job_finished") {
            setSandboxStatus("idle");
            appendOutput("system", `\n[exit ${m.exitCode ?? "?"} · ${m.durationMs ?? "?"}ms]\n`);
          } else if (m.type === "status") setSandboxStatus(m.status === "running" ? "running" : "compiling");
        } catch { /* ignore */ }
      };
      ws.onclose = () => setSandboxStatus("idle");
    } catch (e) { appendOutput("stderr", `error: ${(e as Error).message}\n`); setSandboxStatus("idle"); }
  }

  async function stopRun() {
    const f = files.find((x) => x.path === useWorkbench.getState().activePath);
    if (!f) return;
    // cancel latest job for workspace — find via GET list isn't exposed; rely on WS close
    runWsRef.current?.close();
    setSandboxStatus("idle");
    appendOutput("system", "[stopped]\n");
  }

  const tabs = [["terminal","Terminal"],["output","Output"],["problems",`Problems${diagnostics.length ? ` (${diagnostics.length})` : ""}`]] as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-surface)", borderTop: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "0 8px", borderBottom: "1px solid var(--border)", height: 32 }}>
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => setPanel(panel === id ? null : id)}
            style={{ padding: "4px 10px", fontSize: 12, border: "none", background: panel === id ? "var(--bg-panel)" : "transparent", color: panel === id ? "var(--text-primary)" : "var(--text-secondary)", cursor: "pointer", borderRadius: "4px 4px 0 0" }}>
            {label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {panel === "terminal" && (
          <>
            <span style={{ fontSize: 11, color: termStatus === "connected" ? "var(--success)" : "var(--text-muted)", marginRight: 8 }}>
              {termStatus === "connected" ? "● connected" : termStatus}
            </span>
            {!termId && <button onClick={startTerminal} style={bbtn}>Start terminal</button>}
            {termId && termStatus !== "connected" && <button onClick={startTerminal} style={bbtn}>Reconnect</button>}
          </>
        )}
        {panel === "output" && (
          <>
            <button onClick={runActive} disabled={sandboxStatus !== "idle"} title="Run (Ctrl+Enter)" style={bbtn}><Play size={13}/></button>
            <button onClick={stopRun} title="Stop (Shift+F5)" style={bbtn}><Square size={12}/></button>
            <button onClick={clearOutput} title="Clear" style={bbtn}><Trash2 size={13}/></button>
          </>
        )}
      </div>
      <div style={{ flex: 1, overflow: "hidden", display: panel ? "block" : "none" }}>
        {panel === "terminal" && <div ref={termRef} style={{ height: "100%", padding: 4 }} />}
        {panel === "output" && (
          <pre style={{ height: "100%", overflow: "auto", margin: 0, padding: "8px 12px", fontSize: 12, fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {output.map((l, i) => (
              <div key={i} style={{ color: l.stream === "stderr" ? "var(--error)" : l.stream === "system" ? "var(--text-muted)" : "var(--text-primary)", borderLeft: l.stream !== "system" ? `2px solid ${l.stream === "stderr" ? "var(--error)" : "var(--accent)"}` : "none", paddingLeft: l.stream !== "system" ? 8 : 0 }}>
                {l.text}
              </div>
            ))}
          </pre>
        )}
        {panel === "problems" && (
          <div style={{ height: "100%", overflow: "auto" }}>
            {diagnostics.length === 0 && <div style={{ padding: 16, color: "var(--text-muted)", textAlign: "center" }}>No problems detected.</div>}
            {diagnostics.map((d, i) => (
              <div key={i} onClick={() => {
                const f = files.find((x) => x.path === d.file || x.path.endsWith(d.file));
                if (f) { openFile(f); setActive(f.path); }
              }}
                style={{ display: "flex", gap: 10, padding: "5px 12px", cursor: "pointer", fontSize: 12, borderBottom: "1px solid var(--border)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                <span style={{ color: d.severity === "error" ? "var(--error)" : "var(--warning)", width: 60, flexShrink: 0 }}>{d.severity}</span>
                <span style={{ color: "var(--accent)", flexShrink: 0 }}>{d.file}:{d.line}{d.col ? `:${d.col}` : ""}</span>
                <span style={{ color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const bbtn: React.CSSProperties = { padding: "3px 8px", fontSize: 11, border: "1px solid var(--border)", borderRadius: 4, background: "var(--bg-surface)", color: "var(--text-secondary)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 };
