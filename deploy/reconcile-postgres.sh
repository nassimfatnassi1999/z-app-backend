#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${1:?environment file is required}"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.prod.yml"

env_value() {
  local name="$1" line
  line="$(grep -E "^${name}=" "$ENV_FILE" | tail -n 1 || true)"
  printf '%s' "${line#*=}"
}

desired_user="$(env_value POSTGRES_USER)"
desired_password="$(env_value POSTGRES_PASSWORD)"
desired_database="$(env_value POSTGRES_DB)"

if [[ -z "$desired_user" || -z "$desired_password" || -z "$desired_database" ]]; then
  echo "❌ PostgreSQL reconciliation requires POSTGRES_USER, POSTGRES_PASSWORD and POSTGRES_DB." >&2
  exit 1
fi

compose() {
  BACKEND_ENV_FILE="$ENV_FILE" docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

admin_user=""
candidates=("$desired_user" z_user postgres)
legacy_file="$SCRIPT_DIR/.env.prod"
if [[ -f "$legacy_file" && "$legacy_file" != "$ENV_FILE" ]]; then
  legacy_user="$(grep -E '^POSTGRES_USER=' "$legacy_file" | tail -n 1 | cut -d= -f2- || true)"
  [[ -n "$legacy_user" ]] && candidates+=("$legacy_user")
fi

for candidate in "${candidates[@]}"; do
  [[ -z "$candidate" ]] && continue
  if compose exec -T -u postgres z_postgres psql -U "$candidate" -d postgres -tAc 'SELECT 1' >/dev/null 2>&1; then
    admin_user="$candidate"
    break
  fi
done

if [[ -z "$admin_user" ]]; then
  echo "❌ Existing PostgreSQL volume uses an unknown administrator role." >&2
  echo "Restore the previous deploy environment or inspect roles from a database backup." >&2
  echo "The volume was preserved; no data was deleted." >&2
  exit 1
fi

compose exec -T -u postgres \
  -e Z_DESIRED_DB_USER="$desired_user" \
  -e Z_DESIRED_DB_PASSWORD="$desired_password" \
  -e Z_DESIRED_DB_NAME="$desired_database" \
  z_postgres psql -v ON_ERROR_STOP=1 -U "$admin_user" -d postgres >/dev/null <<'SQL'
\getenv desired_user Z_DESIRED_DB_USER
\getenv desired_password Z_DESIRED_DB_PASSWORD
\getenv desired_database Z_DESIRED_DB_NAME

SELECT format(
  'CREATE ROLE %I WITH LOGIN PASSWORD %L',
  :'desired_user',
  :'desired_password'
)
WHERE NOT EXISTS (
  SELECT 1 FROM pg_roles WHERE rolname = :'desired_user'
) \gexec

SELECT format(
  'ALTER ROLE %I WITH LOGIN PASSWORD %L',
  :'desired_user',
  :'desired_password'
) \gexec

SELECT format(
  'ALTER DATABASE %I OWNER TO %I',
  :'desired_database',
  :'desired_user'
)
WHERE EXISTS (
  SELECT 1 FROM pg_database WHERE datname = :'desired_database'
) \gexec
SQL

if ! compose exec -T \
  -e PGPASSWORD="$desired_password" \
  z_postgres psql -h 127.0.0.1 -U "$desired_user" -d "$desired_database" -tAc 'SELECT 1' >/dev/null 2>&1; then
  echo "❌ PostgreSQL credentials still fail after reconciliation." >&2
  exit 1
fi

echo "✓ PostgreSQL credentials match deploy/.env (existing data preserved)"
