# ArcWayfarer

iOS GPS location simulator for macOS (Intel + Apple Silicon) and Windows. Independent project.

## Planned modes

- Teleport
- Navigate (routed walk / run / drive via OSRM / Valhalla / BRouter)
- Route Loop
- Multi-stop
- Random Walk
- Joystick

Teleport and Navigate are implemented end to end (device detection, point selection on the map, set/clear location, routed playback via FOSSGIS OSRM). The remaining modes are still UI placeholders.

## Requirements

- macOS (Intel or Apple Silicon) or Windows 10/11 (64-bit)
- Python 3.11+
- Node.js 18+ and npm
- **Windows Users**: iTunes (or Apple Mobile Device Support driver) installed so Windows can communicate with iOS devices over USB.

## Using Teleport / Navigate with a real iPhone

Each device gets one persistent location-simulation connection, shared by every mode — switching between Teleport and Navigate on the same device just hands control to whichever one you're using, with no reconnect delay. Starting Navigate on a device automatically stops any Teleport/Navigate already running on it, and vice versa.

- **iOS below 17**: connect the iPhone over USB and trust the computer. It should appear in the device dropdown automatically — no extra setup needed.

- **iOS 17 and later**: location simulation on iOS 17+ requires a RemoteXPC tunnel. ArcWayfarer starts `pymobiledevice3 remote tunneld` before its backend automatically.
  
  - **On Windows**: The installed application requests Administrator privileges (`UAC elevation`) at launch.
  - **On macOS**: The app presents the standard administrator-authorization dialog when the tunnel service is started.

- **First use per device**: setting a location for the first time triggers an automatic download and mount of the Developer Disk Image needed for developer services. This can take anywhere from tens of seconds to a few minutes depending on your connection.

## Development

Backend (from `backend/`):

```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: .\venv\Scripts\activate
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

PyInstaller does **not** cross-compile, so each target OS/architecture is built on its native platform.

### Automated: GitHub Actions (recommended)

Push a version tag and CI builds macOS (`arm64` and `x64`) and Windows (`x64`) installers, uploading all three artifacts to a GitHub Release automatically:

```bash
git tag v1.0.0
git push origin v1.0.0
```

`.github/workflows/release.yml` runs three matrix jobs — `macos-14` (Apple Silicon), `macos-13` (Intel), and `windows-latest` (Windows) — and attaches both `.dmg` files and the `.exe` installer to a GitHub Release for that tag.

### Manual local build

- **On macOS**:
  ```bash
  scripts/build-mac.sh --arch arm64   # or: --arch x64
  ```

- **On Windows**:
  ```powershell
  powershell scripts/build-win.ps1
  ```

This freezes the backend with PyInstaller (`backend/arcwayfarer-backend.spec`), builds the frontend, and packages the installer with `electron-builder`. Output lands in `frontend/release/`.

### Distributing an unsigned build

- **macOS**: When a user downloads and opens the `.dmg`/`.app`, macOS Gatekeeper will block it with "cannot be opened because the developer cannot be verified." Right-click the app → **Open** → confirm **Open**.
- **Windows**: Windows SmartScreen may show an "Unknown Publisher" warning on first launch of unsigned installers. Click **More info** → **Run anyway**.

## License

MIT — see [LICENSE](LICENSE).
