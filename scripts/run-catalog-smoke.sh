#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SMOKE_BASE_URL="${SMOKE_BASE_URL:-http://127.0.0.1:3000}"
SMOKE_PATH="${SMOKE_PATH:-/catalogo}"
PLAYWRIGHT_VERSION="${PLAYWRIGHT_VERSION:-1.58.2}"
PLAYWRIGHT_IMAGE="${PLAYWRIGHT_IMAGE:-mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required to run the catalog smoke test." >&2
  exit 1
fi

docker run --rm \
  --network host \
  -e SMOKE_BASE_URL="${SMOKE_BASE_URL}" \
  -e SMOKE_PATH="${SMOKE_PATH}" \
  -e PLAYWRIGHT_VERSION="${PLAYWRIGHT_VERSION}" \
  -v "${ROOT_DIR}:/workspace:ro" \
  "${PLAYWRIGHT_IMAGE}" \
  bash -lc '
    set -euo pipefail
    tmpdir="$(mktemp -d)"
    cleanup() {
      rm -rf "$tmpdir"
    }
    trap cleanup EXIT

    cd "$tmpdir"
    npm init -y >/dev/null 2>&1
    npm install "playwright@${PLAYWRIGHT_VERSION}" >/dev/null 2>&1
    NODE_PATH="$tmpdir/node_modules" node /workspace/test/catalog.smoke.js
  '
