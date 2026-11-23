# AGENTS.md — Instructions for Coding Agents

This repository implements a browser-based IDE ("webide") with server-side
sandboxed compilation and execution, built per `GUIDE.md`.

## Non-negotiable rules

1. **Never run user code outside the sandbox.** All compile/run/PTY execution
   happens inside containers provisioned by `apps/runner` only. `apps/api`
   must never depend on `dockerode` or the Docker socket.
2. **Security changes get their own commits.** Do not fold security controls
   into feature commits; they are auditable separately (`security(auth)`,
   `security(fs)`, `security(sandbox)`, `security(network)`, `security(web)`).
3. **Commit-by-commit.** Follow the 20-commit sequence in `GUIDE.md` Section 7.
   Update `docs/ENGINEERING_REPORT.md` for every commit.
4. **Keep memory files current.** Update `.agent/MEMORY.md` and
   `.agent/WORKLOG.md` at phase boundaries.
5. **No secrets.** Never commit `.env`, tokens, keys, or local workspace data.
6. **Honest verification.** Only claim tests pass after running them.

## Environment notes (this machine)

- npm registry `registry.npmjs.org` is unreachable; `.npmrc` pins
  `registry.npmmirror.com` — keep it.
- Node v22, pnpm 10, Docker 29 + Compose v5 available and daemon reachable.
- Vitest `toEqual` on multi-MB buffers is slow; use `Buffer.compare`.

## Layout

- `apps/web` — Next.js App Router IDE
- `apps/api` — Fastify REST + WS gateway (no Docker socket)
- `apps/runner` — private sandbox orchestrator (dockerode)
- `packages/contracts` — Zod schemas / DTOs / WS events
- `packages/database` — Prisma schema, migrations, templates
- `packages/editor` — Monaco language map & themes
- `packages/sandbox` — runtime registry, diagnostics, capabilities
- `infra/` — compose + sandbox Dockerfiles + seccomp profile
- `docs/ENGINEERING_REPORT.md` — single consolidated English report
