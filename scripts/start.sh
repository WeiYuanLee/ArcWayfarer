#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="${PYTHON_BIN:-python3.13}"
VENV_DIR="venv-py313"

if ! "$PYTHON_BIN" -c 'import sys; raise SystemExit(sys.version_info < (3, 13))'; then
  echo "Python 3.13 or newer is required for iOS 18.2+ TCP tunneling." >&2
  exit 1
fi

# Prepare backend virtual environment
echo "Checking backend virtual environment..."
cd "$ROOT_DIR/backend"
if [ ! -d "$VENV_DIR" ]; then
  echo "Creating $VENV_DIR..."
  "$PYTHON_BIN" -m venv "$VENV_DIR"
fi
source "$VENV_DIR/bin/activate"
pip install -q -r requirements.txt
echo "Using pymobiledevice3 $(python -c 'from importlib.metadata import version; print(version("pymobiledevice3"))')"

# Check and start pymobiledevice3 remote tunneld (iOS 17+ support)
TUNNELD_PID=""
if pgrep -f "pymobiledevice3 remote tunneld" >/dev/null 2>&1; then
  echo "pymobiledevice3 remote tunneld is already running."
else
  echo "Starting pymobiledevice3 remote tunneld (requires sudo access)..."
  sudo -v
  sudo "$ROOT_DIR/backend/$VENV_DIR/bin/python" -m pymobiledevice3 remote tunneld &
  TUNNELD_PID=$!
  echo "tunneld started with PID $TUNNELD_PID."
fi

echo "Starting ArcWayfarer backend..."
(
  cd "$ROOT_DIR/backend"
  source "$VENV_DIR/bin/activate"
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

trap '
  echo "Stopping services..."
  if [ -n "$TUNNELD_PID" ]; then
    sudo kill "$TUNNELD_PID" 2>/dev/null || true
  fi
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
' EXIT

wait
