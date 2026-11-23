"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await api("/api/v1/auth/login", { body: { email, password } });
      router.replace("/dashboard");
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg-canvas)" }}>
      <form onSubmit={submit} style={{ width: 340, background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 8, padding: 28 }}>
        <h1 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Sign in</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 12, marginBottom: 20 }}>WebIDE workbench</p>
        <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>Email</label>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          style={inputStyle} autoComplete="email" />
        <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", margin: "12px 0 4px" }}>Password</label>
        <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
          style={inputStyle} autoComplete="current-password" />
        {error && <p role="alert" style={{ color: "var(--error)", fontSize: 12, marginTop: 10 }}>{error}</p>}
        <button type="submit" disabled={busy} style={{ ...inputStyle, marginTop: 16, background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer", fontWeight: 600 }}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 14 }}>
          No account? <a href="/register" style={{ color: "var(--accent)" }}>Register</a>
        </p>
      </form>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", borderRadius: 6,
  border: "1px solid var(--border)", background: "var(--bg-surface)",
  color: "var(--text-primary)", fontSize: 13, boxSizing: "border-box",
};
