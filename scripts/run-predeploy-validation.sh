#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_SOURCE_CONTAINER="${PREDEPLOY_SOURCE_CONTAINER:-donilla-backend}"
TEMP_APP_CONTAINER="${PREDEPLOY_TEMP_APP_CONTAINER:-donilla-predeploy-check}"
TEMP_APP_NETWORK="${PREDEPLOY_TEMP_APP_NETWORK:-donilla_net}"
TEMP_APP_PORT="${PREDEPLOY_TEMP_APP_PORT:-3100}"
TEMP_APP_HOST="${PREDEPLOY_TEMP_APP_HOST:-127.0.0.1}"
TEMP_APP_NODE_IMAGE="${PREDEPLOY_TEMP_APP_IMAGE:-node:24}"
HEALTH_PATH="${PREDEPLOY_HEALTH_PATH:-/health}"
BASE_URL="${PREDEPLOY_BASE_URL:-${SMOKE_BASE_URL:-}}"
ADMIN_USERNAME="${PREDEPLOY_ADMIN_USERNAME:-${SMOKE_ADMIN_USERNAME:-}}"
ADMIN_PASSWORD="${PREDEPLOY_ADMIN_PASSWORD:-${SMOKE_ADMIN_PASSWORD:-}}"

started_temp_app=0
tmp_env_file=""

require_command() {
  local command_name="$1"

  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "${command_name} is required to run predeploy validation." >&2
    exit 1
  fi
}

log_step() {
  printf '\n[%s] %s\n' "$(date '+%H:%M:%S')" "$1"
}

read_container_env() {
  local container_name="$1"
  docker inspect "${container_name}" --format '{{range .Config.Env}}{{println .}}{{end}}'
}

load_env_value_from_container() {
  local container_name="$1"
  local env_name="$2"

  read_container_env "${container_name}" | sed -n "s/^${env_name}=//p" | head -n1
}

wait_for_health() {
  local url="$1"
  local attempts="${2:-40}"

  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    if curl --silent --show-error --fail "${url}" >/dev/null 2>&1; then
      return 0
    fi

    sleep 1
  done

  return 1
}

cleanup() {
  if [[ "${started_temp_app}" == "1" ]]; then
    docker rm -f "${TEMP_APP_CONTAINER}" >/dev/null 2>&1 || true
  fi

  if [[ -n "${tmp_env_file}" && -f "${tmp_env_file}" ]]; then
    rm -f "${tmp_env_file}"
  fi
}

trap cleanup EXIT

require_command docker
require_command curl
require_command npm

if [[ -z "${BASE_URL}" ]]; then
  log_step "Subindo uma instancia temporaria do backend com o codigo atual"

  if ! docker inspect "${DEFAULT_SOURCE_CONTAINER}" >/dev/null 2>&1; then
    echo "PREDEPLOY_BASE_URL nao foi informado e o container ${DEFAULT_SOURCE_CONTAINER} nao esta disponivel para copiar as variaveis de ambiente." >&2
    exit 1
  fi

  tmp_env_file="$(mktemp)"
  read_container_env "${DEFAULT_SOURCE_CONTAINER}" > "${tmp_env_file}"
  printf 'PORT=%s\nHOST=0.0.0.0\n' "${TEMP_APP_PORT}" >> "${tmp_env_file}"

  docker rm -f "${TEMP_APP_CONTAINER}" >/dev/null 2>&1 || true
  docker run -d --rm \
    --name "${TEMP_APP_CONTAINER}" \
    --network "${TEMP_APP_NETWORK}" \
    -p "${TEMP_APP_HOST}:${TEMP_APP_PORT}:${TEMP_APP_PORT}" \
    --env-file "${tmp_env_file}" \
    -v "${ROOT_DIR}:/workspace" \
    -w /workspace \
    "${TEMP_APP_NODE_IMAGE}" \
    bash -lc 'node index.js' >/dev/null

  started_temp_app=1
  BASE_URL="http://${TEMP_APP_HOST}:${TEMP_APP_PORT}"

  if ! wait_for_health "${BASE_URL}${HEALTH_PATH}"; then
    echo "A instancia temporaria nao respondeu em ${BASE_URL}${HEALTH_PATH}." >&2
    docker logs "${TEMP_APP_CONTAINER}" >&2 || true
    exit 1
  fi
fi

if [[ -z "${ADMIN_USERNAME}" && -n "${DEFAULT_SOURCE_CONTAINER}" ]] && docker inspect "${DEFAULT_SOURCE_CONTAINER}" >/dev/null 2>&1; then
  ADMIN_USERNAME="$(load_env_value_from_container "${DEFAULT_SOURCE_CONTAINER}" "AUTH_ADMIN_USER")"
fi

if [[ -z "${ADMIN_PASSWORD}" && -n "${DEFAULT_SOURCE_CONTAINER}" ]] && docker inspect "${DEFAULT_SOURCE_CONTAINER}" >/dev/null 2>&1; then
  ADMIN_PASSWORD="$(load_env_value_from_container "${DEFAULT_SOURCE_CONTAINER}" "AUTH_ADMIN_PASSWORD")"
fi

if [[ -z "${ADMIN_USERNAME}" || -z "${ADMIN_PASSWORD}" ]]; then
  echo "Credenciais admin ausentes. Defina PREDEPLOY_ADMIN_USERNAME e PREDEPLOY_ADMIN_PASSWORD." >&2
  exit 1
fi

cd "${ROOT_DIR}"

log_step "Rodando testes automatizados"
npm test

log_step "Rodando smoke do catalogo"
SMOKE_BASE_URL="${BASE_URL}" bash ./scripts/run-catalog-smoke.sh

log_step "Rodando smoke do modulo de disparos"
SMOKE_BASE_URL="${BASE_URL}" \
SMOKE_ADMIN_USERNAME="${ADMIN_USERNAME}" \
SMOKE_ADMIN_PASSWORD="${ADMIN_PASSWORD}" \
bash ./scripts/run-broadcast-smoke.sh

log_step "Rodando smoke do Flow Builder"
SMOKE_BASE_URL="${BASE_URL}" \
SMOKE_ADMIN_USERNAME="${ADMIN_USERNAME}" \
SMOKE_ADMIN_PASSWORD="${ADMIN_PASSWORD}" \
bash ./scripts/run-flow-builder-smoke.sh

log_step "Validacao predeploy concluida com sucesso"
