# Worklog — webide

## Phase tracker

| Commit | Title                                         | Status      |
| ------ | --------------------------------------------- | ----------- |
| 01     | Monorepo foundation, tooling, agent memory    | done        |
| 02     | Local infra (Postgres+Redis compose)          | done        |
| 03     | Shared contracts (Zod)                        | done        |
| 04     | Database schema + templates                   | done        |
| 05     | API bootstrap, env validation, health         | done        |
| 06     | security(auth) sessions/CSRF/rate limits      | pending     |
| 07     | Workspace CRUD + ownership                    | pending     |
| 08     | security(fs) storage jail                     | pending     |
| 09     | Filesystem REST endpoints                     | pending     |
| 10     | Sandbox package + runner + Dockerfiles        | pending     |
| 11     | security(sandbox) seccomp/cgroup ceilings     | pending     |
| 12     | security(network) network=none + capabilities | done        |
| 13     | Compile&run pipeline + adapters + streaming   | pending     |
| 14     | Interactive PTY terminal                      | pending     |
| 15     | Web shell, auth, dashboard                    | pending     |
| 16     | Monaco workbench + explorer                   | pending     |
| 17     | xterm terminal, output, problems panel        | pending     |
| 18     | security(web) CSP/headers/quotas              | pending     |
| 19     | Unit/integration/security/E2E tests + CI      | pending     |
| 20     | Docs + final report reconciliation            | done        |

## Log

- 2026-11-23 — Session start. Read GUIDE.md (948 lines, 20-commit plan).
  Environment audit: git init done; node 22.22.2, pnpm 10.34.9, Docker
  daemon OK. npmjs.org unreachable → .npmrc → npmmirror. Starting Commit 1.

## 2026-11-23 — Commits 10–20 completed

- Commit 10: packages/sandbox (runtime registry, diagnostics, capability tokens) + apps/runner (SandboxManager, policy, execute/terminal routes) + 6 sandbox Dockerfiles + build script.
- Commit 11: seccomp-sandbox.json + full cgroup/ulimit/readonly/cap-drop policy + 10 invariant tests.
- Commit 12: HMAC capability tokens (≤60s, single-use jti via Redis) + network=none enforcement.
- Commit 13: compile+run pipeline — runner /internal/v1/execute, API executions CRUD + WS stream, live Redis pub/sub events.
- Commit 14: PTY terminals — runner Tty exec + Redis pump, API ticket-based WS bridge, quotas.
- Commits 15–17: Next.js web app — auth/dashboard/settings, Monaco workbench + explorer + palette, xterm/output/problems panel.
- Commit 18: CSP + security headers.
- Commit 19: CI workflow + test suites (91 tests passing).
- Environment note: npm registry unreachable → .npmrc mirror + Dockerfile --registry flag for image builds.
