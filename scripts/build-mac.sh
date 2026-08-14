#!/usr/bin/env bash
set -euo pipefail

# Builds a macOS .dmg for a single architecture.
# Usage: scripts/build-mac.sh --arch arm64|x64

ARCH=""
while [ $# -gt 0 ]; do
  case "$1" in
    --arch)
      ARCH="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [ "$ARCH" != "arm64" ] && [ "$ARCH" != "x64" ]; then
  echo "Usage: $0 --arch arm64|x64" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="${PYTHON_BIN:-python3.13}"

if ! "$PYTHON_BIN" -c 'import sys; raise SystemExit(sys.version_info < (3, 13))'; then
  echo "Python 3.13 or newer is required for iOS 18.2+ TCP tunneling. Install Python 3.13, then rerun this script." >&2
  exit 1
fi

echo "==> Building backend (arch: $ARCH)"
(
  cd "$ROOT_DIR/backend"
  # iOS 18.2+ tunneling requires Python 3.13 for TCP. Use a versioned venv so
  # an older local build environment cannot silently be reused.
  "$PYTHON_BIN" -m venv ".venv-build-$ARCH-py313"
  source ".venv-build-$ARCH-py313/bin/activate"
  pip install -q --upgrade pip
  pip install -q -r requirements.txt pyinstaller
  # Keep a separate cache per architecture. Reusing a previous arm64/x64
  # analysis can retain incompatible native extensions in a local rebuild.
  pyinstaller arcwayfarer-backend.spec --noconfirm --distpath ../dist-py --workpath "../build-py/backend-$ARCH"
)

BACKEND_EXE="$ROOT_DIR/dist-py/arcwayfarer-backend/arcwayfarer-backend"
EXPECTED_BACKEND_ARCH="$([ "$ARCH" = "x64" ] && echo "x86_64" || echo "arm64")"
if [ ! -x "$BACKEND_EXE" ] || ! lipo -archs "$BACKEND_EXE" | tr ' ' '\n' | grep -qx "$EXPECTED_BACKEND_ARCH"; then
  echo "Backend architecture does not match requested $ARCH build: $BACKEND_EXE" >&2
  lipo -archs "$BACKEND_EXE" 2>/dev/null || true
  exit 1
fi

if [ "${ARCWAYFARER_VERIFY_BACKEND:-0}" = "1" ]; then
  echo "==> Verifying packaged backend startup (CI)"
  BACKEND_LOG="$(mktemp -t arcwayfarer-backend.XXXXXX.log)"
  BACKEND_TEST_PORT=18787
  ARCWAYFARER_API_PORT="$BACKEND_TEST_PORT" "$BACKEND_EXE" >"$BACKEND_LOG" 2>&1 &
  BACKEND_PID=$!
  cleanup_backend() {
    kill "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
  }
  trap cleanup_backend EXIT
  for _ in {1..30}; do
    if curl --fail --silent "http://127.0.0.1:$BACKEND_TEST_PORT/health" >/dev/null; then
      break
    fi
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
      cat "$BACKEND_LOG" >&2
      exit 1
    fi
    sleep 1
  done
  if ! curl --fail --silent "http://127.0.0.1:$BACKEND_TEST_PORT/health" >/dev/null; then
    echo "Packaged backend did not become healthy within 30 seconds." >&2
    cat "$BACKEND_LOG" >&2
    exit 1
  fi
  cleanup_backend
  trap - EXIT
  rm -f "$BACKEND_LOG"
fi

echo "==> Building frontend"
(
  cd "$ROOT_DIR/frontend"
  npm ci
  npm run build
)

echo "==> Packaging app (arch: $ARCH)"
(
  cd "$ROOT_DIR/frontend"
  # Produce the app first.  The bundled PyInstaller executable is a nested
  # macOS executable and must be signed before it is copied into the DMG.
  CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --"$ARCH" --dir
)

APP_BUNDLE="$ROOT_DIR/frontend/release/mac$([ "$ARCH" = "arm64" ] && echo "-arm64" || echo "")/ArcWayfarer.app"
if [ -d "$APP_BUNDLE" ]; then
  echo "==> Ad-hoc signing bundled executables"
  # A distribution identity/notarization can replace this later.  Ad-hoc
  # signing still gives macOS a consistent code signature for Electron and
  # the embedded PyInstaller backend after a user allows the unsigned app.
  codesign --force --deep --sign - "$APP_BUNDLE"

  echo "==> Creating .dmg"
  VERSION="$(node -p "require('$ROOT_DIR/frontend/package.json').version")"
  DMG_PATH="$ROOT_DIR/frontend/release/ArcWayfarer-$VERSION-$ARCH.dmg"
  rm -f "$DMG_PATH"
  hdiutil create -volname "ArcWayfarer" -srcfolder "$APP_BUNDLE" -ov -format UDZO "$DMG_PATH"
else
  echo "Packaged app was not created: $APP_BUNDLE" >&2
  exit 1
fi

echo "==> Done. Output in frontend/release/"
