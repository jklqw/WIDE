FROM golang:1.23-alpine

RUN addgroup -g 10001 sandbox && adduser -u 10001 -G sandbox -D -H -s /sbin/nologin sandbox \
    && mkdir -p /workspace /tmp/build /tmp/gocache /tmp/gopath \
    && chown -R sandbox:sandbox /workspace /tmp/build /tmp/gocache /tmp/gopath

ENV GOCACHE=/tmp/gocache GOPATH=/tmp/gopath GOFLAGS=-mod=mod GOPROXY=off
USER sandbox
WORKDIR /workspace
CMD ["sleep", "infinity"]
