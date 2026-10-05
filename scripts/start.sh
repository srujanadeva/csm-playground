#!/usr/bin/env bash
# Starts MongoDB (if not already running), then the Vite web app + Express API.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"
source "$PROJECT_DIR/scripts/mongo.sh"

echo "==> Checking MongoDB (127.0.0.1:27017)..."
if ! start_mongo; then
  echo "ERROR: MongoDB isn't running (reason above). Run 'npm run setup' if it isn't installed yet." >&2
  exit 1
fi

echo "==> Starting web (https://localhost:3001) + api (https://localhost:4001)..."
exec npm run dev
