# Web-Based IDE — Commit-by-Commit Autonomous Execution Playbook

> **Audience:** Autonomous Coding Agent (Claude Code, Codex, Gemini CLI, Cursor Agent, etc.)  
> **Companion Spec:** `GUIDE.md` (Product, Architecture, and Security Specification)  
> **Mission:** Build a clean, production-minded, secure, VS Code-inspired browser IDE from scratch (or on top of an existing repo) using a **strict commit-by-commit workflow**, dedicated **security hardening commits**, a **modern non-generic developer UI**, real **server-side sandboxed compilation & execution**, polished **GitHub repository files**, and a **single consolidated English engineering report (`docs/ENGINEERING_REPORT.md`)** updated at every milestone.

---

## 1. Non-Negotiable Operating Rules

1. **Inspect First, Never Destroy:** Always run `git status`, `git log -n 5`, and inspect existing files before writing code. Never use `git reset --hard`, never force-push, and never discard user work.
2. **Real Server-Side Compilation & Sandbox Execution Only:** Untrusted user code and terminal shells must **NEVER** execute in the Next.js server, Fastify API process, or directly on the host OS. Every compile, run, and interactive PTY session must execute inside a dedicated, isolated, non-root sandbox provisioned by the private `runner` service.
3. **Strict Commit Discipline:** Follow the 20-commit sequence in Section 6. Do not lump unrelated features or security layers into giant commits. **Security controls must live in their own dedicated commits** so reviewers can audit them cleanly in `git log`.
4. **One Consolidated English Report (`docs/ENGINEERING_REPORT.md`):** Maintain **one single English Markdown report file** at `docs/ENGINEERING_REPORT.md`. After completing **every commit/phase**, append a structured English report entry for that section (before or alongside the commit, and finalize all commit hashes at the end).
5. **Agent Memory Files:** Create and keep `AGENTS.md`, `.agent/MEMORY.md`, and `.agent/WORKLOG.md` continuously updated per `GUIDE.md` Section 2.
6. **Zero Fake Controls & Zero Secrets:** Every primary UI button must perform real work. Never commit `.env`, private keys, tokens, database files, or local workspace artifacts.
7. **Honest Reporting:** Never claim a test passed unless you actually executed it and observed a pass. Never claim local Docker containers equal microVM/gVisor production isolation—document the exact boundary honestly.

---

## 2. Technology Stack, Languages & Required Toolchain

### 2.1 Project Implementation Languages

| Layer                            | Language / Format                     | Purpose                                                                       |
| -------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------- |
| Frontend (`apps/web`)            | **TypeScript 5.x (strict)**, TSX, CSS | Next.js App Router UI, Monaco Editor workbench, xterm.js terminal             |
| Backend API (`apps/api`)         | **TypeScript 5.x (strict)**           | Fastify REST API, Auth/Sessions, File API, WebSocket gateway, BullMQ producer |
| Execution Runner (`apps/runner`) | **TypeScript 5.x (strict)**           | Private sandbox orchestrator, OCI container/PTY lifecycle, language adapters  |
| Shared Packages (`packages/*`)   | **TypeScript 5.x (strict)**           | Zod contracts, Prisma ORM schema/client, editor configs, sandbox policies     |
| Database                         | **PostgreSQL 16 (SQL via Prisma)**    | Users, sessions, workspaces, execution jobs, terminal sessions, audit logs    |
| Infrastructure & Sandboxes       | **Dockerfile, YAML, JSON, Bash**      | Compose services, minimal non-root sandbox runtime images, seccomp profiles   |

### 2.2 Supported User Code Languages (Compiled & Interpreted inside Sandboxes)

| User Language  | Extensions            | Sandbox Toolchain                  | Execution Mode                                    |
| -------------- | --------------------- | ---------------------------------- | ------------------------------------------------- |
| **Python**     | `.py`                 | Python 3.12 (`python3 -I`)         | Interpreted                                       |
| **JavaScript** | `.js`, `.mjs`, `.cjs` | Node.js 22 LTS (`node`)            | Interpreted                                       |
| **TypeScript** | `.ts`                 | Node.js 22 + `tsc` / `tsx`         | Type-check / Transpile + Run                      |
| **C**          | `.c`                  | `gcc` (C17, `-Wall -Wextra -O2`)   | **Compiled on server (in sandbox) -> Binary Run** |
| **C++**        | `.cpp`, `.cc`, `.cxx` | `g++` (C++20, `-Wall -Wextra -O2`) | **Compiled on server (in sandbox) -> Binary Run** |
| **Java**       | `.java`               | OpenJDK 21 (`javac` + `java`)      | **Compiled to bytecode -> JVM Run**               |
| **Go**         | `.go`                 | Go 1.23 (`go build`)               | **Compiled binary -> Run**                        |

> **Delivery rule:** Verify Python and JavaScript end-to-end first, then compile-and-run adapters for C, C++, Go, Java, and TypeScript. Only advertise a runtime in the UI once its sandbox image and automated tests pass.

### 2.3 Core Libraries & Tools (Optimal & Secure Selection)

- **Monorepo & Package Manager:** `pnpm` (v9+ workspaces) — strict dependency isolation, fast installs, deterministic `pnpm-lock.yaml`.
- **Frontend (`apps/web`):**
  - `next` (App Router), `react`, `react-dom`
  - `@monaco-editor/react` + `monaco-editor` (lazy-loaded real Monaco engine)
  - `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links`, `@xterm/addon-search`
  - `tailwindcss`, `lucide-react`, `react-resizable-panels` (crisp VS Code-like resizable splits)
  - `@tanstack/react-query` (server state caching & mutations), `zustand` (minimal workbench UI state: open tabs, active panel, layout)
- **Backend API (`apps/api`):**
  - `fastify`, `@fastify/cookie`, `@fastify/cors`, `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/websocket`, `@fastify/multipart`
  - `argon2` (Argon2id password hashing)
  - `zod` (strict runtime input & WS message validation)
  - `pino` (structured JSON logging with secret redaction)
  - `bullmq` + `ioredis` (durable execution job queue + real-time pub/sub event streaming)
- **Database (`packages/database`):**
  - `prisma` + `@prisma/client` with PostgreSQL 16
- **Runner Service (`apps/runner`):**
  - `fastify` (bound strictly to internal private network), `dockerode` (communicating with container daemon ONLY from the isolated runner service, never from `apps/api`), `zod`, `pino`
  - Production upgrade path: drop-in OCI runtime flag (`--runtime=runsc` for **gVisor** or `kata-runtime` for **Kata Containers**) configurable via `SANDBOX_OCI_RUNTIME`
- **Testing & Quality:**
  - `vitest` (unit, integration, and security regression tests)
  - `@playwright/test` (full browser E2E suite)
  - `eslint`, `prettier`, `tsc --noEmit`

### 2.4 Host Prerequisites (Verify & Install in Step 0)

Before writing application code, verify all host tools are installed and record exact versions in `.agent/MEMORY.md` and `docs/ENGINEERING_REPORT.md`:

```bash
# 1. Verify Node.js (v20.18+ or v22 LTS required)
node -v

# 2. Verify or enable pnpm via Corepack
corepack enable
corepack prepare pnpm@9 --activate
pnpm -v

# 3. Verify Git and user identity
git --version
git config user.name
git config user.email
# If user.name or user.email is missing, STOP and report the exact blocker command to the user.

# 4. Verify Docker Engine & Docker Compose v2
docker --version
docker compose version
docker info >/dev/null 2>&1 && echo "Docker daemon reachable" || echo "Docker daemon unavailable"
```

---

## 3. Repository Blueprint (Clean GitHub-Ready Layout)

Build the repository with standard, polished GitHub project conventions:

```text
.
├── .agent/
│   ├── MEMORY.md                        # Durable technical memory
│   └── WORKLOG.md                       # Active phase/task tracker
├── .github/
│   └── workflows/
│       └── ci.yml                       # Lint, typecheck, unit tests, build CI pipeline
├── apps/
│   ├── web/                             # Next.js App Router IDE & Dashboard
│   ├── api/                             # Fastify REST API + WS Gateway (NO Docker socket)
│   └── runner/                          # Private Sandbox Orchestrator (isolated runtime access)
├── packages/
│   ├── contracts/                       # Shared Zod schemas, API DTOs, WS event contracts
│   ├── database/                        # Prisma schema, migrations, seed & starter templates
│   ├── editor/                          # Monaco extension->language map, keybindings, themes
│   └── sandbox/                         # Runtime definitions, compile/run adapters, diagnostic parsers
├── infra/
│   ├── compose/
│   │   └── docker-compose.yml           # Local Postgres, Redis, and optional full-stack services
│   └── docker/
│       ├── seccomp-sandbox.json         # Restrictive custom seccomp profile for user containers
│       ├── sandbox-base.Dockerfile      # Hardened non-root base image
│       ├── runtime-python.Dockerfile    # Python 3.12 sandbox image
│       ├── runtime-node.Dockerfile      # Node.js 22 + TypeScript sandbox image
│       ├── runtime-cpp.Dockerfile       # GCC / G++ sandbox image
│       ├── runtime-java.Dockerfile      # OpenJDK 21 sandbox image
│       └── runtime-go.Dockerfile        # Go 1.23 sandbox image
├── tests/
│   ├── security/                        # Dedicated security regression test suite
│   └── e2e/                             # Playwright end-to-end tests
├── docs/
│   ├── ENGINEERING_REPORT.md            # SINGLE consolidated English report for ALL phases
│   ├── architecture.md                  # System architecture & data flows
│   ├── security.md                      # Threat model, isolation boundaries, residual risks
│   ├── api.md                           # REST & WebSocket protocol reference
│   ├── development.md                   # Local dev, migrations, adding language runtimes
│   └── operations.md                    # Deployment, observability, scaling, incident response
├── AGENTS.md                            # Instructions for future coding agents
├── README.md                            # Polished GitHub homepage documentation
├── REQUIREMENTS.md                      # System, software, functional & security requirements
├── SECURITY.md                          # Vulnerability disclosure & security baseline
├── CONTRIBUTING.md                      # Branching, commit conventions, PR checklist
├── .env.example                         # Documented placeholder environment variables
├── .editorconfig                        # Consistent indentation & line endings
├── .gitignore                           # Strict exclusion of secrets, artifacts, local workspaces
├── .nvmrc                               # Pinned Node.js major version (22)
├── pnpm-workspace.yaml
└── package.json                         # Root orchestration scripts
```

---

## 4. UI/UX Design Specification — Modern Developer Craft (Anti-"AI Slop")

The interface must look and feel like a **real precision engineering tool** (on par with VS Code Dark Modern, Zed, Linear, and Raycast)—never like a generic AI-generated template.

### 4.1 Explicit Anti-AI-Slop Rules (STRICTLY FORBIDDEN)

- **NO** purple/indigo/pink glowing gradients, aurora backgrounds, or neon drop-shadows.
- **NO** heavy glassmorphism (`backdrop-blur-xl` frosted cards everywhere).
- **NO** emojis in headings, buttons, navigation items, or status bars. Use crisp 16px `lucide-react` stroke icons (`strokeWidth={1.6}`).
- **NO** cheesy marketing copy ("Supercharge your coding with the power of the cloud!"), fake testimonials, or bloated hero cards.
- **NO** gratuitous spring/bounce animations. Transitions must be fast (`100ms–150ms ease-out`) and honor `prefers-reduced-motion`.

### 4.2 Visual Tokens & Typography

- **Dark Theme (Default — Industrial Neutral Slate/Obsidian):**
  - Canvas / Workbench Frame: `#0C0E12`
  - Editor & Primary Surface: `#11141A`
  - Elevated Panels / Modals / Tabs: `#161B22`
  - Subtle Hover Surface: `#1E242E`
  - Hairline Borders (`1px solid`): `#252C37`
  - Primary Text: `#E6EDF3` | Secondary Text: `#8B949E` | Muted Text: `#636E7B`
  - Single Restrained Accent (Interactive Focus / Primary Action): `#3B82F6` (Steel Blue)
  - Semantic Status (paired with icons/text, never color alone): Success `#2EA043`, Warning `#D29922`, Error `#F85149`
- **Light Theme (Complete Parity):**
  - Canvas `#F6F8FA`, Editor `#FFFFFF`, Panels `#F0F2F5`, Hairline Borders `#D8DEE4`, Text `#1F2328`.
- **Typography:**
  - UI Chrome: `Inter` / system geometric sans (`13px` workbench dense UI, `14px` dashboard/forms).
  - Code Editor & Terminal: `JetBrains Mono` / `Fira Code` / monospace fallback (`13.5px`, `line-height: 1.55`, tabular numerals for line numbers & durations).

### 4.3 VS Code-Grade Workbench Capabilities

Implement these authentic IDE interactions:

1. **Resizable Multi-Pane Shell (`react-resizable-panels`):**
   - Left **Activity Bar** (`44px`): Explorer, Search in Workspace (filename quick filter), Runtime Info, Settings.
   - Left **Explorer Sidebar** (collapsible, resizable): Tree view with file type icons, inline create/rename inputs, right-click context menu, drag-less clean actions, upload/download.
   - Center **Editor Area**: Multi-tab bar with dirty indicator dot (`●`), middle-click close, breadcrumb bar (`src > main.cpp`), real **Monaco Editor** synced with custom dark/light themes.
   - Bottom **Integrated Drawer** (collapsible, resizable, toggleable via `` Ctrl+` ``):
     - **Terminal** tab: Multi-session `xterm.js` connected to real sandbox PTY.
     - **Output** tab: Live streamed compiler output, program `stdout`/`stderr` (tagged distinctly), exit code badge, execution timer (`ms`), and resource-limit banners.
     - **Problems** tab: Parsed compiler errors/warnings (`file`, `line:col`, `message`). Clicking a problem opens the file in Monaco and jumps cursor directly to `(line, col)`!
   - Bottom **Status Bar** (`24px`): Active runtime badge, sandbox status (`Idle / Compiling / Running`), file language mode, cursor `Ln X, Col Y`, indentation, UTF-8, save state (`Saved` / `Saving...` / `Conflict`).
2. **Keyboard Shortcuts:**
   - `Ctrl/Cmd + S`: Immediate save.
   - `Ctrl/Cmd + Enter` or `F5`: Compile & Run active file.
   - `Shift + F5`: Stop/Cancel active run.
   - `Ctrl/Cmd + P`: Quick Open file modal.
   - `Ctrl/Cmd + Shift + P`: Command Palette (Run file, Toggle theme, Toggle terminal, Format/Wrap, New file, etc.).
   - `` Ctrl + ` ``: Toggle bottom terminal panel.
3. **Responsive Narrow Layout:** Below `900px`, convert sidebar into a slide-over drawer and give Monaco + bottom panel clean stacked tabs so mobile/tablet users remain productive.

---

## 5. Server-Side Compilation, Execution & Streaming Architecture

Implement the exact server-side compile-and-send pipeline so compiled languages feel instant and reliable like a local VS Code setup:

```text
[Browser: Monaco + xterm.js]
   │  1. PUT /api/v1/workspaces/:id/file (autosave / Ctrl+S)
   │  2. POST /api/v1/workspaces/:id/executions { sourcePath, stdin? }
   ▼
[apps/api: Fastify + Auth + Quotas]
   │  3. Verify session, workspace ownership, path safety, rate limits
   │  4. Insert ExecutionJob (status: queued) in PostgreSQL
   │  5. Issue short-lived HMAC/Ed25519 capability token (workspaceId, jobId, ttl=60s)
   │  6. Enqueue job into Redis (BullMQ)
   ▼
[apps/runner: Private Orchestrator]
   │  7. Verify capability token & select server-allowlisted runtime image
   │  8. Provision hardened non-root sandbox container (network=none, cap-drop=ALL, seccomp, RO rootfs)
   │     Mount ONLY /workspaces/<storageKey> -> /workspace
   │     Mount small bounded tmpfs -> /tmp/build (for compiled binaries)
   │  9. PHASE A (Compile — for C, C++, Java, Go, TS):
   │     spawn argv compiler inside sandbox (e.g., ["g++", "-std=c++20", "-Wall", "-O2", "/workspace/main.cpp", "-o", "/tmp/build/app"])
   │     Stream compiler stderr -> Parse diagnostics (file, line, col, severity, msg)
   │     If compile exitCode != 0 -> emit diagnostics + status=failed, cleanup, STOP
   │ 10. PHASE B (Execute):
   │     spawn argv binary/interpreter inside sandbox (e.g., ["/tmp/build/app"])
   │     Enforce wall-clock timeout, memory/PID cgroup limits, 1 MiB output cap
   │     Stream stdout/stderr chunks -> Redis Pub/Sub -> apps/api WS -> Browser Output Panel
   │ 11. Emit final event { exitCode, durationMs, compileDurationMs, resourceLimitReason }
   │ 12. Kill process tree & destroy/reclaim sandbox cleanly
   ▼
[Browser UI]
   - Output tab renders live plain-text stdout/stderr (XSS-safe) + exit code & duration
   - Problems tab & Monaco Editor display inline red/yellow squiggles from parsed compiler diagnostics
```

### Compiler Diagnostic Parsers (`packages/sandbox/src/diagnostics.ts`)

Implement deterministic regex parsers for compiler output so VS Code-like error highlighting works out of the box:

- **GCC / G++:** `/^(?<file>[^:\n]+):(?<line>\d+):(?<col>\d+):\s+(?<severity>error|warning|note):\s+(?<message>.+)$/`
- **Go:** `/^(?<file>[^:\n]+\.go):(?<line>\d+):(?<col>\d+):\s+(?<message>.+)$/`
- **Java (`javac`):** `/^(?<file>[^:\n]+\.java):(?<line>\d+):\s+(?<severity>error|warning):\s+(?<message>.+)$/`
- **TypeScript (`tsc`):** `/^(?<file>[^(\n]+)\((?<line>\d+),(?<col>\d+)\):\s+(?<severity>error|warning)\s+TS\d+:\s+(?<message>.+)$/`
- **Python traceback:** `/File "(?<file>[^"]+)", line (?<line>\d+)/`

Strip any container-internal `/workspace/` prefix before sending `file` back to the browser so host/container internals are never leaked.

---

## 6. Consolidated Single-File English Report Rules (`docs/ENGINEERING_REPORT.md`)

You MUST write and continuously append to **ONE single English Markdown file**: `docs/ENGINEERING_REPORT.md`.

### Required Structure of `docs/ENGINEERING_REPORT.md`

Start the file in Commit 1 with a title, table of contents, executive summary placeholder, and architecture overview. Then, for **each commit (Commit 1 through Commit 20)**, append a dedicated numbered section following this exact template:

```markdown
## Section NN — <Commit Title>

- **Commit:** `<short-hash>` (`<conventional-commit-message>`) _(fill hash right after committing, or record in final reconciliation commit)_
- **Phase Type:** Foundation | Feature | Security Hardening | Testing | Documentation
- **Date (UTC):** YYYY-MM-DD

### 1. Summary of Changes

Concise engineering summary of what was implemented and why.

### 2. Key Files Created / Modified

- `path/to/file` — role in the system.

### 3. Architecture & Optimization Decisions

Explain concrete trade-offs, performance optimizations (debouncing, streaming, bounded buffers, lazy loading, indexing), and maintainability choices.

### 4. Security Controls & Threat Mitigation

Detail specific threats addressed in this step (or state "No new attack surface introduced; preserves prior invariants" where applicable).

### 5. Verification & Test Evidence

List exact commands executed and real observed outcomes:

- `pnpm typecheck` — PASS
- `pnpm lint` — PASS
- `pnpm test` — PASS (X/X tests)

### 6. Known Limitations / Follow-ups

Honest notes on remaining scope or environment constraints.
```

> **Important:** Because a commit hash is generated _after_ `git commit`, write the section content into `docs/ENGINEERING_REPORT.md` as part of each commit (with `Commit: pending` or update the previous commit's hash on the next commit), and in **Commit 20** reconcile the complete commit hash table from `git log --reverse --oneline` so every single commit hash in `docs/ENGINEERING_REPORT.md` is 100% accurate and verified.

---

## 7. Step-by-Step, Commit-by-Commit Execution Plan

Execute the following steps **strictly in order**. Before **every commit**, run the **Pre-Commit Gate**:

1. Run `pnpm typecheck` and `pnpm lint` (once configured).
2. Run relevant `pnpm test` suites.
3. Run `git status` and `git diff --staged --stat` to confirm **no secrets, `.env`, `node_modules`, or temp files** are staged.
4. Update `.agent/WORKLOG.md`, `.agent/MEMORY.md` (at checkpoints), and append the phase section to `docs/ENGINEERING_REPORT.md`.
5. Commit with the exact Conventional Commit message format specified below.

---

### Pre-Flight (Step 0): Environment Audit & Git Check

**Actions:**

1. Run `git status` and inspect directory contents. If no Git repository exists, run `git init -b main`.
2. Run host toolchain checks from Section 2.4 (`node`, `pnpm`, `git`, `docker`, `docker compose`).
3. Verify Git author config (`git config user.name` & `user.email`).
4. Prepare `.agent/MEMORY.md` and `.agent/WORKLOG.md` with initial environment findings.

---

### Commit 1 — Monorepo Foundation, Tooling & Repo Hygiene

**Goal:** Establish a clean, strict TypeScript pnpm monorepo with linting, formatting, test runner, agent memory files, and the initial `docs/ENGINEERING_REPORT.md`.

**Install & Configure:**

- Initialize root `package.json`, `pnpm-workspace.yaml` (`apps/*`, `packages/*`), `tsconfig.base.json` (`strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`).
- Install root dev dependencies:
  ```bash
  pnpm add -Dw typescript @types/node eslint prettier vitest tsx concurrently
  ```
- Create `.gitignore` (ignore `node_modules`, `.next`, `dist`, `.env`, `.env.local`, `.local-data`, `*.log`, `coverage`, `playwright-report`).
- Create `.editorconfig`, `.nvmrc` (`22`), `.env.example` (complete, safe placeholders only).
- Create root `AGENTS.md`, `.agent/MEMORY.md`, `.agent/WORKLOG.md`, and initialize `docs/ENGINEERING_REPORT.md` with Section 01.
- Wire root scripts in `package.json`: `dev`, `build`, `lint`, `format:check`, `typecheck`, `test`, `test:security`, `test:e2e`, `infra:up`, `infra:down`, `db:migrate`, `db:seed`.

**Verify:** `pnpm typecheck && pnpm lint`

**Commit Command:**

```bash
git add -A
git commit -m "chore(repo): initialize pnpm monorepo, strict TypeScript tooling, and agent memory"
```

---

### Commit 2 — Local Infrastructure (PostgreSQL & Redis via Docker Compose)

**Goal:** Reproducible local backing services bound strictly to localhost.

**Build:**

- Create `infra/compose/docker-compose.yml` defining:
  - `postgres` (`postgres:16-alpine`), bound to `127.0.0.1:5432:5432`, healthcheck via `pg_isready`, named volume.
  - `redis` (`redis:7-alpine`), bound to `127.0.0.1:6379:6379`, healthcheck via `redis-cli ping`, AOF persistence optional, memory cap (`--maxmemory 256mb`).
- Wire `pnpm infra:up` and `pnpm infra:down` to `docker compose -f infra/compose/docker-compose.yml up -d` / `down`.
- Update `docs/ENGINEERING_REPORT.md` (Section 02).

**Verify:** Start services (`pnpm infra:up`) and confirm both containers report `(healthy)` via `docker compose ps`.

**Commit Command:**

```bash
git add -A
git commit -m "chore(infra): add local Docker Compose for PostgreSQL 16 and Redis 7"
```

---

### Commit 3 — Shared Contracts & Protocol Schemas (`packages/contracts`)

**Goal:** Single source of truth for REST DTOs, error envelopes, compiler diagnostics, and WebSocket events.

**Build:**

- Create `packages/contracts` with `zod`:
  ```bash
  pnpm --filter @ide/contracts add zod
  ```
- Define strict schemas for:
  - `ApiErrorSchema` (`{ error: { code, message, requestId, details? } }`)
  - `AuthSchemas` (register, login, user profile)
  - `WorkspaceSchemas` (create, update, summary, template IDs)
  - `FilesystemSchemas` (`WorkspaceEntry`, read/write file with `revision`, rename/move, upload metadata)
  - `ExecutionSchemas` (create run job, statuses, `CompilerDiagnostic`, `ExecutionEvent` WS stream)
  - `TerminalSchemas` (`TerminalClientMessage`, `TerminalServerMessage`, size bounds `cols: 20..300`, `rows: 5..120`, max input payload size)
- Add unit tests verifying schema acceptance and invalid-payload rejection.
- Update `docs/ENGINEERING_REPORT.md` (Section 03).

**Verify:** `pnpm --filter @ide/contracts test && pnpm typecheck`

**Commit Command:**

```bash
git add -A
git commit -m "feat(contracts): define shared Zod schemas for REST APIs, diagnostics, and WebSockets"
```

---

### Commit 4 — Database Schema, Migrations & Starter Templates (`packages/database`)

**Goal:** Durable relational data model with indexes, migrations, and version-controlled safe starter templates.

**Build:**

- Create `packages/database` and install Prisma:
  ```bash
  pnpm --filter @ide/database add @prisma/client
  pnpm --filter @ide/database add -D prisma
  ```
- Model in `prisma/schema.prisma`:
  - `User` (`id`, normalized unique `email`, `passwordHash`, `displayName`, `status`, timestamps)
  - `Session` (`id`, `userId`, unique `tokenHash`, `expiresAt`, `lastSeenAt`, `revokedAt`, `userAgent`, `ipHash`)
  - `Workspace` (`id`, `ownerId`, `name`, `description`, `templateId`, `runtimePreference`, opaque unique `storageKey`, `deletedAt`, timestamps)
  - `WorkspaceMember` (`workspaceId`, `userId`, `role`)
  - `ExecutionJob` (`id`, `workspaceId`, `userId`, `sourcePath`, `languageId`, `runtimeImageId`, `status`, `queuedAt`, `startedAt`, `finishedAt`, `compileDurationMs`, `durationMs`, `exitCode`, `resourceLimitReason`, `outputBytes`)
  - `TerminalSession` (`id`, `workspaceId`, `userId`, `sandboxLeaseId`, `status`, `createdAt`, `lastActivityAt`, `expiresAt`, `closedAt`)
  - `AuditEvent` (`id`, `userId`, `workspaceId`, `action`, `outcome`, `metadataJson`, `requestId`, `createdAt`)
- Add proper composite indexes (`[ownerId, updatedAt]`, `[workspaceId, createdAt]`, `[tokenHash]`, `[expiresAt]`).
- Create `packages/database/src/templates.ts` with clean, runnable starter templates: `blank`, `python`, `javascript`, `typescript`, `c`, `cpp`, `java`, `go`, `html-web`.
- Run initial migration (`pnpm db:migrate`) and verify idempotent seed script (`pnpm db:seed`).
- Update `.agent/MEMORY.md` and `docs/ENGINEERING_REPORT.md` (Section 04).

**Verify:** `pnpm db:migrate && pnpm typecheck`

**Commit Command:**

```bash
git add -A
git commit -m "feat(db): add Prisma schema, initial migrations, indexes, and starter templates"
```

---

### Commit 5 — API Service Bootstrap, Env Validation & Observability (`apps/api`)

**Goal:** Fastify server skeleton with fail-fast environment validation, structured logging with secret redaction, request correlation IDs, and health probes.

**Build:**

- Create `apps/api` and install core packages:
  ```bash
  pnpm --filter @ide/api add fastify @fastify/cookie @fastify/cors @fastify/helmet @fastify/rate-limit @fastify/websocket @fastify/multipart pino ioredis bullmq zod
  pnpm --filter @ide/api add @ide/contracts@workspace:* @ide/database@workspace:*
  ```
- Build `src/config/env.ts` using Zod to validate all required env vars at boot (refuse to start in production with placeholder secrets).
- Configure Pino logger redacting `req.headers.authorization`, `req.headers.cookie`, `password`, `token`, `secret`.
- Implement `/api/v1/health` (liveness) and `/api/v1/ready` (verifies PostgreSQL + Redis connectivity).
- Implement global error handler mapping Zod errors, Prisma errors, and domain `AppError` classes into the canonical error envelope without leaking stack traces or host paths.
- Update `docs/ENGINEERING_REPORT.md` (Section 05).

**Verify:** Boot API locally, curl `/api/v1/health` and `/api/v1/ready`, run `pnpm typecheck && pnpm lint`.

**Commit Command:**

```bash
git add -A
git commit -m "feat(api): scaffold Fastify API with env validation, redacted Pino logs, and health probes"
```

---

### Commit 6 — [SECURITY HARDENING #1] Authentication, Sessions, CSRF & Brute-Force Protection

**Goal:** Dedicated security commit implementing rock-solid session auth and protection against credential stuffing, session hijacking, and CSRF.

**Install:**

```bash
pnpm --filter @ide/api add argon2
```

**Build:**

- Password hashing using **Argon2id** (`memoryCost: 65536`, `timeCost: 3`, `parallelism: 1`).
- Cryptographically random 256-bit session tokens; store ONLY `SHA-256(token)` in PostgreSQL `Session.tokenHash`.
- Set `HttpOnly`, `SameSite=Lax` (or `Strict` where compatible), `Secure` (in production), `Path=/` cookies.
- Session rotation on login/register; explicit revocation on logout (`revokedAt`).
- CSRF protection middleware for all state-changing cookie-authenticated requests (`Origin` / `Referer` validation + signed double-submit CSRF token header `X-CSRF-Token`).
- Strict per-IP + per-account rate limiting on `/api/v1/auth/login` and `/api/v1/auth/register`.
- Constant-shape error messages preventing email enumeration on login.
- Audit log entries for `auth.login.success`, `auth.login.failure`, `auth.logout`, `auth.register`.
- Endpoints: `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`, `GET /api/v1/auth/csrf`.
- Add integration tests verifying cookie flags, CSRF rejection, invalid credentials, revoked sessions, and rate limit behavior.
- Update `docs/ENGINEERING_REPORT.md` (Section 06).

**Verify:** `pnpm --filter @ide/api test && pnpm typecheck`

**Commit Command:**

```bash
git add -A
git commit -m "security(auth): implement Argon2id auth, hashed HttpOnly sessions, CSRF guards, and rate limits"
```

---

### Commit 7 — Workspace Management & Server-Side Ownership Authorization

**Goal:** Full workspace CRUD with strict multi-tenant ownership enforcement.

**Build:**

- Create `apps/api/src/services/authorization.ts`: centralized `assertWorkspaceAccess(userId, workspaceId)` helper. Never trust workspace IDs alone.
- Endpoints:
  - `GET /api/v1/workspaces` (supports search query & deterministic sort by `updatedAt DESC`)
  - `POST /api/v1/workspaces` (creates DB record with opaque `storageKey`, hydrates chosen starter template)
  - `GET /api/v1/workspaces/:workspaceId`
  - `PATCH /api/v1/workspaces/:workspaceId` (rename, description, runtime preference)
  - `DELETE /api/v1/workspaces/:workspaceId` (soft-delete/state transition + cleanup of workspace storage & active sandboxes)
- Per-user workspace count quota (configurable, e.g. 20 workspaces).
- Audit logging for workspace creation and deletion.
- Integration tests including **cross-tenant access denial** (User B gets `404`/`403` on User A's workspace).
- Update `docs/ENGINEERING_REPORT.md` (Section 07).

**Verify:** `pnpm --filter @ide/api test && pnpm typecheck`

**Commit Command:**

```bash
git add -A
git commit -m "feat(workspace): add workspace CRUD APIs, template hydration, and tenant ownership checks"
```

---

### Commit 8 — [SECURITY HARDENING #2] Hardened Workspace Filesystem Engine

**Goal:** Dedicated security commit building a bulletproof filesystem abstraction defending against path traversal, symlink escapes, resource exhaustion, and archive bombs.

**Build:**

- Create `apps/api/src/services/workspace-storage.ts` enforcing:
  1. **Workspace Root Jail:** Map opaque `storageKey` to `path.resolve(WORKSPACE_STORAGE_ROOT, storageKey)`. Never expose host absolute paths in responses or error messages.
  2. **Strict Path Normalization:** Reject absolute paths, Windows drive letters, null bytes (`\0`), backslashes, `..` traversal segments, control characters, and encoded traversal attempts.
  3. **Symlink Escape Defense:** Walk path segments with `lstat` and verify `realpath` of parent/target remains strictly inside the workspace root; reject symlinks pointing outside (or reject symlink creation/following outright and document the policy).
  4. **Quotas & Ceilings:** Enforce max single file size (e.g., `2 MiB` for text editing, `10 MiB` upload ceiling), max total workspace size (e.g., `100 MiB`), max file count (e.g., `500`), max directory depth (`12`).
  5. **Optimistic Concurrency:** Compute a stable content revision hash (`SHA-256` prefix / mtime+size ETag) for safe conflict detection on writes.
  6. **Safe Streaming & Atomic Writes:** Write to a temp file inside the workspace staging area and atomically `rename`, preventing half-written corrupted source files.
- Write comprehensive unit tests covering every attack vector (`../`, `%2e%2e`, `/etc/passwd`, null bytes, symlink outside root, depth overflow, quota overflow).
- Update `docs/ENGINEERING_REPORT.md` (Section 08).

**Verify:** `pnpm --filter @ide/api test && pnpm typecheck`

**Commit Command:**

```bash
git add -A
git commit -m "security(fs): add workspace storage jail with traversal, symlink, atomic write, and quota guards"
```

---

### Commit 9 — Workspace Filesystem REST Endpoints

**Goal:** Expose file explorer and editor persistence operations over the hardened storage engine.

**Build:**

- Endpoints under `/api/v1/workspaces/:workspaceId/...` (all protected by `requireAuth` + `assertWorkspaceAccess` + CSRF on mutations):
  - `GET /files?path=` — list directory (sorted: directories first, then files, alphabetical).
  - `GET /file?path=` — read UTF-8 file + return `revision` ETag + size + binary detection guard.
  - `PUT /file` — save file content with optional `expectedRevision`; return `409 REVISION_CONFLICT` with server version metadata on mismatch.
  - `POST /files` — create empty file or folder.
  - `PATCH /files` — rename or move file/folder safely within workspace.
  - `DELETE /files?path=` — delete file or directory recursively within workspace root.
  - `POST /upload` — multipart streaming upload with byte limit enforcement.
  - `GET /download?path=` — safe streaming download with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.
- Add integration tests for CRUD, revision conflicts, binary upload, and cross-workspace denial.
- Update `.agent/MEMORY.md` and `docs/ENGINEERING_REPORT.md` (Section 09).

**Verify:** `pnpm --filter @ide/api test && pnpm typecheck`

**Commit Command:**

```bash
git add -A
git commit -m "feat(files): expose workspace file CRUD, upload, download, and revision conflict APIs"
```

---

### Commit 10 — Sandbox Package & Private Runner Service (`packages/sandbox` & `apps/runner`)

**Goal:** Build the isolated runner orchestrator service and minimal non-root OCI runtime Dockerfiles for all supported languages.

**Build:**

- Create `packages/sandbox`:
  - `RuntimeDefinition` allowlist registry (`python`, `javascript`, `typescript`, `c`, `cpp`, `java`, `go`) mapping each language to its server-pinned local image tag (`webide-runtime-python:local`, etc.), fixed `buildArgv`, fixed `runArgv`, timeout, and output ceiling.
  - `diagnostics.ts`: compiler error/warning parsers for `gcc`, `g++`, `javac`, `go`, `tsc`, and Python tracebacks.
- Create hardened Dockerfiles in `infra/docker/`:
  - `sandbox-base.Dockerfile`: minimal Alpine/Debian slim, dedicated non-root user `sandbox` (`uid=10001`, `gid=10001`), no `sudo`, no `suid` binaries, minimal `PATH`, `/workspace` mount point.
  - `runtime-python.Dockerfile` (Python 3.12)
  - `runtime-node.Dockerfile` (Node.js 22 + `typescript` + `tsx`)
  - `runtime-cpp.Dockerfile` (`gcc`, `g++`, `make` minimal toolchain)
  - `runtime-java.Dockerfile` (OpenJDK 21 JDK)
  - `runtime-go.Dockerfile` (Go 1.23)
  - Add root script `pnpm runner:build-images` to build all sandbox images reproducibly.
- Create `apps/runner`:
  ```bash
  pnpm --filter @ide/runner add fastify dockerode pino zod ioredis bullmq
  pnpm --filter @ide/runner add @ide/contracts@workspace:* @ide/sandbox@workspace:*
  pnpm --filter @ide/runner add -D @types/dockerode
  ```
- Implement `SandboxManager`: creates containers from **allowlisted images only**, tracks active leases with heartbeat/expiry, runs a periodic orphan reaper cleaning stale containers labeled `managed-by=webide-runner`.
- Update `docs/ENGINEERING_REPORT.md` (Section 10).

**Verify:** Run `pnpm runner:build-images` (if Docker is active) and unit tests for `packages/sandbox`.

**Commit Command:**

```bash
git add -A
git commit -m "feat(runner): create private runner service, sandbox image Dockerfiles, and runtime registry"
```

---

### Commit 11 — [SECURITY HARDENING #3] Container Isolation, Seccomp, Non-Root & Resource Ceilings

**Goal:** Dedicated security commit locking down the sandbox container runtime at the Linux kernel boundary.

**Build:**

- Create `infra/docker/seccomp-sandbox.json`: restrictive seccomp profile blocking dangerous syscalls (`ptrace`, `mount`, `umount2`, `kexec_load`, `reboot`, `swapon`, `init_module`, `bpf`, `userfaultfd`, `keyctl`, `unshare`, `setns`, `clone` with user/net/pid namespace flags).
- Enforce mandatory container creation flags in `apps/runner/src/sandbox/policy.ts` (immutable server-side ceilings, impossible for client requests to raise):
  - `User: "10001:10001"` (strict non-root)
  - `Privileged: false`
  - `CapDrop: ["ALL"]`
  - `SecurityOpt: ["no-new-privileges:true", "seccomp=<profile>"]`
  - `ReadonlyRootfs: true`
  - `Tmpfs`: `/tmp: "rw,nosuid,nodev,size=128m"` (and `/tmp/build: "rw,nosuid,nodev,exec,size=64m"` ONLY for compiled binary targets, immediately wiped on container removal)
  - `NanoCpus`: `1_000_000_000` (1 vCPU max)
  - `Memory`: `512 * 1024 * 1024` (512 MiB) + `MemorySwap: 512 * 1024 * 1024` (swap disabled)
  - `PidsLimit`: `64` (blocks fork bombs)
  - `Ulimits`: `nofile` (`256:256`), `fsize` (`33554432` = 32 MiB max created file)
  - `Binds`: ONLY the single authorized workspace directory bound to `/workspace` (`rw` for terminal/compile, `ro` option when not modifying workspace). Never mount host `/`, `/home`, `/var/run/docker.sock`, or secrets.
  - Optional `Runtime`: reads `SANDBOX_OCI_RUNTIME` (e.g., `runsc` for gVisor or `kata` in production) and logs active isolation tier clearly at boot.
- Write unit tests verifying the generated Docker container config strictly satisfies every security invariant.
- Update `docs/ENGINEERING_REPORT.md` (Section 11).

**Verify:** `pnpm --filter @ide/runner test && pnpm typecheck`

**Commit Command:**

```bash
git add -A
git commit -m "security(sandbox): enforce non-root, cap-drop ALL, seccomp, RO rootfs, and cgroup resource limits"
```

---

### Commit 12 — [SECURITY HARDENING #4] Network Egress Denial & Signed Internal Capabilities

**Goal:** Dedicated security commit isolating sandboxes from all networks and authenticating every API-to-Runner request with short-lived scoped capabilities.

**Build:**

- **Zero-Network Sandboxes:** Hardcode `NetworkMode: "none"` on all execution and terminal sandboxes by default (`EXECUTION_NETWORK_MODE=disabled`). Sandboxes cannot reach PostgreSQL, Redis, `apps/api`, `apps/runner`, host localhost, cloud metadata (`169.254.169.254`), or the public internet.
- **Short-Lived Capability Tokens (`packages/sandbox/src/capability.ts`):**
  - API signs a compact HMAC-SHA256 (or Ed25519) capability token containing `{ jti, userId, workspaceId, storageKey, scope: "execute" | "terminal", exp }` with TTL `<= 60 seconds` using `RUNNER_SHARED_SECRET`.
  - Runner middleware verifies signature (timing-safe comparison), checks expiration, checks `scope`, and prevents replay of single-use `jti` via Redis `SET NX EX`.
  - Runner binds exclusively to internal host (`127.0.0.1` in local dev, private Docker network in Compose/production).
  - Verify `apps/api` has **zero** dependency on `dockerode` and **zero** access to Docker socket.
- Unit & integration tests verifying tampered tokens, expired tokens, wrong-scope tokens, and replayed `jti` tokens are all rejected with `401/403`.
- Update `.agent/MEMORY.md` and `docs/ENGINEERING_REPORT.md` (Section 12).

**Verify:** `pnpm test && pnpm typecheck`

**Commit Command:**

```bash
git add -A
git commit -m "security(network): enforce sandbox network=none and signed short-lived API-to-runner capabilities"
```

---

### Commit 13 — Server-Side Compile & Run Pipeline, Queue & Language Adapters

**Goal:** Complete end-to-end execution engine compiling and running user code inside sandboxes and streaming live output + compiler diagnostics back to the browser.

**Build:**

- **Job State Machine (`apps/api` + `apps/runner`):**
  - Enforced valid transitions: `queued -> preparing -> running -> completed | failed | timed_out | cancelled | resource_limited`.
  - BullMQ queue (`execution-jobs`) with bounded concurrency, idempotency key support, and stale-job lease reconciliation if the runner restarts.
- **Compile + Execute Adapters (strict `argv` arrays, zero shell interpolation):**
  - `python`: `["python3", "-I", "-u", "/workspace/<file>"]`
  - `javascript`: `["node", "/workspace/<file>"]`
  - `typescript`: build/check `["tsc", "--noEmit", "--pretty", "false", "/workspace/<file>"]` -> run `["tsx", "/workspace/<file>"]`
  - `c`: build `["gcc", "-std=c17", "-Wall", "-Wextra", "-O2", "/workspace/<file>", "-o", "/tmp/build/app"]` -> run `["/tmp/build/app"]`
  - `cpp`: build `["g++", "-std=c++20", "-Wall", "-Wextra", "-O2", "/workspace/<file>", "-o", "/tmp/build/app"]` -> run `["/tmp/build/app"]`
  - `java`: build `["javac", "-d", "/tmp/build", "/workspace/<file>"]` -> run `["java", "-cp", "/tmp/build", "<MainClass>"]`
  - `go`: build `["go", "build", "-o", "/tmp/build/app", "/workspace/<file>"]` -> run `["/tmp/build/app"]`
- **Live Streaming & Limits:**
  - Capture `stdout` and `stderr` separately via Docker multiplexed stream demuxer.
  - Enforce hard `MAX_EXECUTION_OUTPUT_BYTES` (1 MiB) with clean truncation event (`resource_limited`).
  - Enforce wall-clock timeout (`MAX_EXECUTION_SECONDS`, default 10s; separate compile timeout 15s) killing the entire container on timeout.
  - Publish live `ExecutionEvent` messages (`status`, `compile_diagnostics`, `stdout`, `stderr`, `completed`, `limit`, `error`) to Redis Pub/Sub channel `exec:<jobId>`.
- **API Endpoints & Streaming:**
  - `POST /api/v1/workspaces/:id/executions`
  - `GET /api/v1/executions/:jobId` (ownership verified)
  - `POST /api/v1/executions/:jobId/cancel` (publishes cancel signal -> runner kills container immediately)
  - `WS /api/v1/executions/:jobId/stream` (authenticated & authorized subscription to live events)
- Update `docs/ENGINEERING_REPORT.md` (Section 13).

**Verify:** Run integration tests compiling and executing real Python, JS, and C++ files inside sandboxes, plus timeout & cancellation tests.

**Commit Command:**

```bash
git add -A
git commit -m "feat(runtime): implement BullMQ compile-and-run pipeline, language adapters, and live event streaming"
```

---

### Commit 14 — Sandbox-Backed Interactive Terminal (Real PTY + WebSocket Bridge)

**Goal:** Real interactive bash/sh pseudo-terminal running inside the user's isolated sandbox container.

**Build:**

- **Runner PTY Engine (`apps/runner/src/terminal/`):**
  - Provisions or reuses an active workspace terminal sandbox (same hardened non-root, `network=none`, cgroup limits, workspace-only mount).
  - Spawns a real PTY (`docker exec` with `Tty: true`, `AttachStdin/Stdout/Stderr: true`, controlled minimal `TERM=xterm-256color`, `HOME=/tmp`, working dir `/workspace`).
  - Supports live resize (`exec.resize({ h: rows, w: cols })`).
  - Tracks last activity timestamp; enforces idle expiry (30m) and max active sessions per workspace (2).
  - Destroys container & kills descendant processes on close/expiry.
- **API Terminal Gateway (`apps/api/src/routes/terminals.ts`):**
  - `POST /api/v1/workspaces/:id/terminals` — authorizes user, checks quota, asks runner to start PTY, returns `terminalId` + single-use 30-second WebSocket ticket (stored in Redis, consumed once; never uses long-lived session tokens in URLs).
  - `GET /api/v1/terminals/:terminalId`
  - `DELETE /api/v1/terminals/:terminalId`
  - `WS /api/v1/terminals/:terminalId/stream` — validates cookie + single-use ticket + workspace ownership, validates every incoming JSON frame with Zod (`input`, `resize`, `ping`), enforces input frame size cap and output backpressure buffering (pauses stream if WS `bufferedAmount` exceeds threshold).
- Update `.agent/MEMORY.md` and `docs/ENGINEERING_REPORT.md` (Section 14).

**Verify:** Integration tests verifying terminal creation, command execution inside sandbox, resize, disconnect cleanup, and cross-user attach denial.

**Commit Command:**

```bash
git add -A
git commit -m "feat(terminal): add sandbox-backed PTY sessions and backpressure-controlled WebSocket bridge"
```

---

### Commit 15 — Modern Web Shell, Auth Flows & Workspace Dashboard (`apps/web`)

**Goal:** Clean, fast, industrial-grade Next.js frontend with authentic developer aesthetics (strictly following Section 4 anti-AI-slop rules).

**Build:**

- Initialize `apps/web` with Next.js App Router, Tailwind CSS, TanStack Query, Zustand, `lucide-react`:
  ```bash
  pnpm --filter @ide/web add next react react-dom @tanstack/react-query zustand lucide-react
  pnpm --filter @ide/web add @ide/contracts@workspace:* @ide/editor@workspace:*
  ```
- Define design tokens in `globals.css` supporting dark default + light theme (`data-theme="dark" | "light"`) without flash on reload.
- Implement typed API client (`src/lib/api-client.ts`) handling credentials, CSRF token header automatically, and typed error mapping.
- Build routes:
  - `/` — clean developer-focused landing or immediate redirect to `/dashboard` when authenticated.
  - `/login` & `/register` — crisp, accessible forms with clear inline validation.
  - `/dashboard` — workspace search/filter, dense clean workspace list/cards showing language badge, last modified timestamp, quick open/rename/delete (with confirmation dialog), empty state, loading skeletons, and **Create Workspace** modal with starter template picker.
  - `/settings` — theme, editor font size, tab size, word wrap, minimap, autosave interval.
- Update `docs/ENGINEERING_REPORT.md` (Section 15).

**Verify:** `pnpm --filter @ide/web build && pnpm typecheck && pnpm lint`

**Commit Command:**

```bash
git add -A
git commit -m "feat(web): build Next.js app shell, theme tokens, auth pages, and workspace dashboard"
```

---

### Commit 16 — VS Code-Class Monaco Editor Workbench & File Explorer

**Goal:** Full-featured browser code editor with multi-tab management, file explorer, autosave, conflict resolution, and keyboard command palette.

**Install:**

```bash
pnpm --filter @ide/web add @monaco-editor/react monaco-editor react-resizable-panels
```

**Build:**

- Create `packages/editor`: complete extension-to-Monaco-language map (all extensions from `GUIDE.md` Section 6.2), custom matching Monaco dark/light theme definitions (`workbench-dark`, `workbench-light`).
- Build `/workspace/[workspaceId]` workbench shell:
  - **Top Bar:** compact workspace breadcrumb/title, language runtime indicator, **Run** (`Ctrl+Enter`) & **Stop** (`Shift+F5`) buttons, theme toggle, account menu.
  - **Activity Bar + Resizable File Explorer:** lazy directory loading, create file/folder inline, rename, move, delete with confirmation, file upload & download, right-click context menu, refresh.
  - **Multi-Tab Bar:** open file tabs, dirty indicator (`●`), close tab, close others, keyboard tab switching.
  - **Lazy-Loaded Monaco Editor:** stable model per open file URI (never recreated on React rerenders; disposed on tab close), debounced autosave (`750ms`), immediate save (`Ctrl/Cmd+S`), `409` revision conflict modal (reload vs. overwrite), inline diagnostics markers (`setModelMarkers`) fed from compiler errors.
  - **Quick Open (`Ctrl/Cmd+P`) & Command Palette (`Ctrl/Cmd+Shift+P`):** keyboard-navigable fuzzy filter over files and IDE commands.
  - **Status Bar:** cursor position (`Ln X, Col Y`), language override selector, save status, sandbox state.
- Update `docs/ENGINEERING_REPORT.md` (Section 16).

**Verify:** `pnpm --filter @ide/web build && pnpm typecheck && pnpm lint`

**Commit Command:**

```bash
git add -A
git commit -m "feat(ide): integrate Monaco Editor workbench, file explorer, autosave, and command palette"
```

---

### Commit 17 — Integrated xterm.js Terminal, Live Run Output & Clickable Problems Panel

**Goal:** Complete the vertical user loop inside the IDE: edit -> compile & run -> inspect output/errors -> use real sandbox terminal.

**Install:**

```bash
pnpm --filter @ide/web add @xterm/xterm @xterm/addon-fit @xterm/addon-web-links
```

**Build:**

- **Bottom Resizable Panel** (`Terminal | Output | Problems`) toggleable via `` Ctrl+` ``:
  - **Terminal Tab:** multi-session xterm.js tabs (up to workspace quota), dynamic `FitAddon` resize syncing to sandbox PTY, connection status pill (`Connected / Reconnecting / Exited`), clear button, copy/paste support, explicit reconnect action.
  - **Output Tab:** streams live compilation & execution output via WebSocket, visually distinguishes `stdout` vs `stderr` with labels & subtle left accent bar (not color alone), shows compile time, run duration, exit code badge, timeout/OOM/output-limit banners. Renders output strictly as escaped text (never HTML).
  - **Problems Tab:** lists parsed compiler diagnostics (`file`, `line:col`, `severity`, `message`). Clicking any row opens the file in Monaco and focuses `(line, col)`.
- **Responsive Narrow Viewport Support:** Collapsible slide-over explorer drawer and clean mobile/tablet tab switcher below `900px`.
- **Accessibility Pass:** Focus traps on modals, `aria-label` on icon-only controls, visible keyboard focus rings, `aria-live="polite"` for execution status announcements.
- Update `.agent/MEMORY.md` and `docs/ENGINEERING_REPORT.md` (Section 17).

**Verify:** `pnpm build && pnpm typecheck && pnpm lint`

**Commit Command:**

```bash
git add -A
git commit -m "feat(ide): add xterm.js terminal, live compile/run output stream, and clickable Problems panel"
```

---

### Commit 18 — [SECURITY HARDENING #5] CSP, Security Headers, Output Sanitization & Abuse Quotas

**Goal:** Dedicated security commit hardening the browser delivery layer, API abuse controls, and supply-chain hygiene.

**Build:**

- Configure strict security headers on both `apps/web` (Next.js headers/middleware) and `apps/api` (`@fastify/helmet`):
  - Strict `Content-Security-Policy` tailored for Monaco workers and WebSocket origin (no arbitrary remote script execution).
  - `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` disabling camera/mic/geolocation.
- Audit all output rendering components to guarantee zero `dangerouslySetInnerHTML` on untrusted stdout/stderr/filenames.
- Enforce server-side per-user sliding-window rate limits & quotas on:
  - Execution submissions (e.g., max 20 runs/min, max 2 concurrent runs per user).
  - Terminal session creation (max 10/min, max 2 concurrent per workspace).
  - File uploads and writes.
- Run `pnpm audit --prod` and resolve or document any advisories honestly.
- Update `docs/ENGINEERING_REPORT.md` (Section 18).

**Verify:** `pnpm lint && pnpm typecheck && pnpm build`

**Commit Command:**

```bash
git add -A
git commit -m "security(web): enforce strict CSP, security headers, output sanitization, and abuse rate limits"
```

---

### Commit 19 — Automated Unit, Integration, Security Regression & Playwright E2E Suites

**Goal:** Prove functionality and security invariants with real, repeatable automated tests.

**Install:**

```bash
pnpm add -Dw @playwright/test
pnpm exec playwright install chromium
```

**Build:**

- **Unit & Integration Suites (`apps/*/src/**/*.test.ts`, `packages/*/src/**/*.test.ts`):**
  - Path jail, revision conflicts, runtime selection, compiler diagnostic parsers, job state transitions, capability token verification.
- **Dedicated Security Regression Suite (`tests/security/`):**
  - Path traversal (`../`, URL-encoded, null-byte, absolute path) -> blocked.
  - Symlink escape attempt -> blocked.
  - Oversized file & output flood (`> 1 MiB`) -> truncated cleanly with `resource_limited`.
  - Infinite loop timeout -> terminated cleanly with `timed_out`.
  - Fork bomb / excessive processes -> contained by `PidsLimit` with zero host impact.
  - Sandbox outbound network attempt (e.g., trying to connect to external IP, localhost Postgres/Redis, or `169.254.169.254`) -> blocked by `network=none`.
  - Cross-tenant workspace, file, execution job, and terminal ID spoofing -> blocked (`403`/`404`).
  - Unauthenticated / invalid-ticket WebSocket upgrade -> rejected.
  - Orphan sandbox cleanup verification.
- **Playwright E2E Suite (`tests/e2e/ide.spec.ts`):**
  1. Register/login User A.
  2. Create a Python workspace, open `main.py` in Monaco, edit, save, run -> verify `stdout` & `exitCode: 0`.
  3. Trigger a deliberate runtime error -> verify `stderr` & non-zero exit code.
  4. Create a C++ workspace, introduce a syntax error -> run -> verify **Problems** tab shows error and clicking it jumps cursor -> fix error -> compile & run -> verify binary `stdout`.
  5. Open integrated terminal -> execute harmless `pwd && ls` inside sandbox -> verify output.
  6. Create/rename/delete a file, refresh page -> verify persistence.
  7. Run an infinite sleep/loop -> click **Stop** -> verify cancelled status.
  8. Register User B -> attempt to open User A's workspace URL & API -> verify denied.
- Create `.github/workflows/ci.yml` running install, lint, typecheck, unit tests, and production build on push/PR.
- Update `docs/ENGINEERING_REPORT.md` (Section 19) with exact real test counts and pass/fail/skipped logs.

**Verify:** Run `pnpm test`, `pnpm test:security`, `pnpm test:e2e`, `pnpm build`.

**Commit Command:**

```bash
git add -A
git commit -m "test: add unit, integration, security regression, and Playwright E2E test suites with CI"
```

---

### Commit 20 — Polished GitHub Documentation, Requirements & Final Engineering Report

**Goal:** Deliver a showcase-quality GitHub repository with crystal-clear, verified documentation and a reconciled single-file English engineering report.

**Build:**

1. **`README.md` (Polished, Clean, Scannable — NOT noisy):**
   - Clean header with project name, sharp one-line description, and restrained shields/badges (TypeScript, Next.js, Fastify, Docker, PostgreSQL, Redis).
   - Concise **Highlights / Feature Matrix** table.
   - Clean ASCII **Architecture Diagram** linking to `docs/architecture.md`.
   - **Supported Languages & Runtimes** table (ONLY languages actually tested and passing).
   - **Quickstart (Fresh Clone to Running IDE)** — exact verified copy-pasteable commands (prerequisites, `.env` setup, `pnpm install`, `pnpm infra:up`, `pnpm db:migrate`, `pnpm runner:build-images`, `pnpm dev`).
   - **Available Scripts** table (every command verified to exist in `package.json`).
   - **Security Model** callout box clearly stating local Docker isolation vs. production gVisor/Kata/microVM requirements.
   - **Troubleshooting** collapsible `<details>` sections (DB/Redis ports, Docker permissions, missing sandbox images, WS reconnects).
   - Placeholder section for UI screenshots (do not fabricate fake images).
   - Links to `REQUIREMENTS.md`, `SECURITY.md`, `CONTRIBUTING.md`, `docs/ENGINEERING_REPORT.md`, and `docs/*`.
2. **`REQUIREMENTS.md`:**
   - Complete functional requirements checklist.
   - Non-functional performance & reliability targets.
   - Host hardware, OS, Node.js, pnpm, Docker, PostgreSQL, Redis version requirements.
   - Pinned runtime/compiler versions inside sandbox images.
   - Security & multi-tenancy invariants.
3. **`SECURITY.md` & `CONTRIBUTING.md`:**
   - Supported isolation boundaries, threat model summary, responsible disclosure template, and Conventional Commit / PR workflow guide.
4. **Technical Guides (`docs/`):**
   - `docs/architecture.md`
   - `docs/security.md`
   - `docs/api.md`
   - `docs/development.md` (including how to add a new language runtime adapter)
   - `docs/operations.md` (production gVisor/Kata setup, secrets, backups, scaling, metrics, incident response)
5. **Reconcile `docs/ENGINEERING_REPORT.md` (Section 20 + Master Commit Log Table):**
   - Run `git log --reverse --oneline` and populate a verified **Master Commit History Table** at the top of `docs/ENGINEERING_REPORT.md` linking every commit hash (`Commit 1` through `Commit 19`, plus `Commit 20` summary) to its section.
   - Add final **Verification Summary**, **Security Checklist Status**, and **Known Limitations**.
6. **Final Memory Update:**
   - Update `.agent/MEMORY.md` and `.agent/WORKLOG.md` to reflect final completed state.

**Verify:** Re-verify every command written in `README.md`, run `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, and check `git status`.

**Commit Command:**

```bash
git add -A
git commit -m "docs: add polished README, REQUIREMENTS, security/architecture guides, and final engineering report"
```

---

## 8. Final Verification & Handoff Checklist

Before concluding the session, run and report the exact output of:

```bash
git status
git log --reverse --oneline
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Confirm every box below in your final response to the user:

- [ ] Repository has a clean, linear, Conventional-Commit Git history with dedicated security hardening commits (`security(auth)`, `security(fs)`, `security(sandbox)`, `security(network)`, `security(web)`).
- [ ] User code compiles and runs **exclusively** inside isolated non-root, network-disabled sandboxes with resource ceilings.
- [ ] Monaco Editor, File Explorer, compiled language error diagnostics (`Problems` tab), live `Output` stream, and real `xterm.js` sandbox PTY terminal all work end-to-end.
- [ ] UI is modern, crisp, dark/light themed, responsive, and free of generic AI-slop visuals.
- [ ] `README.md`, `REQUIREMENTS.md`, `SECURITY.md`, `CONTRIBUTING.md`, and `docs/*` are complete, accurate, and polished.
- [ ] All phase reports live together inside the **single English file** `docs/ENGINEERING_REPORT.md`.
- [ ] `.agent/MEMORY.md`, `.agent/WORKLOG.md`, and `AGENTS.md` are up to date.
- [ ] Zero secrets, `.env` files, or local runtime data are committed.
