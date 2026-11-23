"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";

export default function Register() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "", displayName: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await api("/api/v1/auth/register", { body: form });
      router.replace("/dashboard");
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg-canvas)" }}>
      <form onSubmit={submit} style={{ width: 340, background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 8, padding: 28 }}>
        <h1 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Create account</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 12, marginBottom: 20 }}>WebIDE workbench</p>
        {(["displayName", "email", "password"] as const).map((k) => (
          <div key={k} style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
              {k === "displayName" ? "Display name" : k === "email" ? "Email" : "Password (min 10 chars)"}
            </label>
            <input
              type={k === "password" ? "password" : k === "email" ? "email" : "text"}
              required minLength={k === "password" ? 10 : undefined}
              value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-primary)", fontSize: 13, boxSizing: "border-box" }}
            />
          </div>
        ))}
        {error && <p role="alert" style={{ color: "var(--error)", fontSize: 12 }}>{error}</p>}
        <button type="submit" disabled={busy} style={{ width: "100%", marginTop: 8, padding: "9px", borderRadius: 6, background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
          {busy ? "Creating…" : "Create account"}
        </button>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 14 }}>
          Have an account? <a href="/login" style={{ color: "var(--accent)" }}>Sign in</a>
        </p>
      </form>
    </main>
  );
}
