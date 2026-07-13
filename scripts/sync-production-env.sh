#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_FILE="${1:-$ROOT_DIR/.env}"
TARGET_FILE="${2:-$ROOT_DIR/deploy/.env.prod}"

[[ -f "$SOURCE_FILE" ]] || exit 0
[[ -f "$TARGET_FILE" ]] || exit 0

added=0
while IFS= read -r name || [[ -n "$name" ]]; do
  [[ -z "$name" || "$name" == \#* ]] && continue
  grep -qE "^${name}=" "$TARGET_FILE" && continue
  line="$(grep -E "^${name}=" "$SOURCE_FILE" | tail -n 1 || true)"
  [[ -z "$line" ]] && continue
  printf '\n%s\n' "$line" >> "$TARGET_FILE"
  added=$((added + 1))
done < <(sed -nE 's/^([A-Z][A-Z0-9_]*)=.*/\1/p' "$SOURCE_FILE" | sort -u)

if ((added)); then
  echo "✓ Added ${added} newly-required variable(s) to deploy/.env.prod from the configured root .env"
else
  echo "✓ Production environment already synchronized"
fi
