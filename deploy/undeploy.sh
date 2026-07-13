#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ENV_FILE="${Z_PROD_ENV_FILE:-$SCRIPT_DIR/.env}"
if [[ ! -f "$ENV_FILE" && -f "$SCRIPT_DIR/.env.prod" ]]; then ENV_FILE="$SCRIPT_DIR/.env.prod"; fi
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.prod.yml"
RUNTIME_ENV_FILE="$SCRIPT_DIR/.runtime.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing deploy/.env. Nothing to undeploy with this compose environment."
  exit 1
fi

echo "This can remove Z Docker containers. Database data is preserved by default."
read -r -p "Remove containers only? [y/N] " remove_containers

if [[ ! "$remove_containers" =~ ^[Yy]$ ]]; then
  echo "Undeploy cancelled."
  exit 0
fi

read -r -p "Also delete database volume? Type DELETE to confirm: " delete_volume

if [[ "$delete_volume" == "DELETE" ]]; then
  env_args=(--env-file "$ENV_FILE")
  [[ -f "$RUNTIME_ENV_FILE" ]] && env_args+=(--env-file "$RUNTIME_ENV_FILE")
  BACKEND_ENV_FILE="$ENV_FILE" BACKEND_DATABASE_URL="${BACKEND_DATABASE_URL:-postgresql://placeholder:placeholder@z_postgres:5432/placeholder}" docker compose "${env_args[@]}" -f "$COMPOSE_FILE" down -v
  echo "Z containers removed and PostgreSQL volume deleted."
else
  env_args=(--env-file "$ENV_FILE")
  [[ -f "$RUNTIME_ENV_FILE" ]] && env_args+=(--env-file "$RUNTIME_ENV_FILE")
  BACKEND_ENV_FILE="$ENV_FILE" BACKEND_DATABASE_URL="${BACKEND_DATABASE_URL:-postgresql://placeholder:placeholder@z_postgres:5432/placeholder}" docker compose "${env_args[@]}" -f "$COMPOSE_FILE" down
  echo "Z containers removed. PostgreSQL data preserved."
fi
