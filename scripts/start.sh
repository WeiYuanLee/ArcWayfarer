#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Starting ArcWayfarer backend..."
(
  cd "$ROOT_DIR/backend"
  if [ ! -d venv ]; then
    python3 -m venv venv
  fi
  source venv/bin/activate
  pip install -q -r requirements.txt
  python main.py
) &
BACKEND_PID=$!

echo "Starting ArcWayfarer frontend..."
(
  cd "$ROOT_DIR/frontend"
  if [ ! -d node_modules ]; then
    npm install
  fi
  npm run dev
) &
FRONTEND_PID=$!

trap 'kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null' EXIT

wait
