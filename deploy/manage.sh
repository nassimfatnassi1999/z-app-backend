#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ENV_FILE="${Z_PROD_ENV_FILE:-$SCRIPT_DIR/.env}"
if [[ ! -f "$ENV_FILE" && -f "$SCRIPT_DIR/.env.prod" ]]; then ENV_FILE="$SCRIPT_DIR/.env.prod"; fi
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.prod.yml"

compose() {
  BACKEND_ENV_FILE="$ENV_FILE" docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

need_env() {
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "Missing deploy/.env. Configure it before using production commands."
    return 1
  fi
}

while true; do
  echo
  echo "Z Backend Production Manager"
  echo "1. Deploy / update Z backend"
  echo "2. Stop containers"
  echo "3. Restart containers"
  echo "4. Show logs"
  echo "5. Show status"
  echo "6. Run migrations"
  echo "7. Undeploy containers"
  echo "8. Exit"
  read -r -p "Choose an option: " choice

  case "$choice" in
    1)
      "$SCRIPT_DIR/deploy.sh"
      ;;
    2)
      "$SCRIPT_DIR/stop.sh"
      ;;
    3)
      need_env && compose restart
      ;;
    4)
      "$SCRIPT_DIR/monitor.sh" logs
      ;;
    5)
      "$SCRIPT_DIR/monitor.sh" ps
      ;;
    6)
      need_env && compose exec z_backend npx prisma migrate deploy
      ;;
    7)
      "$SCRIPT_DIR/undeploy.sh"
      ;;
    8)
      echo "Goodbye."
      exit 0
      ;;
    *)
      echo "Invalid option."
      ;;
  esac
done
