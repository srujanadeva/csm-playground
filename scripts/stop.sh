#!/usr/bin/env bash
# Stops the Vite web app and Express API (and the concurrently wrapper), then MongoDB.
set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$PROJECT_DIR/scripts/mongo.sh"

WEB_PORT=3001
API_PORT=4001

echo "==> Stopping dev processes for $PROJECT_DIR ..."

# Match only processes whose command line references this project's path, so we
# never touch an unrelated vite/tsx/concurrently instance on the machine.
PATTERNS=(
  "${PROJECT_DIR}.*concurrently"
  "${PROJECT_DIR}.*vite"
  "${PROJECT_DIR}.*tsx"
)

killed_any=0
for pattern in "${PATTERNS[@]}"; do
  pids=$(pgrep -f "$pattern" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "    Stopping processes matching '$pattern': $pids"
    kill $pids 2>/dev/null || true
    killed_any=1
  fi
done

# The API child that tsx starts may not mention the project path; stop whatever node
# process still listens on our ports, but only if its working directory is in this project.
for port in "$WEB_PORT" "$API_PORT"; do
  for pid in $(lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null); do
    cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')
    if [[ "$cwd" == "$PROJECT_DIR"* ]]; then
      echo "    Stopping PID $pid (listening on port $port)"
      kill "$pid" 2>/dev/null || true
      killed_any=1
    fi
  done
done

if [ "$killed_any" -eq 1 ]; then
  sleep 1
fi

echo "==> Stopping MongoDB..."
echo "    Note: MongoDB is shared with any other local app using it (e.g. test-playground)."
stop_mongo

sleep 1
echo "==> Final status:"
for port in "$WEB_PORT" "$API_PORT" 27017; do
  if nc -z 127.0.0.1 "$port" 2>/dev/null; then
    echo "    Port $port: still in use"
  else
    echo "    Port $port: free"
  fi
done
