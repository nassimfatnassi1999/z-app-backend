#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ENV_FILE="${Z_PROD_ENV_FILE:-$SCRIPT_DIR/.env}"
if [[ ! -f "$ENV_FILE" && -f "$SCRIPT_DIR/.env.prod" ]]; then
  ENV_FILE="$SCRIPT_DIR/.env.prod"
  echo "⚠ Using legacy deploy/.env.prod; rename it to deploy/.env when convenient."
fi
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.prod.yml"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ Missing deploy/.env." >&2
  echo "Create it with real production values before deploying:" >&2
  echo "  cp deploy/.env.prod.example deploy/.env" >&2
  exit 1
fi

"$SCRIPT_DIR/../scripts/validate-env.sh" "$ENV_FILE"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed or not available in PATH."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin is not installed or not available."
  exit 1
fi

compose() {
  BACKEND_ENV_FILE="$ENV_FILE" docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

echo "Stopping the previous deployment..."
compose down --remove-orphans

echo "Building production images without cache..."
compose build --no-cache

echo "Starting freshly-created containers..."
compose up -d --force-recreate

echo "Waiting for the backend healthcheck..."
for attempt in $(seq 1 36); do
  state="$(docker inspect --format '{{.State.Status}}' z_backend 2>/dev/null || true)"
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}' z_backend 2>/dev/null || true)"
  if [[ "$state" == "running" && "$health" == "healthy" ]]; then
    break
  fi
  if [[ "$state" == "exited" || "$state" == "dead" || "$state" == "restarting" ]]; then
    echo "❌ Backend failed while starting (state: ${state})." >&2
    compose logs --tail=100 z_backend >&2
    exit 1
  fi
  if [[ "$attempt" == "36" ]]; then
    echo "❌ Backend did not become healthy before timeout." >&2
    compose ps >&2
    compose logs --tail=100 z_backend >&2
    exit 1
  fi
  sleep 5
done

echo
echo "Running containers:"
compose ps

echo
echo "Recent backend logs:"
compose logs --tail=100 z_backend

if ! compose exec -T z_backend npx prisma migrate status >/dev/null; then
  echo "❌ Prisma migration status failed." >&2
  exit 1
fi

docker image prune -f >/dev/null

BACKEND_HOST_PORT="$(grep -E '^BACKEND_HOST_PORT=' "$ENV_FILE" | tail -n 1 | cut -d= -f2-)"
BACKEND_HOST_PORT="${BACKEND_HOST_PORT:-3002}"
VPS_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
if [[ -z "$VPS_IP" ]]; then
  VPS_IP="<VPS_IP>"
fi

echo
echo "Z backend URL: http://${VPS_IP}:${BACKEND_HOST_PORT}"
echo "Local health check: curl -f http://localhost:${BACKEND_HOST_PORT}/api/v1/health"
echo "Flutter API_BASE_URL=http://${VPS_IP}:${BACKEND_HOST_PORT}"
echo "✓ Deployment completed and backend is healthy."
