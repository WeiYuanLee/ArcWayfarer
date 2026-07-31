# ArcWayfarer

iOS GPS location simulator for macOS (Intel + Apple Silicon). Independent project.

## Planned modes

- Teleport
- Navigate (routed walk / run / drive via OSRM / Valhalla / BRouter)
- Route Loop
- Multi-stop
- Random Walk
- Joystick

Teleport and Navigate are implemented end to end (device detection, point selection on the map, set/clear location, routed playback via FOSSGIS OSRM). The remaining modes are still UI placeholders.

## Requirements

- macOS (Intel or Apple Silicon)
- Python 3.11+
- Node.js 18+ and npm

## Using Teleport / Navigate with a real iPhone

Each device gets one persistent location-simulation connection, shared by every mode — switching between Teleport and Navigate on the same device just hands control to whichever one you're using, with no reconnect delay. Starting Navigate on a device automatically stops any Teleport/Navigate already running on it, and vice versa.

- **iOS below 17**: connect the iPhone over USB and trust the computer. It should appear in the device dropdown automatically — no extra setup needed.

- **iOS 17 and later**: location simulation on iOS 17+ requires a RemoteXPC tunnel, which `pymobiledevice3` can only create from a privileged background process. Before the device will show up as usable, start this once in a separate terminal and leave it running:
  
  ```bash
  sudo python3 -m pymobiledevice3 remote tunneld
  ```
  
  Without it, the device will still be listed but marked `tunnel_required`. This is a limitation of `pymobiledevice3`'s architecture, not something ArcWayfarer can work around without also requesting elevated privileges itself (a decision deliberately deferred — see the project plan for reasoning).

- **First use per device**: setting a location for the first time triggers an automatic download and mount of the Developer Disk Image needed for developer services. This can take anywhere from tens of seconds to a few minutes depending on your connection.

## Development

Backend (from `backend/`):

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py       # serves on http://127.0.0.1:8787, health check at /health
```

Frontend (from `frontend/`):

```bash
npm install
npm run dev           # Vite dev server on :5173
npm start             # Vite + Electron together
```

Or start everything at once from the repo root:

```bash
./scripts/start.sh
./scripts/stop.sh
```

## Building for distribution

PyInstaller does **not** cross-compile, so the backend is built separately per chip architecture (arm64 for Apple Silicon, x64 for Intel) and each architecture gets its own `.dmg` — no `lipo`-merged universal binary.

### Automated: GitHub Actions (recommended)

Push a version tag and CI builds both architectures and publishes a GitHub Release automatically:

```bash
git tag v1.0.0
git push origin v1.0.0
```

`.github/workflows/release.yml` runs two matrix jobs — `macos-14` (Apple Silicon) and `macos-13` (Intel) — each running `scripts/build-mac.sh --arch <arch>`, then attaches both `.dmg` files to a GitHub Release for that tag.

### Manual local build

On a Mac matching the architecture you want to build for:

```bash
scripts/build-mac.sh --arch arm64   # or: --arch x64
```

This freezes the backend with PyInstaller (`backend/arcwayfarer-backend.spec`), builds the frontend, and runs `electron-builder --mac` for that architecture. Output lands in `frontend/release/*.dmg`. To get both `.dmg` files from one machine, you'd need a second Python install for the other architecture (e.g. an x64 Python via Rosetta on Apple Silicon) — the GitHub Actions route above avoids this entirely by building each architecture on its native runner.

### Distributing an unsigned build

This project is not currently signed with an Apple Developer certificate (`mac.identity` is `null` in `package.json`, and CI builds with `CSC_IDENTITY_AUTO_DISCOVERY=false`). When a user downloads and opens the `.dmg`/`.app`, macOS Gatekeeper will block it with "cannot be opened because the developer cannot be verified." To run it anyway:

1. Right-click (or Control-click) the app → **Open** → confirm **Open** in the dialog that appears.
2. Or: **System Settings → Privacy & Security**, scroll down, and click **Open Anyway** next to the blocked app notice.

This only needs to be done once per downloaded copy. If code signing / notarization is added later, this step will no longer be necessary.

## License

MIT — see [LICENSE](LICENSE).
