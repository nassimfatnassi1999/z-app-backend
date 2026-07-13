#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${Z_PROD_ENV_FILE:-$SCRIPT_DIR/.env}"
if [[ ! -f "$ENV_FILE" && -f "$SCRIPT_DIR/.env.prod" ]]; then ENV_FILE="$SCRIPT_DIR/.env.prod"; fi
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.prod.yml"
failures=0

ok() { echo "✓ $1"; }
fail() { echo "✗ $1"; failures=$((failures + 1)); }
compose() { BACKEND_ENV_FILE="$ENV_FILE" docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }

command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1 && ok "Docker" || fail "Docker"
docker compose version >/dev/null 2>&1 && ok "Docker Compose" || fail "Docker Compose"

if "$SCRIPT_DIR/../scripts/validate-env.sh" "$ENV_FILE"; then
  ok "Variables d'environnement"
else
  fail "Variables d'environnement (run scripts/validate-env.sh deploy/.env)"
fi

if [[ ! -f "$ENV_FILE" ]] || ! docker info >/dev/null 2>&1; then
  fail "Backend container"
  fail "PostgreSQL"
  fail "Prisma"
  fail "Deepgram configuration"
  fail "Groq configuration"
  fail "Ports"
  fail "Healthcheck"
  echo "❌ Doctor found ${failures} problem(s)." >&2
  exit 1
fi

backend_state="$(docker inspect --format '{{.State.Status}}' z_backend 2>/dev/null || true)"
[[ "$backend_state" == "running" ]] && ok "Backend container" || fail "Backend container (${backend_state:-absent})"

postgres_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' z_postgres 2>/dev/null || true)"
[[ "$postgres_health" == "healthy" ]] && ok "PostgreSQL" || fail "PostgreSQL (${postgres_health:-absent})"

if [[ "$backend_state" == "running" ]]; then
  compose exec -T z_backend npx prisma migrate status >/dev/null 2>&1 && ok "Prisma" || fail "Prisma"
  compose exec -T z_backend sh -c 'test -n "$DEEPGRAM_API_KEY" && test -n "$DEEPGRAM_MODEL"' && ok "Deepgram configuration" || fail "Deepgram configuration"
  compose exec -T z_backend sh -c 'test -n "$GROQ_API_KEY" && test -n "$GROQ_BASE_URL" && test -n "$GROQ_EMAIL_MODEL" && test -n "$GROQ_EXTRACTION_MODEL" && test -n "$GROQ_VALIDATION_MODEL"' && ok "Groq configuration" || fail "Groq configuration"
else
  fail "Prisma"
  fail "Deepgram configuration"
  fail "Groq configuration"
fi

host_port="$(grep -E '^BACKEND_HOST_PORT=' "$ENV_FILE" | tail -n 1 | cut -d= -f2-)"
host_port="${host_port:-3002}"
if command -v curl >/dev/null 2>&1 && curl --silent --fail --max-time 5 "http://localhost:${host_port}/api/v1/health" >/dev/null; then
  ok "Ports"
  ok "Healthcheck"
else
  fail "Ports / healthcheck on ${host_port}"
fi

if ((failures)); then
  echo "❌ Doctor found ${failures} problem(s)." >&2
  exit 1
fi
echo "✓ Production environment is healthy."
