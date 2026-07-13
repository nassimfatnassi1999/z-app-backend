#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ENV_FILE="${Z_PROD_ENV_FILE:-$SCRIPT_DIR/.env}"
if [[ ! -f "$ENV_FILE" && -f "$SCRIPT_DIR/.env.prod" ]]; then ENV_FILE="$SCRIPT_DIR/.env.prod"; fi
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.prod.yml"
RUNTIME_ENV_FILE="$SCRIPT_DIR/.runtime.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing deploy/.env. Configure it before stopping the stack."
  exit 1
fi

env_args=(--env-file "$ENV_FILE")
[[ -f "$RUNTIME_ENV_FILE" ]] && env_args+=(--env-file "$RUNTIME_ENV_FILE")
BACKEND_ENV_FILE="$ENV_FILE" BACKEND_DATABASE_URL="${BACKEND_DATABASE_URL:-postgresql://placeholder:placeholder@z_postgres:5432/placeholder}" docker compose "${env_args[@]}" -f "$COMPOSE_FILE" stop
echo "Z backend stopped. PostgreSQL data preserved."
