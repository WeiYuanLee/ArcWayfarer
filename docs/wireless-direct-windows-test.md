# Windows Wireless Direct 實機測試

這是開發分支的驗證流程；目前尚無 Windows 拔線定位的實機成功紀錄。請用自己的 iPhone 與同一部 Windows 電腦完成配對，不要從 Mac 複製 RemotePairing 私鑰。

## 取得已封裝的 Windows 測試版（建議）

不需要在 Windows 本機建置。以瀏覽器開啟 [V1 跨平台驗證 run](https://github.com/WeiYuanLee/ArcWayfarer/actions/runs/35826086172)，在頁面最下方 **Artifacts** 下載 `validation-windows-x64`。ZIP 內含 Windows 安裝程式與 `SHA256SUMS-windows-x64.txt`；artifact 保留至 workflow 執行後 7 天。

若 C 槽空間不足，請下載、解壓及安裝至 D 槽。安裝器暫存空間也可在同一個 PowerShell 視窗暫時移至 D 槽：

```powershell
New-Item -ItemType Directory -Force D:\ArcWayfarerTemp
$env:TEMP = 'D:\ArcWayfarerTemp'
$env:TMP = 'D:\ArcWayfarerTemp'
Start-Process 'D:\下載位置\ArcWayfarer安裝程式.exe' -Wait
```

此 artifact 已在 Windows x64 runner 完成封裝，且內嵌 backend 啟動及 `/health` smoke test 已通過。仍需以下實機步驟驗證 Apple 驅動、iPhone 授權與網路切換。

## 取得驗收擷取工具

ArcWayfarer 開啟後，下載唯讀驗收工具至 D 槽：

```powershell
New-Item -ItemType Directory -Force D:\ArcWayfarerTest
Invoke-WebRequest 'https://raw.githubusercontent.com/WeiYuanLee/ArcWayfarer/feat/windows-wireless-direct-spike/scripts/windows-device-acceptance.ps1' -OutFile 'D:\ArcWayfarerTest\windows-device-acceptance.ps1'
cd D:\ArcWayfarerTest
powershell -ExecutionPolicy Bypass -File .\windows-device-acceptance.ps1 -Label preflight
```

工具只呼叫 GET API，不會配對、連線、斷線或操作定位。輸出的完整 UDID 與 IP 會換成不可逆短雜湊；報告仍會保留 route、revision、動態 port、IPv4／IPv6、OpenSSL、Python 與 pymobiledevice3 版本。

## 從原始碼自行建置（選用）

在 Windows PowerShell 執行：

```powershell
git clone --branch feat/windows-wireless-direct-spike https://github.com/WeiYuanLee/ArcWayfarer.git
cd ArcWayfarer
git rev-parse --short HEAD
powershell -ExecutionPolicy Bypass -File scripts/build-win.ps1
```

建置需要 Python 3.13、Node.js/npm，以及可下載專案依賴的網路。安裝 iTunes 或 Apple Mobile Device Support 後，從 `frontend/release/` 安裝本機產生的 Windows `.exe`。測試時記下上方顯示的 commit，以便對照結果。

## 一台 iOS 17+ iPhone 的驗證順序

1. 用 USB 接上手機，解鎖並在手機選擇信任這部電腦。先確認 ArcWayfarer 能列出該裝置。
2. 在裝置管理開啟 Wireless Direct，執行無線授權。全新 Windows 配對紀錄會透過 USB lockdown 建立，完成後才保存 ArcWayfarer 的授權狀態。
3. 確認手機與電腦在可互通的同一網路，拔掉 USB。重新掃描端點，記錄 `_remotepairing` 廣告提供的 IP 與埠號；埠號不保證為 `49152`。若沒有廣告，可手動輸入手機 IP，並只把 `49152` 當成缺少 SRV 資訊時的預設測試值。
4. 點選端點連線，確認顯示的 UDID 是原手機。設定一個容易辨識的測試位置，親眼確認手機地圖移動，再按停止並親眼確認位置還原。
5. 完全關閉並重啟 ArcWayfarer，不接 USB 重複連線、設定與還原。
6. 若可行，再測手機鎖定、IP 變更、Wi-Fi 暫時中斷。每次記錄介面狀態及是否真正還原定位。

在主要狀態各執行一次擷取，產生可比較的去識別 JSON：

```powershell
powershell -ExecutionPolicy Bypass -File D:\ArcWayfarerTest\windows-device-acceptance.ps1 -Label usb
powershell -ExecutionPolicy Bypass -File D:\ArcWayfarerTest\windows-device-acceptance.ps1 -Label wifi
powershell -ExecutionPolicy Bypass -File D:\ArcWayfarerTest\windows-device-acceptance.ps1 -Label direct-old-network
powershell -ExecutionPolicy Bypass -File D:\ArcWayfarerTest\windows-device-acceptance.ps1 -Label direct-new-network
```

結果預設存入目前目錄的 `arcwayfarer-v2-report`，包含各階段 capture 與一份人工勾選表。

## 設備狀態驗收

以下行為依 [設備管理架構決策](device-management-architecture.zh-TW.md)驗收：

1. 即時裝置清單只顯示目前具有可用 route 的設備；配對紀錄只出現在快速復連或授權資訊，不得生成離線卡片。
2. 每台顯示中的設備只能有 USB、Wi-Fi、Wireless Direct 一個 `selected_route`，Badge 必須與實際定位通道一致。
3. Direct 只能由使用者點擊連線後啟用；拔 USB、關 Wi-Fi 或背景掃描不得自動啟用 Direct。
4. Direct 成功後保持黏著；系統 Wi-Fi 被同時掃到時不得覆蓋。Direct 實際失敗後才可改用仍健康的系統 Wi-Fi。
5. 定位 session 執行中插入 USB 不得中斷導航；USB 只更新 availability，待 session 結束後才接管。
6. 設備 B 的掃描、連線或失敗不得改變設備 A 的 tunnel、session 或顯示狀態。
7. 掃描服務失敗與成功但沒有設備必須顯示為不同結果；暫時性 AMDS、tunneld 或 mDNS 錯誤不得關閉現有 Direct。

## 建議回報格式

請提供：commit、Windows 版本、iOS 版本、Apple Mobile Device Support 來源、USB 列舉結果、無線授權結果、掃描結果、拔線後連線結果、定位與還原結果、打包 exe 的錯誤訊息。可附錯誤類型及 OpenSSL 版本；請遮蔽完整 UDID、內網 IP、配對紀錄與私鑰。

若 `NO_CIPHERS_AVAILABLE` 出現在打包 exe，需記錄該 exe 使用的 Python／OpenSSL 版本，再檢查 PSK cipher 是否存在。若掃描不到手機，先區分 mDNS 無結果、網路不通與配對驗證失敗。Windows `arp -a` 只是輔助候選來源，不能證明某個 IP 屬於指定手機。

目前一次只測一台 iOS 17+ 無線裝置；現有 userspace RSD 隧道是單程序單通道。Windows 多機與 iOS 17.0–17.3.1 另列後續驗證。多設備驗收至少必須包含「A 保持導航，B 掃描／連線失敗」的隔離案例。
