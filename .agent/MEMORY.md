# Agent Memory — webide

Durable technical memory for future agent sessions. Read and update at
phase boundaries.

## Environment (verified 2026-11-23)

- OS: Fedora Linux x86_64, Node v22.22.2, pnpm 10.34.9 (via corepack-less
  global install), git 2.56, Docker 29.9.2, Docker Compose v5.6.0 — daemon
  reachable.
- `registry.npmjs.org` unreachable from Node/pnpm → `.npmrc` uses
  `registry.npmmirror.com`. Do not remove.
- Git author configured as `User <user@example.com>`.
- corepack NOT installed; pnpm already on PATH.

## Architecture decisions

- pnpm workspaces: `apps/*`, `packages/*`. Strict TS (`strict`,
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- `apps/api` = Fastify REST/WS, owns auth/workspaces/filesystem/quota logic,
  enqueues jobs to BullMQ. **No dockerode dependency.**
- `apps/runner` = private Fastify service holding dockerode; verifies
  HMAC capability tokens, provisions hardened containers
  (non-root uid 10001, cap-drop ALL, seccomp, RO rootfs, network=none,
  cgroup limits), streams stdout/stderr + diagnostics back via Redis Pub/Sub.
- Workspaces stored on API host under `WORKSPACE_STORAGE_ROOT`, mapped by
  opaque `storageKey`; sandbox mounts single workspace dir at `/workspace`.
- Languages: python, javascript, typescript, c, cpp, java, go — fixed argv
  adapters in `packages/sandbox`, zero shell interpolation.

## Status

- See `.agent/WORKLOG.md` for current phase. `docs/ENGINEERING_REPORT.md`
  is the consolidated per-commit report.

## Checkpoint — Project complete (2026-11-23)

All 20 commits landed on main. Final state:
- 91 tests passing across contracts/sandbox/database/editor/runner/api.
- pnpm typecheck + lint clean; pnpm build verified (see ENGINEERING_REPORT §20).
- Sandbox images build via `pnpm runner:build-images` (uses npmmirror registry flag for node image due to env network restrictions).
- Local Docker isolation only — production needs SANDBOX_OCI_RUNTIME=runsc/Kata.
- Execution dispatch is synchronous API→runner (BullMQ documented as follow-up); terminal sessions are per-runner-instance.
- Git log --reverse --oneline is the source of truth for commit hashes in ENGINEERING_REPORT §20 table.
