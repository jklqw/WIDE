# Architecture

```
Browser (Next.js :3000)
   │ HTTPS/WS (session cookie + CSRF)
   ▼
apps/api (Fastify :3001) ── Prisma ──► PostgreSQL 16
   │            │                        ▲
   │            └── ioredis ──► Redis 7  │ Pub/Sub exec:<jobId>, term:<id>
   │ mintCapability (HMAC, ≤60s)
   ▼
apps/runner (Fastify :3002, loopback/internal only)
   │ Docker socket (only holder)
   ▼
Sandbox containers: uid 10001, network=none, RO rootfs,
seccomp, 1 vCPU / 512 MiB / 64 PIDs, workspace-only bind
```

- **Web** — Next.js 15 App Router, React 19, Tailwind, Monaco, xterm.js,
  Zustand store, React Query-ready API client with CSRF handling.
- **API** — Fastify + Prisma + Zod contracts shared via
  `packages/contracts`; auth (Argon2id, HttpOnly sessions), CSRF,
  workspace authorization, jailed filesystem engine, execution and
  terminal orchestration.
- **Runner** — private service owning the Docker socket; hardened
  container policy, lease tracking + reaper, PTY exec sessions.
- **Sandbox** — allowlisted runtime registry (Python, Node/TS, C, C++,
  Java, Go), fixed-argv adapters, compiler diagnostic parsers,
  capability token implementation.
