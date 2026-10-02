# Captures one privacy-safe checkpoint for the V2 Windows device acceptance
# matrix. It is read-only unless -RunLocationProbe is explicitly supplied.
param(
    [string]$ApiBase = "http://127.0.0.1:8787",
    [string]$Label = "preflight",
    [string]$OutputDirectory = ".\arcwayfarer-v2-report",
    [switch]$RunLocationProbe,
    [string]$ProbeUdid,
    [double]$ProbeLatitude = 25.0330,
    [double]$ProbeLongitude = 121.5654
)

$ErrorActionPreference = "Stop"
$SafeLabel = $Label -replace '[^a-zA-Z0-9._-]', '-'

function Get-ShortFingerprint([string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value)) { return $null }
    $Hasher = [System.Security.Cryptography.SHA256]::Create()
    try {
        $Digest = $Hasher.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($Value))
        return (($Digest[0..5] | ForEach-Object { $_.ToString("x2") }) -join "")
    } finally {
        $Hasher.Dispose()
    }
}

function Invoke-ArcWayfarerGet([string]$Path) {
    try {
        return [ordered]@{
            ok = $true
            value = Invoke-RestMethod -Method Get -Uri "$ApiBase$Path" -TimeoutSec 20
            error = $null
        }
    } catch {
        return [ordered]@{ ok = $false; value = $null; error = $_.Exception.Message }
    }
}

function Invoke-ArcWayfarerPost([string]$Path, $Body) {
    $StartedAt = [DateTime]::UtcNow
    try {
        $Value = Invoke-RestMethod -Method Post -Uri "$ApiBase$Path" -ContentType "application/json" `
            -Body ($Body | ConvertTo-Json -Compress) -TimeoutSec 30
        return [ordered]@{
            ok = $true
            value = $Value
            error = $null
            elapsed_ms = [int]([DateTime]::UtcNow - $StartedAt).TotalMilliseconds
        }
    } catch {
        return [ordered]@{
            ok = $false
            value = $null
            error = $_.Exception.Message
            elapsed_ms = [int]([DateTime]::UtcNow - $StartedAt).TotalMilliseconds
        }
    }
}

function Get-ServiceState([string]$Pattern) {
    return @(Get-Service -ErrorAction SilentlyContinue | Where-Object {
        $_.Name -match $Pattern -or $_.DisplayName -match $Pattern
    } | ForEach-Object {
        [ordered]@{ name = $_.Name; display_name = $_.DisplayName; status = [string]$_.Status }
    })
}

function Protect-Device($Device) {
    return [ordered]@{
        device_id = Get-ShortFingerprint ([string]$Device.udid)
        name_present = -not [string]::IsNullOrWhiteSpace([string]$Device.name)
        ios_version = $Device.ios_version
        transport = $Device.transport
        connection_type = $Device.connection_type
        selected_route = $Device.selected_route
        status = $Device.status
        direct_paired = [bool]$Device.direct_paired
        revision = $Device.revision
    }
}

function Protect-Endpoint($Endpoint) {
    $Address = [string]$Endpoint.ip
    return [ordered]@{
        endpoint_id = Get-ShortFingerprint ([string]$Endpoint.endpoint)
        device_id = Get-ShortFingerprint ([string]$Endpoint.udid)
        address_family = if ($Address.Contains(":")) { "IPv6" } else { "IPv4" }
        has_ipv6_scope = $Address.Contains("%")
        port = $Endpoint.port
        source = $Endpoint.source
        status = $Endpoint.status
        ios_version = $Endpoint.ios_version
    }
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$Health = Invoke-ArcWayfarerGet "/health"
$Snapshot = Invoke-ArcWayfarerGet "/api/devices/snapshot?include_wifi=true"
$Endpoints = Invoke-ArcWayfarerGet "/api/devices/wireless-direct/endpoints"
$Diagnostics = Invoke-ArcWayfarerGet "/api/devices/diagnostics"
$LocationProbe = $null
if ($RunLocationProbe) {
    if ([string]::IsNullOrWhiteSpace($ProbeUdid)) {
        throw "-RunLocationProbe requires -ProbeUdid. Use the UDID shown in Device Manager; it is not written to the report."
    }
    Write-Warning "Location probe will temporarily change this iPhone's simulated location, then request restore."
    $SetResult = Invoke-ArcWayfarerPost "/api/location/set" ([ordered]@{
        udid = $ProbeUdid
        lat = $ProbeLatitude
        lng = $ProbeLongitude
    })
    if ($SetResult.ok) { Start-Sleep -Seconds 2 }
    # Always request restore: a timeout can occur after the device accepted the
    # command, and leaving a possibly simulated location is less safe.
    $ClearResult = Invoke-ArcWayfarerPost "/api/location/clear" ([ordered]@{ udid = $ProbeUdid })
    foreach ($Result in @($SetResult, $ClearResult)) {
        if (-not [string]::IsNullOrWhiteSpace([string]$Result.error)) {
            $Result.error = ([string]$Result.error).Replace($ProbeUdid, "<redacted-device>")
        }
    }
    $LocationProbe = [ordered]@{
        requested = $true
        device_id = Get-ShortFingerprint $ProbeUdid
        coordinates_omitted = $true
        set = $SetResult
        clear = $ClearResult
    }
}
$OperatingSystem = Get-CimInstance Win32_OperatingSystem
$IsAdministrator = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)

$Sources = [ordered]@{}
if ($Snapshot.ok -and $Snapshot.value.sources) {
    foreach ($Property in $Snapshot.value.sources.PSObject.Properties) {
        $Sources[$Property.Name] = [ordered]@{
            status = $Property.Value.status
            detail_present = -not [string]::IsNullOrWhiteSpace([string]$Property.Value.detail)
        }
    }
}

$UsbDiagnostic = $null
$RuntimeDiagnostic = $null
if ($Diagnostics.ok) {
    $RuntimeDiagnostic = $Diagnostics.value.runtime
    if ($Diagnostics.value.usb_discovery) {
        $UsbDiagnostic = [ordered]@{
            code = $Diagnostics.value.usb_discovery.code
            error_type = $Diagnostics.value.usb_discovery.error_type
            occurred_at = $Diagnostics.value.usb_discovery.occurred_at
        }
    }
}

$Commit = $null
try { $Commit = (& git rev-parse --short HEAD 2>$null) } catch {}
$ApiErrors = @($Health.error, $Snapshot.error, $Endpoints.error, $Diagnostics.error) | Where-Object { $_ }
$Report = [ordered]@{
    schema_version = 1
    captured_at_utc = [DateTime]::UtcNow.ToString("o")
    label = $SafeLabel
    commit = $Commit
    api_base = $ApiBase
    windows = [ordered]@{
        caption = $OperatingSystem.Caption
        version = $OperatingSystem.Version
        build_number = $OperatingSystem.BuildNumber
        architecture = $env:PROCESSOR_ARCHITECTURE
        administrator = $IsAdministrator
    }
    services = [ordered]@{
        apple_mobile_device = Get-ServiceState "Apple Mobile Device|AppleMobileDevice"
        bonjour = Get-ServiceState "Bonjour|mDNSResponder"
    }
    api = [ordered]@{
        health_ok = $Health.ok
        snapshot_ok = $Snapshot.ok
        endpoints_ok = $Endpoints.ok
        diagnostics_ok = $Diagnostics.ok
        errors = @($ApiErrors)
    }
    runtime = $RuntimeDiagnostic
    usb_diagnostic = $UsbDiagnostic
    snapshot_revision = if ($Snapshot.ok) { $Snapshot.value.snapshot_revision } else { $null }
    sources = $Sources
    devices = @($(if ($Snapshot.ok) { $Snapshot.value.devices | ForEach-Object { Protect-Device $_ } }))
    endpoints = @($(if ($Endpoints.ok) { $Endpoints.value | ForEach-Object { Protect-Endpoint $_ } }))
    location_probe = $LocationProbe
}

$CapturePath = Join-Path $OutputDirectory "capture-$SafeLabel.json"
$Report | ConvertTo-Json -Depth 12 | Set-Content -Encoding UTF8 $CapturePath

$ChecklistPath = Join-Path $OutputDirectory "acceptance-checklist.md"
if (-not (Test-Path $ChecklistPath)) {
@"
# ArcWayfarer V2 Windows 實機驗收

- Commit: $Commit
- Windows: $($OperatingSystem.Caption) $($OperatingSystem.Version)
- 開始時間（UTC）: $([DateTime]::UtcNow.ToString("o"))

## 單設備與換網

- [ ] USB 顯示唯一 USB Badge，定位、停止及還原成功。
- [ ] 同一 Wi-Fi 的一般 Wi-Fi 顯示唯一 Wi-Fi Badge，定位、停止及還原成功。
- [ ] 拔線或關閉一般 Wi-Fi 不會自動切換 Wireless Direct。
- [ ] 手動連上 Direct 後顯示唯一 Wireless Direct Badge，定位、停止及還原成功。
- [ ] RemotePairing 廣告的動態 port 被保留，未被強制改成 49152。
- [ ] 手機與電腦換到另一個 Wi-Fi 後，新 IP／port 可重新連線。
- [ ] 舊 Direct runtime 失效後，一般 Wi-Fi 能重新接管。
- [ ] 重啟 ArcWayfarer 後，不接 USB 可用快速復連恢復 Direct。

## Session 與多設備隔離

- [ ] Direct 導航中插 USB，不中斷目前導航；停止後 USB 才接管。
- [ ] 設備 A 導航時，設備 B 掃描、連線成功、連線失敗皆不影響 A。
- [ ] 清除 B 的歷史紀錄不會中斷 A。
- [ ] 即時清單只顯示掃描到的設備，每台恰有一個 transport Badge。
- [ ] 三席容量與快速復連最近兩筆顯示正確。

## Wireless Direct 定位功能

- [ ] 瞬移會讓手機地圖抵達指定位置。
- [ ] 導航會連續更新手機位置，暫停與繼續有效。
- [ ] 路線循環會完成一圈並繼續下一圈。
- [ ] 多點巡迴會依序抵達各站，跳躍模式也可用。
- [ ] 隨機漫遊會持續產生並套用新位置。
- [ ] 搖桿移動會連續更新方向與位置。
- [ ] 停止並還原後，手機會重新取得真實 GPS 位置。

## iOS 覆蓋

- [ ] iOS 16 Direct TCP。
- [ ] iOS 17+ RemotePairing／RSD。

## 擷取指令

    powershell -ExecutionPolicy Bypass -File windows-device-acceptance.ps1 -Label usb
    powershell -ExecutionPolicy Bypass -File windows-device-acceptance.ps1 -Label wifi
    powershell -ExecutionPolicy Bypass -File windows-device-acceptance.ps1 -Label direct-old-network
    powershell -ExecutionPolicy Bypass -File windows-device-acceptance.ps1 -Label direct-new-network

## 實際定位探針（會暫時變更手機定位，完成後自動要求還原）

    powershell -ExecutionPolicy Bypass -File windows-device-acceptance.ps1 -Label direct-location -RunLocationProbe -ProbeUdid '<Device Manager 顯示的 UDID>'

JSON 已將完整 UDID 與 IP 換成不可逆短雜湊；請勿附上 RemotePairing 私鑰檔案。
"@ | Set-Content -Encoding UTF8 $ChecklistPath
}

Write-Host "Acceptance capture written to $CapturePath"
Write-Host "Checklist: $ChecklistPath"
if (-not $Health.ok) {
    Write-Warning "ArcWayfarer backend is not reachable at $ApiBase. Open the app, then capture again."
    exit 2
}
