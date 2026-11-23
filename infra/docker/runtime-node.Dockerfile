FROM node:22-alpine

# tsx + typescript for the TypeScript adapter.
RUN npm install -g tsx typescript@5.7.3 --no-fund --no-audit \
    && addgroup -g 10001 sandbox && adduser -u 10001 -G sandbox -D -H -s /sbin/nologin sandbox \
    && mkdir -p /workspace /tmp/build && chown -R sandbox:sandbox /workspace /tmp/build \
    && npm cache clean --force

USER sandbox
WORKDIR /workspace
CMD ["sleep", "infinity"]
