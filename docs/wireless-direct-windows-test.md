# Windows Wireless Direct 實機測試

這是開發分支的驗證流程；目前尚無 Windows 拔線定位的實機成功紀錄。請用自己的 iPhone 與同一部 Windows 電腦完成配對，不要從 Mac 複製 RemotePairing 私鑰。

## 取得並建置

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
3. 確認手機與電腦在可互通的同一網路，拔掉 USB。重新掃描端點，記錄是否出現 `_remotepairing` 的 IP 與埠號；若沒有，可用手機 IP 手動連線測試預設埠 `49152`。
4. 點選端點連線，確認顯示的 UDID 是原手機。設定一個容易辨識的測試位置，親眼確認手機地圖移動，再按停止並親眼確認位置還原。
5. 完全關閉並重啟 ArcWayfarer，不接 USB 重複連線、設定與還原。
6. 若可行，再測手機鎖定、IP 變更、Wi-Fi 暫時中斷。每次記錄介面狀態及是否真正還原定位。

## 建議回報格式

請提供：commit、Windows 版本、iOS 版本、Apple Mobile Device Support 來源、USB 列舉結果、無線授權結果、掃描結果、拔線後連線結果、定位與還原結果、打包 exe 的錯誤訊息。可附錯誤類型及 OpenSSL 版本；請遮蔽完整 UDID、內網 IP、配對紀錄與私鑰。

若 `NO_CIPHERS_AVAILABLE` 出現在打包 exe，需記錄該 exe 使用的 Python／OpenSSL 版本，再檢查 PSK cipher 是否存在。若掃描不到手機，先區分 mDNS 無結果、網路不通與配對驗證失敗。Windows `arp -a` 只是輔助候選來源，不能證明某個 IP 屬於指定手機。

目前一次只測一台 iOS 17+ 無線裝置；現有 userspace RSD 隧道是單程序單通道。Windows 多機與 iOS 17.0–17.3.1 另列後續驗證。
