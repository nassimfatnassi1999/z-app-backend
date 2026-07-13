#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ENV_FILE="${Z_PROD_ENV_FILE:-$SCRIPT_DIR/.env}"
if [[ ! -f "$ENV_FILE" && -f "$SCRIPT_DIR/.env.prod" ]]; then ENV_FILE="$SCRIPT_DIR/.env.prod"; fi
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.prod.yml"
RUNTIME_ENV_FILE="$SCRIPT_DIR/.runtime.env"
MODE="${1:-default}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing deploy/.env. Configure it before monitoring."
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

compose() {
  local env_args=(--env-file "$ENV_FILE")
  [[ -f "$RUNTIME_ENV_FILE" ]] && env_args+=(--env-file "$RUNTIME_ENV_FILE")
  BACKEND_ENV_FILE="$ENV_FILE" BACKEND_DATABASE_URL="${BACKEND_DATABASE_URL:-postgresql://placeholder:placeholder@z_postgres:5432/placeholder}" docker compose "${env_args[@]}" -f "$COMPOSE_FILE" "$@"
}

show_ps() {
  echo "Compose services:"
  compose ps
  echo
  echo "Z containers:"
  docker ps --filter "name=z_backend" --filter "name=z_postgres" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
}

show_health() {
  echo
  echo "Health:"
  for container in z_backend z_postgres; do
    if docker inspect "$container" >/dev/null 2>&1; then
      status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container")"
      echo "- ${container}: ${status}"
    else
      echo "- ${container}: not found"
    fi
  done
}

show_ports() {
  local port="${BACKEND_HOST_PORT:-3002}"
  echo
  echo "Listening check for backend port ${port}:"
  if command -v ss >/dev/null 2>&1; then
    ss -tulpn 2>/dev/null | grep ":${port} " || echo "No listener found on ${port}."
  elif command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"${port}" -sTCP:LISTEN || echo "No listener found on ${port}."
  else
    echo "Neither ss nor lsof is available."
  fi
}

show_usage() {
  echo
  echo "Docker disk usage:"
  docker system df
  echo
  echo "Container memory/CPU snapshot:"
  docker stats --no-stream z_backend z_postgres 2>/dev/null || echo "Stats unavailable; containers may not be running."
}

case "$MODE" in
  logs)
    compose logs -f --tail=100 z_backend
    ;;
  postgres-logs)
    compose logs -f --tail=100 z_postgres
    ;;
  stats)
    show_usage
    ;;
  ps|status)
    show_ps
    show_health
    show_ports
    ;;
  default)
    show_ps
    show_health
    show_ports
    echo
    echo "Recent backend logs:"
    compose logs --tail=100 z_backend
    ;;
  *)
    echo "Usage: ./monitor.sh [logs|postgres-logs|stats|ps|status]"
    exit 1
    ;;
esac
