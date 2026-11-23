# Engineering Report — Web-Based IDE

Single consolidated English engineering report covering all 20 commits.
Each section records summary, files, decisions, security controls, and
verification evidence.

## Table of Contents

- [Master Commit History](#master-commit-history) _(reconciled in Commit 20)_
- [Executive Summary](#executive-summary) _(finalized in Commit 20)_
- Section 01 — Monorepo Foundation, Tooling & Repo Hygiene
- Section 02 — Local Infrastructure (PostgreSQL & Redis)
- Section 03 — Shared Contracts & Protocol Schemas
- Section 04 — Database Schema, Migrations & Starter Templates
- Section 05 — API Service Bootstrap, Env Validation & Observability
- Section 06 — Auth, Sessions, CSRF & Brute-Force Protection (Security)
- Section 07 — Workspace Management & Ownership Authorization
- Section 08 — Hardened Workspace Filesystem Engine (Security)
- Section 09 — Workspace Filesystem REST Endpoints
- Section 10 — Sandbox Package & Private Runner Service
- Section 11 — Container Isolation, Seccomp, Non-Root & Ceilings (Security)
- Section 12 — Network Egress Denial & Signed Capabilities (Security)
- Section 13 — Compile & Run Pipeline, Queue & Language Adapters
- Section 14 — Sandbox-Backed Interactive Terminal
- Section 15 — Web Shell, Auth Flows & Workspace Dashboard
- Section 16 — Monaco Editor Workbench & File Explorer
- Section 17 — xterm.js Terminal, Output & Problems Panel
- Section 18 — CSP, Security Headers, Sanitization & Quotas (Security)
- Section 19 — Automated Test Suites & CI
- Section 20 — Documentation & Final Reconciliation

## Executive Summary

_(Pending — finalized in Commit 20.)_

## Master Commit History

_(Pending — reconciled from `git log --reverse --oneline` in Commit 20.)_

---

## Section 01 — Monorepo Foundation, Tooling & Repo Hygiene

- **Commit:** `pending` (`chore(repo): initialize pnpm monorepo, strict TypeScript tooling, and agent memory`)
- **Phase Type:** Foundation
- **Date (UTC):** 2026-11-23

### 1. Summary of Changes

Initialized a clean pnpm monorepo for the web-based IDE per GUIDE.md
Section 3. Established strict TypeScript base configuration
(`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`),
root orchestration scripts for dev/build/lint/typecheck/test/infra/db,
editor/hygiene files, agent memory files (`.agent/MEMORY.md`,
`.agent/WORKLOG.md`, `AGENTS.md`), and this consolidated engineering
report.

### 2. Key Files Created / Modified

- `package.json` — root workspace scripts & dev dependencies.
- `pnpm-workspace.yaml` — `apps/*`, `packages/*` workspace globs.
- `tsconfig.base.json` — strict shared TS config.
- `.npmrc` — pins `registry.npmmirror.com` (npmjs.org unreachable on this host).
- `.gitignore`, `.editorconfig`, `.nvmrc`, `.env.example` — repo hygiene.
- `AGENTS.md`, `.agent/MEMORY.md`, `.agent/WORKLOG.md` — agent memory.
- `docs/ENGINEERING_REPORT.md` — this report.
- Directory skeleton: `apps/{web,api,runner}`, `packages/{contracts,database,editor,sandbox}`, `infra/{compose,docker}`, `tests/{security,e2e}`, `.github/workflows`.

### 3. Architecture & Optimization Decisions

pnpm workspaces give strict dependency isolation and a single lockfile.
`NodeNext` module resolution keeps ESM/CJS interop explicit across the
three services. Root scripts use `pnpm -r` so each package owns its own
build/lint/test lifecycle — no centralized build logic to rot.

### 4. Security Controls & Threat Mitigation

`.gitignore` excludes `.env*`, `node_modules`, `dist`, `.next`,
`.local-data`, logs, and coverage so secrets and artifacts cannot be
committed accidentally. `.env.example` contains placeholders only.
No runtime code introduced; no new attack surface.

### 5. Verification & Test Evidence

- `pnpm install` — PASS (152 packages; esbuild postinstall scripts ignored by pnpm policy, platform binary resolved via optional deps).
- `pnpm typecheck` / `pnpm lint` / `pnpm test` — PASS as no-op (`pnpm -r` reports "No projects matched" until packages are scaffolded in Commits 3+).
- `pnpm exec eslint .` — no lintable files yet (repo contains only docs/config); config verified to load without errors.
- `pnpm exec prettier --check .` — PASS after formatting docs.

### 6. Known Limitations / Follow-ups

ESLint flat config (`eslint.config.mjs`, typescript-eslint) and per-package
`lint`/`typecheck`/`test` scripts are introduced as packages are scaffolded
in later commits; root commands become meaningful once workspace packages
exist.

---

## Section 02 — Local Infrastructure (PostgreSQL & Redis)

- **Commit:** `pending` (`chore(infra): add local Docker Compose for PostgreSQL 16 and Redis 7`)
- **Phase Type:** Foundation
- **Date (UTC):** 2026-11-23

### 1. Summary of Changes

Added `infra/compose/docker-compose.yml` defining the two backing services
required by the platform: PostgreSQL 16 (Alpine) and Redis 7 (Alpine). Both
are bound strictly to `127.0.0.1` so they are never exposed on LAN
interfaces. Wired `pnpm infra:up` / `pnpm infra:down` root scripts.

### 2. Key Files Created / Modified

- `infra/compose/docker-compose.yml` — postgres + redis services, healthchecks, named volumes.
- `package.json` — `infra:up` / `infra:down` scripts.

### 3. Architecture & Optimization Decisions

Postgres uses the official `postgres:16-alpine` image with `pg_isready`
healthcheck and a named volume for durability. Redis runs with
`--maxmemory 256mb --maxmemory-policy allkeys-lru` (safe for BullMQ job
queues where evicting stale keys beats OOM) plus AOF persistence and a
`redis-cli ping` healthcheck. Loopback-only port bindings eliminate
accidental network exposure in development.

### 4. Security Controls & Threat Mitigation

Services bind to `127.0.0.1` only — no `0.0.0.0` exposure. Default dev
credentials (`webide/webide`) are documented placeholders for local use
only and must be overridden via env in any shared environment. No secrets
are committed.

### 5. Verification & Test Evidence

- `pnpm infra:up` — PASS; both containers created and started.
- `docker inspect --format '{{.State.Health.Status}}'` — `healthy` for
  `webide-infra-postgres-1` and `webide-infra-redis-1`.
- `docker compose ps` — both services `Up`, ports `127.0.0.1:5432` and
  `127.0.0.1:6379` only.

### 6. Known Limitations / Follow-ups

Development credentials are intentionally simple; production deployment
must inject real secrets via environment (see `docs/operations.md` in
Commit 20). Redis AOF `everysec` default is acceptable for dev; tune for
production durability requirements.

---

## Section 03 — Shared Contracts & Protocol Schemas

- **Commit:** `pending` (`feat(contracts): define shared Zod schemas for REST APIs, diagnostics, and WebSockets`)
- **Phase Type:** Feature
- **Date (UTC):** 2026-11-23

### 1. Summary of Changes

Created `packages/contracts` (`@ide/contracts`), the single source of
truth for every REST DTO, error envelope, compiler diagnostic, and
WebSocket message exchanged between `apps/web`, `apps/api`, and
`apps/runner`. All schemas are strict Zod objects with bounded sizes.

### 2. Key Files Created / Modified

- `packages/contracts/src/errors.ts` — canonical `ApiErrorSchema` envelope (`code`, `message`, `requestId`, `details`).
- `packages/contracts/src/auth.ts` — register/login requests, `UserProfile`, session payload.
- `packages/contracts/src/workspaces.ts` — template IDs (`blank`, `python`, `javascript`, `typescript`, `c`, `cpp`, `java`, `go`, `html-web`), create/update/summary schemas.
- `packages/contracts/src/filesystem.ts` — `WorkspaceEntry`, read/write with `revision`, create/rename/delete, upload metadata with 10 MiB ceiling.
- `packages/contracts/src/executions.ts` — 8-state job status machine, `CompilerDiagnostic`, discriminated-union `ExecutionEvent` stream (`status`, `compile_diagnostics`, `stdout`, `stderr`, `completed`, `limit`, `error`).
- `packages/contracts/src/terminal.ts` — `TerminalClientMessage`/`TerminalServerMessage` discriminated unions; PTY bounds `cols 20..300`, `rows 5..120`, 16 KiB input cap.
- `packages/contracts/src/contracts.test.ts` — 11 vitest cases covering acceptance and rejection paths.

### 3. Architecture & Optimization Decisions

Discriminated unions for WS events make exhaustive handling type-safe in
consumers and prevent malformed frames from reaching handlers. Size
ceilings live in the schema layer so both API and runner enforce identical
bounds. `.js` ESM import specifiers in `index.ts` keep NodeNext resolution
correct for consumers.

### 4. Security Controls & Threat Mitigation

All user-controlled strings are length-bounded (emails 254, file content
2 MiB, terminal input 16 KiB/frame, query strings ≤1024 chars) at the
contract layer — the earliest possible validation boundary. Strict
objects reject unexpected fields by default in Zod, reducing parser
differential risk.

### 5. Verification & Test Evidence

- `pnpm --filter @ide/contracts build` — PASS (`tsc` clean).
- `pnpm --filter @ide/contracts test` — PASS (11/11 tests).
- `pnpm --filter @ide/contracts typecheck` — PASS.
- `pnpm --filter @ide/contracts lint` — PASS.

### 6. Known Limitations / Follow-ups

Runtime image allowlist and capability-token payload schemas are defined
in `packages/sandbox` (Commit 10/12) since they are runner-internal
concerns, not browser-facing DTOs.
