# WebIDE

A browser-based IDE with sandboxed multi-language execution, built as a
pnpm monorepo: Next.js frontend, Fastify API, private Docker-backed
runner, and hardened per-job sandbox containers.

## Stack

- **Web** — Next.js 15, React 19, Tailwind, Monaco editor, xterm.js
- **API** — Fastify, Prisma, PostgreSQL 16, Redis 7, Zod contracts
- **Runner** — private Fastify service; sole Docker socket holder
- **Sandbox** — Docker containers (gVisor/Kata-ready via
  `SANDBOX_OCI_RUNTIME`): uid 10001, `network=none`, read-only rootfs,
  cap-drop ALL, custom seccomp, 1 vCPU / 512 MiB / 64 PIDs

## Quick start

```bash
pnpm install
pnpm infra:up                 # Postgres + Redis on 127.0.0.1
pnpm db:migrate && pnpm db:seed
pnpm runner:build-images      # one-time sandbox images
pnpm dev                      # web :3000 · api :3001 · runner :3002
```

Demo login: `demo@webide.local` / `Demo1234!` (local dev only).

## Layout

```
apps/web        Next.js IDE (auth, dashboard, Monaco workbench, xterm)
apps/api        Fastify API (auth, workspaces, jailed fs, executions, terminals)
apps/runner     Private sandbox orchestrator (Docker)
packages/contracts  Shared Zod schemas
packages/database   Prisma schema + migrations + templates
packages/sandbox    Runtime registry, diagnostics, capability tokens
packages/editor     Editor language/theme helpers
infra/compose   Postgres + Redis
infra/docker    Sandbox Dockerfiles, seccomp profile, build script
```

## Security

See `docs/security.md` — capability-token auth between API and runner,
single-use jti replay protection, CSRF + HttpOnly sessions, jailed
filesystem paths, and fully isolated non-root networkless sandboxes.
Production hardening (gVisor/Kata, TLS, Redis-backed rate limits) is
documented in `docs/operations.md`.

## Scripts

`pnpm dev` · `pnpm build` · `pnpm lint` · `pnpm typecheck` ·
`pnpm test` · `pnpm test:security` · `pnpm e2e` · `pnpm infra:up/down`
