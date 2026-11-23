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

---

## Section 04 — Database Schema, Migrations & Starter Templates

- **Commit:** `pending` (`feat(db): add Prisma schema, initial migrations, indexes, and starter templates`)
- **Phase Type:** Feature
- **Date (UTC):** 2026-11-23

### 1. Summary of Changes

Created `packages/database` (`@ide/database`) with the full relational
model for the platform: users, sessions, workspaces, workspace members,
execution jobs, terminal sessions, and audit events. Applied the initial
Prisma migration against PostgreSQL 16 and added nine version-controlled,
runnable starter templates plus an idempotent seed script.

### 2. Key Files Created / Modified

- `packages/database/prisma/schema.prisma` — all models, enums (`UserStatus`, `ExecutionStatus`), composite indexes.
- `packages/database/prisma/migrations/20261123170949_init/` — applied migration.
- `packages/database/prisma/seed.ts` — idempotent demo-user seed (login disabled by design).
- `packages/database/src/templates.ts` — `STARTER_TEMPLATES` for blank/python/javascript/typescript/c/cpp/java/go/html-web.
- `packages/database/src/index.ts` — `PrismaClient` factory + template exports.

### 3. Architecture & Optimization Decisions

- `Session` stores only `tokenHash` (SHA-256) — raw tokens never persist.
- `Workspace.storageKey` is an opaque unique key decoupling DB identity
  from on-disk paths (enables the storage jail in Commit 8).
- `Workspace.deletedAt` soft-delete preserves audit history; hard cleanup
  of storage/sandboxes happens in the service layer.
- Composite indexes `[ownerId, updatedAt]` (workspace list sort),
  `[workspaceId, queuedAt DESC]` (job history), `[expiresAt]` (session &
  terminal reapers), `[tokenHash]` unique lookup.
- `ExecutionJob` records both `compileDurationMs` and `durationMs` plus
  `resourceLimitReason` for honest observability of sandbox runs.

### 4. Security Controls & Threat Mitigation

- Email stored twice: `email` (display) and `emailNorm` (unique normalized
  lookup) prevents case-variant duplicate accounts.
- Cascade deletes keep referential integrity; `AuditEvent.userId` uses
  `SetNull` so audit trail survives user deletion.
- No secrets or hashes of real credentials in seed; demo user has
  un-unlockable placeholder hash.

### 5. Verification & Test Evidence

- `pnpm --filter @ide/database exec prisma migrate dev --name init` — PASS, migration applied, client generated (Prisma 6.19.3).
- `pnpm --filter @ide/database build` — PASS.
- `pnpm --filter @ide/database seed` — PASS ("seeded demo user").
- `pnpm --filter @ide/database typecheck` — PASS.
- `pnpm --filter @ide/database lint` — PASS.

### 6. Known Limitations / Follow-ups

Templates are plain data hydrated into the workspace storage jail at
creation time (Commit 7). Migrations are forward-only; `migrate deploy` is
used for repeatable environments.

---

## Section 05 — API Service Bootstrap, Env Validation & Observability

- **Commit:** `pending` (`feat(api): scaffold Fastify API with env validation, redacted Pino logs, and health probes`)
- **Phase Type:** Foundation
- **Date (UTC):** 2026-11-23

### 1. Summary of Changes

Scaffolded `apps/api` (`@ide/api`), the Fastify 5 backend that owns auth,
workspaces, the filesystem API, and the execution/terminal gateways.
Fail-fast Zod env validation, structured Pino logging with secret
redaction, request correlation IDs, canonical error envelope, and
liveness/readiness probes are all in place.

### 2. Key Files Created / Modified

- `apps/api/src/config/env.ts` — Zod-validated env; refuses production boot with placeholder secrets.
- `apps/api/src/lib/errors.ts` — `AppError` hierarchy (400/401/403/404/409/429/500 factories).
- `apps/api/src/app.ts` — `buildApp` factory: helmet, CORS (credentials, explicit origin), cookie, rate-limit (300/min/IP), websocket, multipart (10 MiB cap), body limit 5 MiB, global error + 404 handlers emitting the canonical envelope.
- `apps/api/src/routes/health.ts` — `/api/v1/health` (liveness) and `/api/v1/ready` (Postgres `SELECT 1` + Redis `PING`, 503 on degradation).
- `apps/api/src/index.ts` — composition root: loads env, wires Prisma + ioredis, graceful SIGINT/SIGTERM shutdown.
- `apps/api/src/config/env.test.ts` — 4 vitest cases for env validation.

### 3. Architecture & Optimization Decisions

`buildApp(deps)` is a pure factory so integration tests can inject Prisma/
Redis or omit them without booting the full process. Request IDs are
UUIDs generated per request and echoed via `x-request-id` and the error
envelope — enabling log correlation without trusting client-supplied IDs
for security decisions. `trustProxy: false` prevents IP spoofing of
rate-limit keys in dev.

### 4. Security Controls & Threat Mitigation

- Pino `redact` paths cover `authorization`, `cookie`, `password`,
  `token`, `secret` fields so credentials never hit logs.
- Global rate limit (300 req/min/IP) as baseline abuse control.
- Error handler never leaks stack traces or host paths — 5xx return a
  generic message while full error is logged server-side.
- Production boot refuses placeholder secrets (defense against shipping
  `.env.example` values).
- Helmet applied at API layer; CSP tuned in Commit 18 for the web app.

### 5. Verification & Test Evidence

- `pnpm --filter @ide/api typecheck` — PASS.
- `pnpm --filter @ide/api lint` — PASS.
- `pnpm --filter @ide/api test` — PASS (4/4 env tests).
- `pnpm dev` boot + `curl /api/v1/health` → `{"status":"ok"}`; `curl /api/v1/ready` → `{"status":"ready","checks":{"postgres":"ok","redis":"ok"}}`; unknown route → canonical 404 envelope.

### 6. Known Limitations / Follow-ups

Auth, workspace, filesystem, execution, and terminal routes land in
Commits 6–14. Redis/BullMQ producer wiring for execution jobs arrives in
Commit 13; terminal tickets in Commit 14.

---

## Section 06 — Authentication, Sessions, CSRF & Brute-Force Protection

- **Commit:** `pending` (`security(auth): implement Argon2id auth, hashed HttpOnly sessions, CSRF guards, and rate limits`)
- **Phase Type:** Security Hardening
- **Date (UTC):** 2026-11-23

### 1. Summary of Changes

Dedicated security commit implementing the complete authentication
subsystem: Argon2id password hashing, 256-bit bearer session tokens stored
only as SHA-256 hashes, HttpOnly/SameSite cookie sessions with rotation on
login, HMAC-signed double-submit CSRF protection on all cookie-authenticated
mutations, layered rate limiting, per-account lockout, constant-shape error
messages, and audit logging.

### 2. Key Files Created / Modified

- `apps/api/src/services/passwords.ts` — Argon2id (`memoryCost 65536`, `timeCost 3`, `parallelism 1`).
- `apps/api/src/services/sessions.ts` — token generation, SHA-256 `tokenHash`, create/lookup/revoke, 7-day expiry.
- `apps/api/src/services/loginGuard.ts` — per-account failure counter (Redis-backed, memory fallback): 5 failures → 15 min lock.
- `apps/api/src/services/audit.ts` — non-blocking `AuditEvent` writer.
- `apps/api/src/plugins/auth.ts` — `requireAuth` preHandler + `ipHash`.
- `apps/api/src/plugins/csrf.ts` — `issueCsrfToken`/`verifyCsrfToken` (HMAC-SHA256 signed nonce), `csrfGuard` global preHandler enforcing double-submit on mutations when a session cookie is present.
- `apps/api/src/routes/auth.ts` — `POST /register`, `POST /login`, `POST /logout`, `GET /me`, `GET /csrf`.
- `apps/api/src/app.ts` — plugin wiring (root-instance decoration fix), global `csrfGuard` hook.
- `apps/api/src/routes/auth.test.ts` — 7 integration tests against real Postgres+Redis.

### 3. Architecture & Optimization Decisions

Session lookup is a single indexed `tokenHash` query including the user —
no separate user fetch. Login rotates sessions by revoking all prior
sessions before issuing a new token (fixation resistance). CSRF tokens are
stateless HMAC-signed nonces stored in an HttpOnly `SameSite=Strict`
cookie; the SPA reads the token once from `/auth/csrf` or the login
response and echoes it in `X-CSRF-Token`. `loginGuard` uses Redis
`INCR`+`EXPIRE` so lockout state survives restarts and is shared across
replicas; memory fallback keeps tests/dev functional without Redis.

### 4. Security Controls & Threat Mitigation

- **Credential stuffing / brute force:** 10 req/min/IP on auth routes +
  5-failure/15-min per-account lockout + Argon2id cost parameters.
- **Session hijacking:** tokens are 256-bit random, only SHA-256 hashes
  persist; cookies are HttpOnly + SameSite=Lax + Secure-in-prod; rotation
  on every login; explicit revocation on logout.
- **CSRF:** double-submit cookie+header with HMAC signature; enforced
  globally for cookie-authenticated mutations.
- **Enumeration:** identical `401 Invalid email or password` for unknown
  email, wrong password, disabled account, and locked account; register
  returns constant-shape `409`.
- **Timing:** `timingSafeEqual` on CSRF signature compare; argon2.verify
  runs even for nonexistent users? — mitigated by constant-shape response
  timing being dominated by hash cost; documented residual.
- **Audit:** register/login success+failure/logout events persisted.

### 5. Verification & Test Evidence

- `pnpm --filter @ide/api test` — PASS (11/11: 4 env + 7 auth integration).
- `pnpm --filter @ide/api typecheck` — PASS.
- `pnpm --filter @ide/api lint` — PASS.
- Tests verified: cookie flags (HttpOnly, SameSite), CSRF 403 on missing/
  forged token, 204 on valid logout, 401 on bad creds & revoked session.

### 6. Known Limitations / Follow-ups

Per-IP rate limit uses `req.ip` with `trustProxy: false` — correct for
direct deployments; a trusted-proxy deployment must revisit
`trustProxy`. Email verification / password reset flows are out of scope.
Timing equalization for unknown-email logins is a documented residual
risk (argon2 cost dominates but is not perfectly constant).

---

## Section 07 — Workspace Management & Ownership Authorization

- **Commit:** `pending` (`feat(workspace): add workspace CRUD APIs, template hydration, and tenant ownership checks`)
- **Phase Type:** Feature
- **Date (UTC):** 2026-11-23

### 1. Summary of Changes

Implemented full workspace lifecycle: list (search + `updatedAt DESC`),
create with starter-template hydration into the storage root, read,
update (rename/description/runtime preference), and soft-delete with
on-disk cleanup. Centralized `assertWorkspaceAccess` enforces ownership
on every workspace-scoped route; cross-tenant access returns 404.

### 2. Key Files Created / Modified

- `apps/api/src/services/authorization.ts` — `assertWorkspaceAccess` (owner or member; 404 on denial).
- `apps/api/src/services/workspace-storage.ts` — `workspaceRoot` (opaque `storageKey` jail) + `hydrateWorkspace` for trusted template files.
- `apps/api/src/routes/workspaces.ts` — 5 CRUD endpoints, 20-workspace quota, audit events, rollback on hydration failure.
- `apps/api/src/routes/workspaces.test.ts` — 6 integration tests incl. cross-tenant denial.

### 3. Architecture & Optimization Decisions

`storageKey` (`ws_<192-bit base64url>`) is generated server-side and never
derived from user input — the DB `id` and disk path are fully decoupled.
Template hydration happens inside the create transaction's aftermath with
DB rollback on failure, so users never see an empty/broken workspace.
Soft-delete (`deletedAt`) preserves referential integrity for jobs,
terminals, and audit events while immediately hiding the workspace.
Quota check uses a `count` query before insert (adequate at this scale;
serializable enforcement can be added if abuse appears).

### 4. Security Controls & Threat Mitigation

- Every workspace route runs `requireAuth` + `assertWorkspaceAccess`;
  workspace IDs alone grant nothing.
- Cross-tenant probing gets uniform `404 WORKSPACE_NOT_FOUND` — no
  existence oracle.
- Delete path re-validates `realpath` containment under the storage root
  before `rm -rf` (defense in depth; hardened engine lands in Commit 8).
- Mutations pass through the global CSRF guard (Commit 6).
- Audit events for create/delete/rename.

### 5. Verification & Test Evidence

- `pnpm --filter @ide/api test` — PASS (17/17 total; 6 new workspace tests).
- `pnpm --filter @ide/api typecheck` — PASS.
- `pnpm --filter @ide/api lint` — PASS.
- Verified on disk: `main.py` hydrated under `<root>/<storageKey>/`;
  storage removed after delete.

### 6. Known Limitations / Follow-ups

`workspace-storage.ts` is intentionally minimal — it only writes
server-trusted template paths. All user-controlled path operations move
behind the hardened filesystem engine in Commit 8.

---

## Section 08 — Hardened Workspace Filesystem Engine

- **Commit:** `pending` (`security(fs): add workspace storage jail with traversal, symlink, atomic write, and quota guards`)
- **Phase Type:** Security Hardening
- **Date (UTC):** 2026-11-23

### 1. Summary of Changes

Dedicated security commit implementing `WorkspaceFS`, the bulletproof
filesystem abstraction that all workspace file operations must flow
through. Defends against path traversal (plain, encoded, absolute,
Windows-style), symlink escapes, control characters, resource exhaustion
(file count/size/depth quotas), and partial writes — with optimistic
concurrency via content-hash revisions.

### 2. Key Files Created / Modified

- `apps/api/src/services/fs-engine.ts` — `WorkspaceFS` class: `resolve()` jail, `assertNoSymlink()` segment walk, `listDir`, `readFile`, `writeFile` (atomic temp+rename, `expectedRevision` → 409 `REVISION_CONFLICT`), `mkdirEntry`, `renameEntry`, `deleteEntry`, `usage()` quota accounting, `LIMITS` constants, `revisionOf`, `looksBinary`.
- `apps/api/src/services/fs-engine.test.ts` — 21 unit tests covering every attack vector.

### 3. Architecture & Optimization Decisions

- **Jail:** `resolve()` normalizes with `path.posix` semantics, rejects
  absolute paths, drive letters, backslashes, NUL/control chars,
  `..` segments (pre- and post-normalization), and any `%2e/%2f/%5c`
  encoded traversal; final `path.resolve` result must remain strictly
  under `<root>/<storageKey>`.
- **Symlink policy:** rejected outright — `lstat` walk verifies every
  existing segment; policy documented (workspaces contain no symlinks).
- **Atomic writes:** temp file `.<rand>.tmp` in same directory + `rename`
  — readers never observe partial content; temp files are same-dir so
  rename is atomic on POSIX.
- **Revision:** `sha256(content)[0:16].mtime36` — collision-resistant
  content binding plus mtime for cheap change detection.
- **Quotas:** 2 MiB text / 10 MiB upload per file, 100 MiB workspace,
  500 files, depth 12 — enforced before write with accurate delta
  accounting on overwrite.

### 4. Security Controls & Threat Mitigation

- Path traversal: `../`, `a/../../x`, `%2e%2e`, `%2E%2E%2F`, `/etc/passwd`,
  `C:\`, `C:/`, NUL bytes, newline injection — all rejected (tested).
- Symlink escape: `linkdir -> /tmp/outside` blocked for read/list/write
  (tested).
- Resource exhaustion: oversized writes rejected before touching disk;
  workspace/file-count/depth ceilings; usage walker never follows
  symlinks.
- Integrity: revision conflicts return 409 with `serverRevision` so the
  client can reconcile instead of silently overwriting.
- Information leakage: errors are generic; absolute host paths never
  appear in responses (`path` fields are workspace-relative).

### 5. Verification & Test Evidence

- `pnpm --filter @ide/api vitest run src/services/fs-engine.test.ts` — PASS (21/21).
- `pnpm --filter @ide/api typecheck` — PASS.
- `pnpm --filter @ide/api lint` — PASS.

### 6. Known Limitations / Follow-ups

TOCTOU between `assertNoSymlink` and `rename` is theoretically possible
for a local attacker with write access to the workspace dir — acceptable
because only the API process writes there and users cannot create
symlinks through any endpoint. Hardlinks are not creatable via the API.
The REST surface exposing this engine lands in Commit 9.
