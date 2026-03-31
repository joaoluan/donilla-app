#!/bin/sh
set -eu

APP_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
BACKEND_CONTAINER="${DONILLA_BACKEND_CONTAINER:-donilla-backend}"

usage() {
  cat <<'EOF'
Uso:
  sh ./scripts/run-prisma-command.sh validate
  sh ./scripts/run-prisma-command.sh generate
  sh ./scripts/run-prisma-command.sh db-check

Comportamento:
  - se DATABASE_URL existir no shell atual, roda localmente
  - se nao existir, tenta reutilizar o container do backend
EOF
}

if [ "$#" -lt 1 ]; then
  usage
  exit 1
fi

case "$1" in
  validate)
    LOCAL_CMD="npx prisma validate"
    ;;
  generate)
    LOCAL_CMD="npx prisma generate"
    ;;
  db-check)
    LOCAL_CMD="node test-prisma.js"
    ;;
  *)
    usage
    exit 1
    ;;
esac

run_local() {
  cd "${APP_DIR}"
  sh -c "${LOCAL_CMD}"
}

run_in_container() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "docker nao esta disponivel e DATABASE_URL nao foi definida localmente." >&2
    exit 1
  fi

  if ! docker inspect "${BACKEND_CONTAINER}" >/dev/null 2>&1; then
    echo "DATABASE_URL nao existe no shell local e o container ${BACKEND_CONTAINER} nao foi encontrado." >&2
    exit 1
  fi

  if [ "$(docker inspect --format '{{.State.Running}}' "${BACKEND_CONTAINER}")" != "true" ]; then
    echo "O container ${BACKEND_CONTAINER} existe, mas nao esta em execucao." >&2
    exit 1
  fi

  if [ "$(docker exec "${BACKEND_CONTAINER}" sh -lc 'if [ -n "$DATABASE_URL" ]; then echo set; else echo missing; fi')" != "set" ]; then
    echo "O container ${BACKEND_CONTAINER} esta rodando, mas nao possui DATABASE_URL carregada." >&2
    exit 1
  fi

  echo "DATABASE_URL ausente no shell local; reutilizando a configuracao do container ${BACKEND_CONTAINER}."
  docker exec "${BACKEND_CONTAINER}" sh -lc "cd /app && ${LOCAL_CMD}"
}

if [ -n "${DATABASE_URL:-}" ]; then
  run_local
else
  run_in_container
fi
