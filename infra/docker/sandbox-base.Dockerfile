# sandbox-base: minimal hardened non-root base for all runtime images.
# Build context: repo root is NOT required; this file is self-contained.
FROM alpine:3.20

# Dedicated unprivileged sandbox user — no sudo, no login, no home writes
# outside /tmp (tmpfs at runtime).
RUN addgroup -g 10001 sandbox && adduser -u 10001 -G sandbox -D -H -s /sbin/nologin sandbox \
    && apk add --no-cache ca-certificates

# Minimal PATH; runtime images append their toolchain dirs.
ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# /workspace is the only writable mount point at runtime (bind mount).
# /tmp is a tmpfs provided by the container runtime policy.
RUN mkdir -p /workspace /tmp/build && chown -R sandbox:sandbox /workspace /tmp/build

USER sandbox
WORKDIR /workspace

# Default: idle. Runtime images override ENTRYPOINT/CMD as needed.
CMD ["sleep", "infinity"]
