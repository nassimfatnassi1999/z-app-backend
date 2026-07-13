#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-$ROOT_DIR/.env}"
REQUIRED_FILE="$ROOT_DIR/scripts/required-env.txt"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ Environment file not found: $ENV_FILE" >&2
  exit 1
fi

missing=()
invalid=()
while IFS= read -r name || [[ -n "$name" ]]; do
  [[ -z "$name" || "$name" == \#* ]] && continue
  line="$(grep -E "^${name}=" "$ENV_FILE" | tail -n 1 || true)"
  value="${line#*=}"
  value="${value%\"}"
  value="${value#\"}"
  if [[ -z "$line" || -z "${value//[[:space:]]/}" ]]; then
    missing+=("$name")
  elif [[ "$value" == change_me* || "$value" == generate_* || "$value" == your_* ]]; then
    invalid+=("$name")
  fi
done < "$REQUIRED_FILE"

if ((${#missing[@]})); then
  echo "❌ Missing required environment variable(s):" >&2
  printf '  %s\n' "${missing[@]}" >&2
  exit 1
fi

if ((${#invalid[@]})); then
  echo "❌ Placeholder value(s) must be replaced:" >&2
  printf '  %s\n' "${invalid[@]}" >&2
  exit 1
fi

if [[ "$(grep -E '^NODE_ENV=' "$ENV_FILE" | tail -n 1 | cut -d= -f2-)" != "production" ]]; then
  echo "❌ NODE_ENV must be production for deployment." >&2
  exit 1
fi

echo "✓ Required environment variables"
