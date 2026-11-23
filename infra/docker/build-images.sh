#!/usr/bin/env bash
# Build all pinned sandbox runtime images reproducibly.
set -euo pipefail
cd "$(dirname "$0")"

build() {
  local name="$1" dockerfile="$2"
  echo "==> building webide-runtime-${name}:local"
  docker build -f "${dockerfile}" -t "webide-runtime-${name}:local" .
}

build python runtime-python.Dockerfile
build node    runtime-node.Dockerfile
build cpp     runtime-cpp.Dockerfile
build java    runtime-java.Dockerfile
build go      runtime-go.Dockerfile

echo "All sandbox images built."
docker images 'webide-runtime-*' --format 'table {{.Repository}}:{{.Tag}}\t{{.Size}}'
