#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SMOKE_BASE_URL="${SMOKE_BASE_URL:-http://127.0.0.1:3100}"
SMOKE_PATH="${SMOKE_PATH:-/admin/fluxos}"
SMOKE_PREFIX="${SMOKE_PREFIX:-SMOKE-FLOW}"
SMOKE_FLOW_CREATION_MODE="${SMOKE_FLOW_CREATION_MODE:-blank}"
SMOKE_ADMIN_USERNAME="${SMOKE_ADMIN_USERNAME:-}"
SMOKE_ADMIN_PASSWORD="${SMOKE_ADMIN_PASSWORD:-}"
PLAYWRIGHT_VERSION="${PLAYWRIGHT_VERSION:-1.58.2}"
PLAYWRIGHT_IMAGE="${PLAYWRIGHT_IMAGE:-mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble}"
PG_CONTAINER="${PG_CONTAINER:-postgres_donilla}"
PG_USER="${PG_USER:-admin}"
PG_DATABASE="${PG_DATABASE:-donilla_db}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required to run the flow builder smoke test." >&2
  exit 1
fi

if [[ -z "${SMOKE_ADMIN_USERNAME}" || -z "${SMOKE_ADMIN_PASSWORD}" ]]; then
  echo "SMOKE_ADMIN_USERNAME and SMOKE_ADMIN_PASSWORD are required." >&2
  exit 1
fi

cleanup_smoke_data() {
  docker exec -i "${PG_CONTAINER}" psql -U "${PG_USER}" -d "${PG_DATABASE}" >/dev/null <<SQL
DELETE FROM client_flow_sessions
WHERE flow_id IN (
  SELECT id
  FROM bot_flows
  WHERE name LIKE '${SMOKE_PREFIX}%'
);

DELETE FROM bot_flows
WHERE name LIKE '${SMOKE_PREFIX}%';
SQL
}

cleanup() {
  cleanup_smoke_data || true
}

trap cleanup EXIT

cleanup_smoke_data

docker run --rm \
  --network host \
  -e SMOKE_BASE_URL="${SMOKE_BASE_URL}" \
  -e SMOKE_PATH="${SMOKE_PATH}" \
  -e SMOKE_PREFIX="${SMOKE_PREFIX}" \
  -e SMOKE_FLOW_CREATION_MODE="${SMOKE_FLOW_CREATION_MODE}" \
  -e SMOKE_ADMIN_USERNAME="${SMOKE_ADMIN_USERNAME}" \
  -e SMOKE_ADMIN_PASSWORD="${SMOKE_ADMIN_PASSWORD}" \
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
    NODE_PATH="$tmpdir/node_modules" node /workspace/test/flow-builder.smoke.js
  '
