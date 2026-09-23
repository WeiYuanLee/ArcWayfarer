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

$BackendExe = "$RootDir\dist-py\arcwayfarer-backend\arcwayfarer-backend.exe"
if (-not (Test-Path $BackendExe)) {
    throw "Packaged backend was not created: $BackendExe"
}

if ($env:ARCWAYFARER_VERIFY_BACKEND -eq "1") {
    Write-Host "==> Verifying packaged backend startup"
    $BackendLog = Join-Path $env:TEMP "arcwayfarer-backend-$PID.log"
    $BackendErrorLog = Join-Path $env:TEMP "arcwayfarer-backend-$PID.err.log"
    $BackendPort = 18787
    $PreviousApiPort = $env:ARCWAYFARER_API_PORT
    $env:ARCWAYFARER_API_PORT = "$BackendPort"
    $BackendProcess = $null
    try {
        $BackendProcess = Start-Process -FilePath $BackendExe -PassThru -NoNewWindow `
            -RedirectStandardOutput $BackendLog -RedirectStandardError $BackendErrorLog
        $Healthy = $false
        for ($Attempt = 0; $Attempt -lt 60; $Attempt++) {
            if ($BackendProcess.HasExited) { break }
            try {
                $Response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$BackendPort/health" -TimeoutSec 1
                if ($Response.StatusCode -eq 200) {
                    $Healthy = $true
                    break
                }
            } catch {}
            Start-Sleep -Seconds 1
        }
        if (-not $Healthy) {
            if (Test-Path $BackendLog) { Get-Content $BackendLog -ErrorAction SilentlyContinue }
            if (Test-Path $BackendErrorLog) { Get-Content $BackendErrorLog -ErrorAction SilentlyContinue }
            throw "Packaged backend did not become healthy within 60 seconds."
        }
    } finally {
        if ($BackendProcess -and -not $BackendProcess.HasExited) {
            Stop-Process -Id $BackendProcess.Id -Force -ErrorAction SilentlyContinue
            $BackendProcess.WaitForExit()
        }
        $env:ARCWAYFARER_API_PORT = $PreviousApiPort
        Remove-Item $BackendLog, $BackendErrorLog -Force -ErrorAction SilentlyContinue
    }
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
