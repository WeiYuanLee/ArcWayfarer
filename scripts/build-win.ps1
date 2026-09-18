# Builds a Windows .exe installer using PyInstaller and electron-builder.
# Usage: powershell scripts/build-win.ps1

$ErrorActionPreference = "Stop"

# Some managed development environments set PIP_NO_INDEX=1 globally. A clean
# build venv has no packages yet, so it must be allowed to resolve the project's
# pinned requirements from the configured package index.
Remove-Item Env:PIP_NO_INDEX -ErrorAction SilentlyContinue

& python -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 13) else 1)"
if ($LASTEXITCODE -ne 0) {
    throw "Python 3.13 or newer is required for iOS 18.2+ TCP tunneling. Install Python 3.13 and ensure 'python' resolves to it before building."
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Resolve-Path "$ScriptDir\.."

Write-Host "==> Building backend for Windows"
Push-Location "$RootDir\backend"
try {
    if (Test-Path ".venv-build") {
        Remove-Item -Recurse -Force ".venv-build" -ErrorAction SilentlyContinue
    }
    python -m venv .venv-build
    
    $VenvPy = ".\.venv-build\Scripts\python.exe"

    & $VenvPy -m pip install -q -r requirements.txt pyinstaller
    & $VenvPy -m PyInstaller arcwayfarer-backend.spec --noconfirm --distpath ..\dist-py --workpath ..\build-py\backend
} finally {
    Pop-Location
}

Write-Host "==> Building frontend"
Push-Location "$RootDir\frontend"
try {
    npm ci
    npm run build
} finally {
    Pop-Location
}

Write-Host "==> Packaging Windows installer (.exe)"
Push-Location "$RootDir\frontend"
try {
    $env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
    npx electron-builder --win --x64
} finally {
    Pop-Location
}

Write-Host "==> Done. Output in frontend/release/"
