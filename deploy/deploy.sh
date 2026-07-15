#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${Z_PROD_ENV_FILE:-$SCRIPT_DIR/.env}"
[[ -f "$ENV_FILE" || ! -f "$SCRIPT_DIR/.env.prod" ]] || ENV_FILE="$SCRIPT_DIR/.env.prod"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.prod.yml"
BACKEND_ENV_FILE="$SCRIPT_DIR/.backend.runtime.env"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-z_postgres}"
BACKEND_SERVICE="${BACKEND_SERVICE:-z_backend}"
MIGRATE_SERVICE="${MIGRATE_SERVICE:-migrate}"
DB_WAIT_TIMEOUT_SECONDS="${DB_WAIT_TIMEOUT_SECONDS:-120}"
BACKEND_WAIT_TIMEOUT_SECONDS="${BACKEND_WAIT_TIMEOUT_SECONDS:-180}"
ACTION="${1:-deploy}"

log() { printf '[deploy] %s\n' "$*"; }
fail() { printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }
on_error() { local code=$?; printf '[deploy] ERROR: action %s failed at line %s (exit %s).\n' "$ACTION" "$1" "$code" >&2; exit "$code"; }
trap 'on_error $LINENO' ERR

[[ -f "$ENV_FILE" ]] || fail "production environment file not found (expected deploy/.env)"

env_value() {
  local name="$1" line value
  line="$(grep -E "^${name}=" "$ENV_FILE" | tail -n 1 || true)"
  value="${line#*=}"
  value="${value%\"}"; value="${value#\"}"
  value="${value%\'}"; value="${value#\'}"
  printf '%s' "$value"
}

DB_NAME="$(env_value POSTGRES_DB)"
LEGACY_USER="$(env_value POSTGRES_USER)"
LEGACY_PASSWORD="$(env_value POSTGRES_PASSWORD)"
ADMIN_USER="$(env_value POSTGRES_ADMIN_USER)"; ADMIN_USER="${ADMIN_USER:-$LEGACY_USER}"
ADMIN_PASSWORD="$(env_value POSTGRES_ADMIN_PASSWORD)"; ADMIN_PASSWORD="${ADMIN_PASSWORD:-$LEGACY_PASSWORD}"
LEGACY_ADMIN_USER="$(env_value POSTGRES_LEGACY_ADMIN_USER)"
APP_USER="$(env_value POSTGRES_APP_USER)"; APP_USER="${APP_USER:-$LEGACY_USER}"
APP_PASSWORD="$(env_value POSTGRES_APP_PASSWORD)"; APP_PASSWORD="${APP_PASSWORD:-$LEGACY_PASSWORD}"
DATABASE_URL="$(env_value DATABASE_URL)"

require_tools() {
  command -v docker >/dev/null 2>&1 || fail 'docker is not installed or not in PATH'
  docker compose version >/dev/null 2>&1 || fail 'Docker Compose v2 is not available'
}

compose() {
  POSTGRES_ADMIN_USER="$ADMIN_USER" POSTGRES_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  BACKEND_ENV_FILE="$BACKEND_ENV_FILE" BACKEND_DATABASE_URL="$DATABASE_URL" \
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

url_decode() {
  local input="$1" output='' char hex decoded i
  LC_ALL=C
  for ((i=0; i<${#input}; i++)); do
    char="${input:i:1}"
    if [[ "$char" == '%' ]]; then
      (( i + 2 < ${#input} )) || return 1
      hex="${input:i+1:2}"
      [[ "$hex" =~ ^[0-9A-Fa-f]{2}$ ]] || return 1
      [[ "$hex" != '00' ]] || return 1
      printf -v decoded '%b' "\\x$hex"
      output+="$decoded"
      ((i+=2))
    else
      output+="$char"
    fi
  done
  printf '%s' "$output"
}

url_encode() {
  local input="$1" output='' char hex i
  LC_ALL=C
  for ((i=0; i<${#input}; i++)); do
    char="${input:i:1}"
    case "$char" in
      [a-zA-Z0-9.~_-]) output+="$char" ;;
      *) printf -v hex '%%%02X' "'$char"; output+="$hex" ;;
    esac
  done
  printf '%s' "$output"
}

prepare_database_url() {
  # Support the literal ${POSTGRES_*} form used by older env files without
  # sourcing/evaluating their contents. Substituted components are URL-encoded.
  DATABASE_URL="${DATABASE_URL//\$\{POSTGRES_USER\}/$(url_encode "$LEGACY_USER")}"
  DATABASE_URL="${DATABASE_URL//\$\{POSTGRES_PASSWORD\}/$(url_encode "$LEGACY_PASSWORD")}"
  DATABASE_URL="${DATABASE_URL//\$\{POSTGRES_APP_USER\}/$(url_encode "$APP_USER")}"
  DATABASE_URL="${DATABASE_URL//\$\{POSTGRES_APP_PASSWORD\}/$(url_encode "$APP_PASSWORD")}"
  DATABASE_URL="${DATABASE_URL//\$\{POSTGRES_DB\}/$(url_encode "$DB_NAME")}"
  # Prisma already defaults to public; make it explicit for all runtime calls.
  [[ "$DATABASE_URL" == *'?'* ]] || DATABASE_URL="${DATABASE_URL}?schema=public"
}

prepare_backend_env() {
  # Keep all application configuration while ensuring no PostgreSQL role
  # password (especially the administrator password) reaches NestJS.
  local temporary_file="${BACKEND_ENV_FILE}.tmp"
  umask 077
  awk '!/^(POSTGRES_|DATABASE_URL=)/' "$ENV_FILE" > "$temporary_file"
  mv "$temporary_file" "$BACKEND_ENV_FILE"
}

validate_database_url() {
  local encoded_user encoded_password host port encoded_db query decoded_user decoded_password decoded_db
  if [[ "$DATABASE_URL" =~ ^postgres(ql)?://([^:/?#]+):([^@/?#]+)@([^:/?#]+):([0-9]+)/([^/?#]+)(\?(.*))?$ ]]; then
    encoded_user="${BASH_REMATCH[2]}"; encoded_password="${BASH_REMATCH[3]}"
    host="${BASH_REMATCH[4]}"; port="${BASH_REMATCH[5]}"
    encoded_db="${BASH_REMATCH[6]}"; query="${BASH_REMATCH[8]}"
  else
    fail 'DATABASE_URL must be a PostgreSQL URL with user, password, host, port, database, and query string'
  fi
  decoded_user="$(url_decode "$encoded_user")" || fail 'DATABASE_URL contains invalid user percent-encoding'
  decoded_password="$(url_decode "$encoded_password")" || fail 'DATABASE_URL contains invalid password percent-encoding'
  decoded_db="$(url_decode "$encoded_db")" || fail 'DATABASE_URL contains invalid database percent-encoding'
  [[ -n "$decoded_password" ]] || fail 'DATABASE_URL password is empty'
  [[ "$decoded_user" == "$APP_USER" ]] || fail 'DATABASE_URL user does not match POSTGRES_APP_USER/POSTGRES_USER'
  [[ "$decoded_password" == "$APP_PASSWORD" ]] || fail 'DATABASE_URL password does not match POSTGRES_APP_PASSWORD/POSTGRES_PASSWORD'
  [[ "$host" == "$POSTGRES_SERVICE" ]] || fail "DATABASE_URL host must be '$POSTGRES_SERVICE'"
  [[ "$port" == '5432' ]] || fail 'DATABASE_URL container port must be 5432'
  [[ "$decoded_db" == "$DB_NAME" ]] || fail 'DATABASE_URL database does not match POSTGRES_DB'
  [[ "&$query&" == *'&schema=public&'* ]] || fail 'DATABASE_URL must contain schema=public'
  log "Validated DATABASE_URL: postgresql://${encoded_user}:***@${host}:${port}/${encoded_db}?schema=public"
}

validate_env() {
  "$ROOT_DIR/scripts/validate-env.sh" "$ENV_FILE"
  [[ -n "$ADMIN_USER" && -n "$ADMIN_PASSWORD" ]] || fail 'PostgreSQL administrator credentials are missing'
  [[ -n "$APP_USER" && -n "$APP_PASSWORD" ]] || fail 'PostgreSQL application credentials are missing'
  [[ "$ADMIN_USER" != "$APP_USER" || "$ADMIN_PASSWORD" == "$APP_PASSWORD" ]] \
    || fail 'the same PostgreSQL role cannot have two different configured passwords'
  validate_database_url
  require_tools
  compose config --quiet
  log 'Validated Docker Compose configuration.'
}

build_backend() {
  require_tools
  # Stop an old backend before repairing/migrating, but preserve PostgreSQL and its volume.
  compose stop "$BACKEND_SERVICE" >/dev/null 2>&1 || true
  log 'Building the production backend image...'
  compose build "$BACKEND_SERVICE"
}

start_postgres() {
  require_tools
  local previous_admin=''
  previous_admin="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$POSTGRES_SERVICE" 2>/dev/null \
    | sed -n 's/^POSTGRES_USER=//p' | head -n1 || true)"
  if [[ -n "$previous_admin" && "$previous_admin" != *$'\n'* ]]; then
    printf '%s\n' "$previous_admin" > "$SCRIPT_DIR/.postgres-admin-role"
    chmod 600 "$SCRIPT_DIR/.postgres-admin-role"
  fi
  log 'Starting PostgreSQL without removing or recreating its data volume...'
  compose up -d --force-recreate "$POSTGRES_SERVICE"
}

wait_postgres() {
  require_tools
  local deadline=$((SECONDS + DB_WAIT_TIMEOUT_SECONDS)) health
  log 'Waiting for the PostgreSQL healthcheck...'
  while (( SECONDS < deadline )); do
    health="$(compose ps --format json "$POSTGRES_SERVICE" 2>/dev/null | grep -o '"Health":"[^"]*"' | head -n1 || true)"
    [[ "$health" == '"Health":"healthy"' ]] && { log 'PostgreSQL is healthy.'; return 0; }
    sleep 2
  done
  compose logs --tail=100 "$POSTGRES_SERVICE" >&2 || true
  fail "PostgreSQL did not become healthy after ${DB_WAIT_TIMEOUT_SECONDS}s"
}

find_database_admin_role() {
  local hint='' container_hint='' candidate is_super
  [[ ! -f "$SCRIPT_DIR/.postgres-admin-role" ]] || hint="$(head -n1 "$SCRIPT_DIR/.postgres-admin-role")"
  container_hint="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$POSTGRES_SERVICE" 2>/dev/null \
    | sed -n 's/^POSTGRES_USER=//p' | head -n1 || true)"
  # z_user was the production Compose default in older releases. Keep it as a
  # safe local-socket candidate so already-initialized volumes self-heal.
  for candidate in "$ADMIN_USER" "$LEGACY_ADMIN_USER" "$hint" "$container_hint" "$LEGACY_USER" z_user postgres; do
    [[ -n "$candidate" ]] || continue
    is_super="$(compose exec -T -u postgres "$POSTGRES_SERVICE" psql -X -U "$candidate" -d postgres \
      -tAc 'SELECT rolsuper FROM pg_roles WHERE rolname = current_user' 2>/dev/null || true)"
    if [[ "$is_super" == 't' ]]; then
      printf '%s' "$candidate"
      return 0
    fi
  done
  return 1
}

verify_database() {
  require_tools
  local db_admin_role database_found
  db_admin_role="$(find_database_admin_role)" \
    || fail 'no known PostgreSQL superuser can verify the existing volume; set POSTGRES_LEGACY_ADMIN_USER to its original owner role'
  log 'Verifying the administrator connection and target database...'
  database_found="$(compose exec -T -u postgres -e Z_DB_NAME="$DB_NAME" "$POSTGRES_SERVICE" \
    psql -X -v ON_ERROR_STOP=1 -U "$db_admin_role" -d postgres -tA <<'SQL'
\getenv db_name Z_DB_NAME
SELECT 1 FROM pg_database WHERE datname = :'db_name';
SQL
  )"
  [[ "$database_found" == '1' ]] || fail "administrator cannot verify database '$DB_NAME'"
}

repair_database_permissions() {
  COMPOSE_FILE="$COMPOSE_FILE" POSTGRES_SERVICE="$POSTGRES_SERVICE" \
    ADMIN_ROLE_HINT_FILE="$SCRIPT_DIR/.postgres-admin-role" \
    DB_WAIT_TIMEOUT_SECONDS="$DB_WAIT_TIMEOUT_SECONDS" BACKEND_DATABASE_URL="$DATABASE_URL" \
    "$ROOT_DIR/scripts/fix-postgres-permissions.sh" "$ENV_FILE"
}

run_migrations() {
  require_tools
  log 'Running Prisma migrations once (restart disabled)...'
  if ! compose run --rm --no-deps "$MIGRATE_SERVICE"; then
    log 'Prisma migration failed; the backend will remain stopped.' >&2
    return 1
  fi
  log 'Prisma migrations completed successfully.'
}

start_backend() {
  require_tools
  log 'Starting the backend after successful migrations...'
  compose up -d --force-recreate --no-deps "$BACKEND_SERVICE"
}

wait_backend() {
  require_tools
  local deadline=$((SECONDS + BACKEND_WAIT_TIMEOUT_SECONDS)) state health
  log 'Waiting for the backend healthcheck...'
  while (( SECONDS < deadline )); do
    state="$(compose ps --format json "$BACKEND_SERVICE" 2>/dev/null | grep -o '"State":"[^"]*"' | head -n1 || true)"
    health="$(compose ps --format json "$BACKEND_SERVICE" 2>/dev/null | grep -o '"Health":"[^"]*"' | head -n1 || true)"
    [[ "$state" == '"State":"running"' && "$health" == '"Health":"healthy"' ]] && { log 'Backend is healthy.'; return 0; }
    [[ "$state" == '"State":"exited"' || "$state" == '"State":"dead"' || "$state" == '"State":"restarting"' ]] && break
    sleep 3
  done
  compose ps >&2 || true
  compose logs --tail=120 "$BACKEND_SERVICE" >&2 || true
  fail "backend did not become healthy after ${BACKEND_WAIT_TIMEOUT_SECONDS}s"
}

show_status() {
  require_tools
  compose ps
  compose logs --tail=30 "$BACKEND_SERVICE"
}

diagnose() {
  require_tools
  local db_admin_role
  validate_database_url
  log 'Container and health status:'
  compose ps "$POSTGRES_SERVICE" || true
  db_admin_role="$(find_database_admin_role)" \
    || fail 'no known PostgreSQL superuser can run diagnostics; set POSTGRES_LEGACY_ADMIN_USER to its original owner role'
  if ! compose exec -T -u postgres -e Z_APP_USER="$APP_USER" "$POSTGRES_SERVICE" \
    psql -X -v ON_ERROR_STOP=1 -U "$db_admin_role" -d "$DB_NAME" <<'SQL'
\getenv app_user Z_APP_USER
SELECT current_user AS connected_user, current_database() AS active_database;
SELECT datname AS database, pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname = current_database();
SELECT schema_name, schema_owner FROM information_schema.schemata WHERE schema_name = 'public';
SELECT tablename, tableowner FROM pg_tables WHERE schemaname = 'public' AND tablename = '_prisma_migrations';
SELECT rolname, rolsuper, rolcanlogin FROM pg_roles WHERE rolname IN (current_user, :'app_user') ORDER BY rolname;
SELECT pg_get_userbyid(c.relowner) AS owner, count(*) AS table_count
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r','p') GROUP BY c.relowner ORDER BY owner;
SELECT schemaname, sequencename, sequenceowner FROM pg_sequences WHERE schemaname = 'public' ORDER BY sequencename;
SELECT CASE WHEN to_regrole(:'app_user') IS NULL THEN false
            ELSE has_database_privilege(:'app_user', current_database(), 'CONNECT,CREATE,TEMP') END
         AS app_database_privileges,
       CASE WHEN to_regrole(:'app_user') IS NULL THEN false
            ELSE has_schema_privilege(:'app_user', 'public', 'USAGE,CREATE') END
         AS app_schema_privileges,
       CASE WHEN to_regrole(:'app_user') IS NULL THEN false
            ELSE COALESCE((SELECT bool_and(has_table_privilege(:'app_user', format('%I.%I', schemaname, tablename), 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
                           FROM pg_tables WHERE schemaname = 'public'), true) END
         AS app_all_table_privileges;
SQL
  then
    fail 'database diagnostics could not connect with the configured administrator'
  fi
  log 'Prisma migration status:'
  compose run --rm --no-deps "$MIGRATE_SERVICE" npx prisma migrate status || true
}

deploy_all() {
  validate_env
  build_backend
  start_postgres
  wait_postgres
  verify_database
  repair_database_permissions
  run_migrations
  start_backend
  wait_backend
  show_status
}

prepare_database_url
prepare_backend_env

case "$ACTION" in
  validate-env) validate_env ;;
  build-backend) build_backend ;;
  start-postgres) start_postgres ;;
  wait-postgres) wait_postgres ;;
  verify-database) verify_database ;;
  repair-database-permissions) repair_database_permissions ;;
  run-migrations) run_migrations ;;
  start-backend) start_backend ;;
  wait-backend) wait_backend ;;
  show-status) show_status ;;
  diagnose) diagnose ;;
  deploy) deploy_all ;;
  *) fail "unknown action '$ACTION'" ;;
esac
