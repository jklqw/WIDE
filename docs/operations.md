# Operations

## Local development

```bash
pnpm install
pnpm infra:up            # postgres:16 + redis:7 (127.0.0.1 only)
pnpm db:migrate && pnpm db:seed
pnpm runner:build-images # sandbox runtime images (one-time)
pnpm dev                 # web :3000 · api :3001 · runner :3002
```

Demo login after seed: `demo@webide.local` / `Demo1234!` (dev only).

## Production checklist

- Set `NODE_ENV=production`, strong `SESSION_SECRET`,
  `RUNNER_SHARED_SECRET`, `CSRF_SECRET`; never commit `.env`.
- Place `apps/runner` on an isolated Docker network; bind API/web
  publicly, runner unreachable from browsers.
- Install `runsc` (gVisor) or Kata and set `SANDBOX_OCI_RUNTIME`.
- Terminate TLS at a reverse proxy; enforce HSTS.
- Move execution rate limits to Redis; add object storage for
  workspace persistence beyond local disk.

## Health endpoints

- API `/health`, `/ready` (checks Postgres + Redis)
- Runner `/health`, `/ready` (runs reaper sweep)
