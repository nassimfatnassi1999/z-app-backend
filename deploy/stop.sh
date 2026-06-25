#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ENV_FILE="$SCRIPT_DIR/.env.prod"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.prod.yml"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing deploy/.env.prod. Run deploy/deploy.sh first to create it from the example."
  exit 1
fi

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" stop
echo "Z backend stopped. PostgreSQL data preserved."
