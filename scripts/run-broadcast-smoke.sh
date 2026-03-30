#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SMOKE_BASE_URL="${SMOKE_BASE_URL:-http://127.0.0.1:3000}"
SMOKE_PATH="${SMOKE_PATH:-/admin/disparos}"
SMOKE_PREFIX="${SMOKE_PREFIX:-SMOKE-BROADCAST}"
SMOKE_ADMIN_USERNAME="${SMOKE_ADMIN_USERNAME:-}"
SMOKE_ADMIN_PASSWORD="${SMOKE_ADMIN_PASSWORD:-}"
SMOKE_TEST_PHONE="${SMOKE_TEST_PHONE:-5511999999999}"
PLAYWRIGHT_VERSION="${PLAYWRIGHT_VERSION:-1.58.2}"
PLAYWRIGHT_IMAGE="${PLAYWRIGHT_IMAGE:-mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble}"
PG_CONTAINER="${PG_CONTAINER:-postgres_donilla}"
PG_USER="${PG_USER:-admin}"
PG_DATABASE="${PG_DATABASE:-donilla_db}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required to run the broadcast smoke test." >&2
  exit 1
fi

if [[ -z "${SMOKE_ADMIN_USERNAME}" || -z "${SMOKE_ADMIN_PASSWORD}" ]]; then
  echo "SMOKE_ADMIN_USERNAME and SMOKE_ADMIN_PASSWORD are required." >&2
  exit 1
fi

cleanup_smoke_data() {
  docker exec -i "${PG_CONTAINER}" psql -U "${PG_USER}" -d "${PG_DATABASE}" >/dev/null <<SQL
DELETE FROM broadcast_logs
WHERE campaign_id IN (
  SELECT id
  FROM broadcast_campaigns
  WHERE name LIKE '${SMOKE_PREFIX}%'
);

DELETE FROM broadcast_campaigns
WHERE name LIKE '${SMOKE_PREFIX}%';

DELETE FROM broadcast_templates
WHERE name LIKE '${SMOKE_PREFIX}%';

DELETE FROM broadcast_list_members
WHERE client_name LIKE '${SMOKE_PREFIX}%';

DELETE FROM broadcast_lists
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
  -e SMOKE_ADMIN_USERNAME="${SMOKE_ADMIN_USERNAME}" \
  -e SMOKE_ADMIN_PASSWORD="${SMOKE_ADMIN_PASSWORD}" \
  -e SMOKE_TEST_PHONE="${SMOKE_TEST_PHONE}" \
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
    NODE_PATH="$tmpdir/node_modules" node /workspace/test/broadcast.smoke.js
  '
