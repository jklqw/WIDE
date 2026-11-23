"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    api("/api/v1/auth/me")
      .then(() => router.replace("/dashboard"))
      .catch(() => router.replace("/login"));
  }, [router]);
  return (
    <div style={{ display: "grid", placeItems: "center", height: "100vh" }}>
      <div style={{ color: "var(--text-muted)" }}>Loading…</div>
    </div>
  );
}
