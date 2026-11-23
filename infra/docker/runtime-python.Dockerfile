FROM python:3.12-alpine

RUN addgroup -g 10001 sandbox && adduser -u 10001 -G sandbox -D -H -s /sbin/nologin sandbox \
    && mkdir -p /workspace /tmp/build && chown -R sandbox:sandbox /workspace /tmp/build

USER sandbox
WORKDIR /workspace
CMD ["sleep", "infinity"]
