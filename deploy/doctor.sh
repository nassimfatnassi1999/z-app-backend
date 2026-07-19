#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${Z_PROD_ENV_FILE:-$SCRIPT_DIR/.env}"
if [[ ! -f "$ENV_FILE" && -f "$SCRIPT_DIR/.env.prod" ]]; then ENV_FILE="$SCRIPT_DIR/.env.prod"; fi
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.prod.yml"
RUNTIME_ENV_FILE="$SCRIPT_DIR/.runtime.env"
failures=0

ok() { echo "✓ $1"; }
fail() { echo "✗ $1"; failures=$((failures + 1)); }
env_value() {
  local name="$1" line value
  line="$(grep -E "^${name}=" "$ENV_FILE" | tail -n 1 || true)"
  value="${line#*=}"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  printf '%s' "$value"
}
url_encode() {
  local raw="$1" encoded="" char hex i
  LC_ALL=C
  for ((i = 0; i < ${#raw}; i++)); do
    char="${raw:i:1}"
    case "$char" in
      [a-zA-Z0-9.~_-]) encoded+="$char" ;;
      *) printf -v hex '%%%02X' "'$char"; encoded+="$hex" ;;
    esac
  done
  printf '%s' "$encoded"
}
default_backend_database_url() {
  printf 'postgresql://%s:%s@z_postgres:5432/%s' \
    "$(url_encode "$(env_value POSTGRES_USER)")" \
    "$(url_encode "$(env_value POSTGRES_PASSWORD)")" \
    "$(url_encode "$(env_value POSTGRES_DB)")"
}
compose() {
  local env_args=(--env-file "$ENV_FILE")
  local backend_database_url
  if [[ -f "$RUNTIME_ENV_FILE" ]]; then
    env_args+=(--env-file "$RUNTIME_ENV_FILE")
    BACKEND_ENV_FILE="$ENV_FILE" docker compose "${env_args[@]}" -f "$COMPOSE_FILE" "$@"
  else
    backend_database_url="$(default_backend_database_url)"
    BACKEND_ENV_FILE="$ENV_FILE" BACKEND_DATABASE_URL="$backend_database_url" docker compose "${env_args[@]}" -f "$COMPOSE_FILE" "$@"
  fi
}

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
  fail "Database network target"
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
  database_host="$(compose exec -T z_backend node -e 'try { process.stdout.write(new URL(process.env.DATABASE_URL).hostname) } catch { process.exit(1) }' 2>/dev/null || true)"
  [[ "$database_host" == "z_postgres" ]] && ok "Database network target" || fail "Database network target (${database_host:-invalid})"
  mapfile -t runtime_db_parts < <(compose exec -T z_backend node -e 'const url = new URL(process.env.DATABASE_URL); console.log(decodeURIComponent(url.username)); console.log(decodeURIComponent(url.password)); console.log(url.pathname.slice(1));' 2>/dev/null || true)
  if [[ "${#runtime_db_parts[@]}" -eq 3 ]] && compose exec -T -e PGPASSWORD="${runtime_db_parts[1]}" z_postgres psql -h 127.0.0.1 -U "${runtime_db_parts[0]}" -d "${runtime_db_parts[2]}" -tAc 'SELECT 1' >/dev/null 2>&1; then
    ok "Database credentials"
  else
    fail "Database credentials"
  fi
  compose exec -T z_backend npx prisma migrate status >/dev/null 2>&1 && ok "Prisma" || fail "Prisma"
  compose exec -T z_backend sh -c 'test -n "$DEEPGRAM_API_KEY" && test -n "$DEEPGRAM_MODEL"' && ok "Deepgram configuration" || fail "Deepgram configuration"
  compose exec -T z_backend sh -c '
    test -n "$AI_PROVIDER_ORDER" &&
    test -n "$AI_PROVIDER_TIMEOUT_MS" &&
    test -n "$AI_PROVIDER_MAX_ATTEMPTS" &&
    test -n "$AI_CIRCUIT_BREAKER_FAILURE_THRESHOLD" &&
    test -n "$AI_CIRCUIT_BREAKER_COOLDOWN_MS" &&
    {
      { test -n "$GROQ_API_KEY" && test -n "$GROQ_MODEL"; } ||
      { test -n "$GEMINI_API_KEY" && test -n "$GEMINI_MODEL"; } ||
      { test -n "$OPENROUTER_API_KEY" && test -n "$OPENROUTER_MODEL"; }
    }
  ' && ok "AI provider configuration" || fail "AI provider configuration"
else
  fail "Database network target"
  fail "Prisma"
  fail "Deepgram configuration"
  fail "AI provider configuration"
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
