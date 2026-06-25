#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ENV_FILE="$SCRIPT_DIR/.env.prod"
EXAMPLE_ENV_FILE="$SCRIPT_DIR/.env.prod.example"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.prod.yml"

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$EXAMPLE_ENV_FILE" "$ENV_FILE"
  echo "Created deploy/.env.prod from deploy/.env.prod.example."
  echo "Edit deploy/.env.prod with real secrets, then rerun."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed or not available in PATH."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin is not installed or not available."
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

echo "Building and starting Z backend..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build

echo
echo "Running containers:"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps

echo
echo "Recent backend logs:"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" logs --tail=80 z_backend

BACKEND_HOST_PORT="${BACKEND_HOST_PORT:-3002}"
VPS_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
if [[ -z "$VPS_IP" ]]; then
  VPS_IP="<VPS_IP>"
fi

echo
echo "Z backend URL: http://${VPS_IP}:${BACKEND_HOST_PORT}"
echo "Local health check: curl -f http://localhost:${BACKEND_HOST_PORT}/api/v1/health"
echo "Flutter API_BASE_URL=http://${VPS_IP}:${BACKEND_HOST_PORT}"
