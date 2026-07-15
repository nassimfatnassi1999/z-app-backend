#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_NAME="$(basename "$0")"
ENV_FILE="${1:-}"
COMPOSE_FILE="${COMPOSE_FILE:-}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-z_postgres}"
DB_WAIT_TIMEOUT_SECONDS="${DB_WAIT_TIMEOUT_SECONDS:-120}"
ADMIN_ROLE_HINT_FILE="${ADMIN_ROLE_HINT_FILE:-}"

log() { printf '[%s] %s\n' "$SCRIPT_NAME" "$*"; }
fail() { printf '[%s] ERROR: %s\n' "$SCRIPT_NAME" "$*" >&2; exit 1; }
on_error() { local code=$?; printf '[%s] ERROR: failed at line %s (exit %s). No data was deleted.\n' "$SCRIPT_NAME" "$1" "$code" >&2; exit "$code"; }
trap 'on_error $LINENO' ERR

[[ -n "$ENV_FILE" && -f "$ENV_FILE" ]] || fail 'usage: fix-postgres-permissions.sh /path/to/production.env'
[[ -n "$COMPOSE_FILE" && -f "$COMPOSE_FILE" ]] || fail 'COMPOSE_FILE must reference docker-compose.prod.yml'
command -v docker >/dev/null 2>&1 || fail 'docker is not available'
docker compose version >/dev/null 2>&1 || fail 'Docker Compose v2 is not available'

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

[[ -n "$DB_NAME" ]] || fail 'POSTGRES_DB is required'
[[ -n "$ADMIN_USER" && -n "$ADMIN_PASSWORD" ]] || fail 'administrator credentials are required'
[[ -n "$APP_USER" && -n "$APP_PASSWORD" ]] || fail 'application credentials are required'
[[ "$ADMIN_USER" != "$APP_USER" || "$ADMIN_PASSWORD" == "$APP_PASSWORD" ]] \
  || fail 'the same PostgreSQL role cannot have two different configured passwords'
[[ "$DB_WAIT_TIMEOUT_SECONDS" =~ ^[0-9]+$ ]] || fail 'DB_WAIT_TIMEOUT_SECONDS must be an integer'

compose() {
  POSTGRES_ADMIN_USER="$ADMIN_USER" POSTGRES_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  BACKEND_ENV_FILE="$ENV_FILE" BACKEND_DATABASE_URL="${BACKEND_DATABASE_URL:-unused}" \
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

deadline=$((SECONDS + DB_WAIT_TIMEOUT_SECONDS))
until compose exec -T "$POSTGRES_SERVICE" pg_isready -U "$ADMIN_USER" -d "$DB_NAME" >/dev/null 2>&1; do
  (( SECONDS < deadline )) || fail "PostgreSQL was not ready after ${DB_WAIT_TIMEOUT_SECONDS}s"
  sleep 2
done

# The official image does not update roles, passwords, databases, or ownership
# when POSTGRES_* changes after a volume has already been initialized. A local
# socket connection inside the trusted PostgreSQL container lets the configured
# administrator reconcile that persistent state without exposing its password.
admin_role_hint=''
[[ -z "$ADMIN_ROLE_HINT_FILE" || ! -f "$ADMIN_ROLE_HINT_FILE" ]] \
  || admin_role_hint="$(head -n1 "$ADMIN_ROLE_HINT_FILE")"
db_admin_role=''
for candidate in "$ADMIN_USER" "$LEGACY_ADMIN_USER" "$admin_role_hint" "$LEGACY_USER" z_user postgres; do
  [[ -n "$candidate" ]] || continue
  is_super="$(compose exec -T -u postgres "$POSTGRES_SERVICE" \
    psql -X -U "$candidate" -d postgres -tAc \
    "SELECT rolsuper FROM pg_roles WHERE rolname = current_user" 2>/dev/null || true)"
  if [[ "$is_super" == 't' ]]; then
    db_admin_role="$candidate"
    break
  fi
done
[[ -n "$db_admin_role" ]] \
  || fail 'no known PostgreSQL superuser can connect; set POSTGRES_LEGACY_ADMIN_USER to the role that initialized the volume'
admin_psql=(compose exec -T -u postgres "$POSTGRES_SERVICE" psql -X -v ON_ERROR_STOP=1 -U "$db_admin_role")

db_exists="$("${admin_psql[@]}" -d postgres -v db_name="$DB_NAME" -tAc \
  "SELECT 1 FROM pg_database WHERE datname = :'db_name'" || true)"
[[ "$db_exists" == '1' ]] || fail "target database '$DB_NAME' does not exist"

log 'Inspecting current owners and reconciling the application role...'
compose exec -T -u postgres \
  -e Z_ADMIN_USER="$ADMIN_USER" -e Z_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  -e Z_APP_USER="$APP_USER" -e Z_APP_PASSWORD="$APP_PASSWORD" -e Z_DB_NAME="$DB_NAME" \
  "$POSTGRES_SERVICE" psql -X -v ON_ERROR_STOP=1 -U "$db_admin_role" -d postgres <<'SQL'
\getenv admin_user Z_ADMIN_USER
\getenv admin_password Z_ADMIN_PASSWORD
\getenv app_user Z_APP_USER
\getenv app_password Z_APP_PASSWORD
\getenv db_name Z_DB_NAME

SELECT format('CREATE ROLE %I LOGIN SUPERUSER PASSWORD %L', :'admin_user', :'admin_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'admin_user') \gexec
SELECT format('ALTER ROLE %I LOGIN SUPERUSER PASSWORD %L', :'admin_user', :'admin_password') \gexec

SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'app_user', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user') \gexec
SELECT format('ALTER ROLE %I LOGIN PASSWORD %L', :'app_user', :'app_password') \gexec
SELECT format('ALTER ROLE %I NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION', :'app_user')
WHERE :'app_user' <> :'admin_user' \gexec
SELECT format('ALTER DATABASE %I OWNER TO %I', :'db_name', :'app_user') \gexec
SELECT format('GRANT ALL PRIVILEGES ON DATABASE %I TO %I', :'db_name', :'app_user') \gexec
SQL

log 'Repairing schema, table, sequence, view, materialized-view, and function ownership...'
compose exec -T -u postgres \
  -e Z_APP_USER="$APP_USER" \
  "$POSTGRES_SERVICE" psql -X -v ON_ERROR_STOP=1 -U "$db_admin_role" -d "$DB_NAME" <<'SQL'
\getenv app_user Z_APP_USER
SELECT set_config('z.app_user', :'app_user', false);

SELECT format('ALTER SCHEMA %I OWNER TO %I', 'public', :'app_user') \gexec

DO $repair$
DECLARE obj record;
BEGIN
  FOR obj IN
    SELECT c.oid, n.nspname, c.relname, c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'S', 'v', 'm', 'f')
  LOOP
    EXECUTE format(
      'ALTER %s %I.%I OWNER TO %I',
      CASE obj.relkind
        WHEN 'S' THEN 'SEQUENCE'
        WHEN 'v' THEN 'VIEW'
        WHEN 'm' THEN 'MATERIALIZED VIEW'
        WHEN 'f' THEN 'FOREIGN TABLE'
        ELSE 'TABLE'
      END,
      obj.nspname, obj.relname, current_setting('z.app_user')
    );
  END LOOP;

  FOR obj IN
    SELECT p.oid, n.nspname, p.proname, p.prokind,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    EXECUTE format(
      'ALTER %s %I.%I(%s) OWNER TO %I',
      CASE WHEN obj.prokind = 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END,
      obj.nspname, obj.proname, obj.args, current_setting('z.app_user')
    );
  END LOOP;

  FOR obj IN
    SELECT n.nspname, t.typname
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    LEFT JOIN pg_class c ON c.oid = t.typrelid
    WHERE n.nspname = 'public'
      AND t.typtype IN ('d', 'e', 'r', 'm')
      AND t.typname NOT LIKE '\\_%'
  LOOP
    EXECUTE format(
      'ALTER TYPE %I.%I OWNER TO %I',
      obj.nspname, obj.typname, current_setting('z.app_user')
    );
  END LOOP;
END
$repair$;

SELECT format('GRANT ALL ON SCHEMA public TO %I', :'app_user') \gexec
SELECT format('GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO %I', :'app_user') \gexec
SELECT format('GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO %I', :'app_user') \gexec
SELECT format('GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO %I', :'app_user') \gexec
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO %I', current_user, :'app_user') \gexec
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO %I', current_user, :'app_user') \gexec
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT ALL PRIVILEGES ON FUNCTIONS TO %I', current_user, :'app_user') \gexec
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO %I', :'app_user', :'app_user') \gexec
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO %I', :'app_user', :'app_user') \gexec
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT ALL PRIVILEGES ON FUNCTIONS TO %I', :'app_user', :'app_user') \gexec
SQL

log 'Verifying database/schema ownership and Prisma migration-table access...'
compose exec -T -u postgres -e Z_APP_USER="$APP_USER" \
  "$POSTGRES_SERVICE" psql -X -v ON_ERROR_STOP=1 -U "$db_admin_role" -d "$DB_NAME" <<'SQL'
\getenv app_user Z_APP_USER
SELECT set_config('z.app_user', :'app_user', false);
DO $verify$
DECLARE bad_count bigint;
BEGIN
  IF (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = current_database())
       <> current_setting('z.app_user') THEN
    RAISE EXCEPTION 'database owner was not repaired';
  END IF;
  IF (SELECT schema_owner FROM information_schema.schemata WHERE schema_name = 'public')
       <> current_setting('z.app_user') THEN
    RAISE EXCEPTION 'public schema owner was not repaired';
  END IF;
  SELECT count(*) INTO bad_count
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r','p','S','v','m','f')
    AND pg_get_userbyid(c.relowner) <> current_setting('z.app_user');
  IF bad_count <> 0 THEN
    RAISE EXCEPTION '% public objects still have the wrong owner', bad_count;
  END IF;
  SELECT count(*) INTO bad_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND pg_get_userbyid(p.proowner) <> current_setting('z.app_user');
  IF bad_count <> 0 THEN
    RAISE EXCEPTION '% public routines still have the wrong owner', bad_count;
  END IF;
END
$verify$;

SELECT tablename, tableowner
FROM pg_tables
WHERE schemaname = 'public' AND tablename = '_prisma_migrations';
SQL

# Use TCP and the actual application password, as Prisma does. Passwords never
# appear in output. On databases with migrations, explicitly verify SELECT.
app_check_sql='SELECT 1'
has_migrations="$("${admin_psql[@]}" -d "$DB_NAME" -tAc \
  "SELECT to_regclass('public._prisma_migrations') IS NOT NULL")"
[[ "$has_migrations" == 't' ]] && app_check_sql='SELECT count(*) FROM public."_prisma_migrations"'
compose exec -T -e PGPASSWORD="$APP_PASSWORD" "$POSTGRES_SERVICE" \
  psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -U "$APP_USER" -d "$DB_NAME" -tAc "$app_check_sql" >/dev/null \
  || fail 'application-role verification failed'

log "Permissions repaired for database '$DB_NAME' and application role '$APP_USER'; existing data was preserved."
