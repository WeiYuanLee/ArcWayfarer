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

echo "==> Building backend (arch: $ARCH)"
(
  cd "$ROOT_DIR/backend"
  python3 -m venv .venv-build
  source .venv-build/bin/activate
  pip install -q --upgrade pip
  pip install -q -r requirements.txt pyinstaller
  pyinstaller arcwayfarer-backend.spec --noconfirm --distpath ../dist-py --workpath ../build-py/backend
)

echo "==> Building frontend"
(
  cd "$ROOT_DIR/frontend"
  npm ci
  npm run build
)

echo "==> Packaging .dmg (arch: $ARCH)"
# Disable Spotlight indexing to prevent hdiutil "Resource busy" on GitHub runners
sudo mdutil -a -i off 2>/dev/null || true
(
  cd "$ROOT_DIR/frontend"
  CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --"$ARCH"
)

echo "==> Removing quarantine attributes from app bundle"
# Prevents macOS Gatekeeper from blocking the backend binary on first launch
APP_BUNDLE="$ROOT_DIR/frontend/release/mac$([ "$ARCH" = "arm64" ] && echo "-arm64" || echo "")/ArcWayfarer.app"
if [ -d "$APP_BUNDLE" ]; then
  xattr -cr "$APP_BUNDLE" || true
fi

echo "==> Done. Output in frontend/release/"
