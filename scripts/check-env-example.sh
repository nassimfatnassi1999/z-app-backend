#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_FILE="${1:-$ROOT_DIR/.env}"
EXAMPLE_FILE="${2:-$ROOT_DIR/.env.example}"

[[ -f "$SOURCE_FILE" ]] || { echo "❌ Environment file not found: $SOURCE_FILE" >&2; exit 1; }
[[ -f "$EXAMPLE_FILE" ]] || { echo "❌ Example file not found: $EXAMPLE_FILE" >&2; exit 1; }

missing=()
while IFS= read -r name; do
  grep -qE "^${name}=" "$EXAMPLE_FILE" || missing+=("$name")
done < <(sed -nE 's/^([A-Z][A-Z0-9_]*)=.*/\1/p' "$SOURCE_FILE" | sort -u)

missing_from_env=()
while IFS= read -r name; do
  grep -qE "^${name}=" "$SOURCE_FILE" || missing_from_env+=("$name")
done < <(sed -nE 's/^([A-Z][A-Z0-9_]*)=.*/\1/p' "$EXAMPLE_FILE" | sort -u)

if ((${#missing[@]})); then
  echo "❌ .env.example is missing variable(s):" >&2
  printf '  %s\n' "${missing[@]}" >&2
  echo "Add documented, non-secret placeholders before deploying." >&2
  exit 1
fi

if ((${#missing_from_env[@]})); then
  echo "❌ Configured environment is missing variable(s) declared in the example:" >&2
  printf '  %s\n' "${missing_from_env[@]}" >&2
  echo "Add their real deployment values before continuing." >&2
  exit 1
fi

echo "✓ Environment example synchronized"
