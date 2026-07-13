#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ENV_FILE="${Z_PROD_ENV_FILE:-$SCRIPT_DIR/.env}"
if [[ ! -f "$ENV_FILE" && -f "$SCRIPT_DIR/.env.prod" ]]; then ENV_FILE="$SCRIPT_DIR/.env.prod"; fi
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.prod.yml"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing deploy/.env. Configure it before stopping the stack."
  exit 1
fi

BACKEND_ENV_FILE="$ENV_FILE" docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" stop
echo "Z backend stopped. PostgreSQL data preserved."
