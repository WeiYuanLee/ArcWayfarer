# Builds a Windows .exe installer using PyInstaller and electron-builder.
# Usage: powershell scripts/build-win.ps1

$ErrorActionPreference = "Stop"

# Some managed development environments set PIP_NO_INDEX=1 globally. A clean
# build venv has no packages yet, so it must be allowed to resolve the project's
# pinned requirements from the configured package index.
Remove-Item Env:PIP_NO_INDEX -ErrorAction SilentlyContinue

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
