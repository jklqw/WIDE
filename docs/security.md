# Security Model

## Trust boundaries

| Layer | Trust | Notes |
| --- | --- | --- |
| `apps/web` (Next.js) | Untrusted client | Session cookie + CSRF token required for mutations; no secrets shipped. |
| `apps/api` (Fastify) | Authenticated | Validates sessions, CSRF, quotas, workspace ownership; never executes user code. |
| `apps/runner` (Fastify) | Private | Loopback/internal network only; requires HMAC capability tokens; the ONLY service with a Docker socket. |
| Sandbox containers | Fully untrusted | uid 10001, `network=none`, RO rootfs, cap-drop ALL, seccomp, cgroup ceilings. |

## Execution isolation

User code and PTY shells run exclusively inside per-job Docker
containers provisioned by `apps/runner`. The API and web tiers never
spawn processes. Sandboxes receive exactly one bind mount
(`<storageKey>` → `/workspace`) plus bounded tmpfs (`/tmp` 128 MiB,
`/tmp/build` 64 MiB for compiled languages). There is no host socket,
no Docker socket, and no network.

## Container hardening (Commit 11)

- Non-root `10001:10001`, `CapDrop: ["ALL"]`, `no-new-privileges`
- Custom seccomp profile (`infra/docker/seccomp-sandbox.json`) denying
  ptrace, mount family, module loading, bpf, io_uring, pidfd, landlock,
  namespace primitives, perf events
- `ReadonlyRootfs`, `NetworkMode: "none"`, swap disabled
- 1 vCPU, 512 MiB RAM, 64 PIDs, `nofile=256`, `fsize=32 MiB`
- `SANDBOX_OCI_RUNTIME=runsc` (gVisor) or Kata for production-grade
  microVM isolation — local Docker is container isolation, NOT
  microVM-grade; do not represent it as equivalent.

## API → runner capabilities

Every runner-internal call requires an HMAC-SHA256 capability token:
`{jti,userId,workspaceId,storageKey,scope,exp}` — TTL ≤ 60 s, scope
`execute` or `terminal`, single-use `jti` enforced via Redis `SET NX PX`.
Signature comparison uses `timingSafeEqual`; Redis outage fails closed.

## Web hardening

CSP (`default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`),
`X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`,
`Permissions-Policy`. Session cookies are HttpOnly + SameSite=Lax;
mutations require the double-submit CSRF token.

## Known limitations

- Rate limiting is per-instance in-memory for executions; production
  should move to Redis-backed sliding windows.
- Docker socket access on the runner is root-equivalent — the runner
  must stay on an isolated network segment with no inbound browser
  access.
- Local sandbox isolation is Docker containers; gVisor/Kata/microVM is
  the production target and is opt-in via `SANDBOX_OCI_RUNTIME`.
