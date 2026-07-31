#!/usr/bin/env bash
set -euo pipefail

for PORT in 8787 5173; do
  PID=$(lsof -ti tcp:"$PORT" || true)
  if [ -n "$PID" ]; then
    echo "Killing process on port $PORT (pid $PID)"
    kill "$PID"
  fi
done
