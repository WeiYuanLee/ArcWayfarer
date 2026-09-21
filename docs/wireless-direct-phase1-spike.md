# 無線連線 Phase 1：通道驗證紀錄

日期：2026-09-16。這是技術探測紀錄，不代表無線定位功能已完成。

本文件保存當時的通道探測結果；目前設備狀態、路由與 session 規格以 [設備管理架構決策](device-management-architecture.zh-TW.md)及 [ADR-0001](adr/0001-device-management-registry.md)為準。

後續已完成 [macOS + iOS 16 Direct TCP 定位實測](wireless-direct-macos-test.md)，以及 [macOS + iOS 26.6.2 純 Wi-Fi RemotePairing／RSD 定位實測](wireless-direct-ios26-spike.md)。兩項均為限定裝置與環境的實機結果。

## 已完成的實機驗證

在 macOS x86_64、隔離 Python 環境與專案指定的 `pymobiledevice3==11.3.1` 上，使用一台 iOS 16.7.16 iPhone 執行 [`scripts/wireless_channel_spike.py`](../scripts/wireless_channel_spike.py)。探測期間 USB 線保持連接。腳本使用 `autopair=False`，沒有寫入手機設定、保存配對紀錄，或設定定位。

| 檢查 | 結果 | 可得結論 |
| --- | --- | --- |
| usbmux 裝置列舉 | 同一台手機同時有 USB、Network 路徑 | 裝置資料需按 UDID 合併，不可按路徑計數 |
| USB lockdown | 已配對、可讀取配對紀錄 | 既有 USB 授權可供後續技術驗證 |
| 手機無線 lockdown 設定 | `EnableWifiConnections=True` | 此機已啟用；**未驗證**從關閉狀態寫入的流程 |
| usbmux Network lockdown | 配對與連線正常 | 系統 Wi-Fi 路徑可用，但仍依賴 usbmux |
| mDNS | 可找到 mobdev2 與 remoted 廣告 | 此網路可收到廣播；不代表每個網路都可搜尋 |
| 直接 TCP | `create_using_tcp` 對 mobdev2 宣告的 IPv4 成功，配對與 UDID 均相符 | iOS 16 的 TCP lockdown 直連在本環境可行；尚未驗證拔線與定位服務 |

探測工具只輸出裝置識別碼的雜湊前綴、iOS 版本與狀態，不輸出配對紀錄、私鑰或完整 IP。`--auto-tcp` 會逐一嘗試 mDNS 宣告的 IPv4 位址，以配對與 UDID 比對確認目標手機；`--ip` 可驗證指定 IP。兩種 TCP 檢查都只建立 lockdown 連線。另可在 iOS 17+ 上以 `--probe-rsd` 開啟 RSD、DVT 與定位服務通道；這不會送出設定或清除定位的指令。

```sh
python scripts/wireless_channel_spike.py
python scripts/wireless_channel_spike.py --auto-tcp
python scripts/wireless_channel_spike.py --udid <裝置 UDID> --ip <手機 IP>
python scripts/wireless_channel_spike.py --udid <裝置 UDID> --probe-rsd
```

執行時須使用 `pymobiledevice3==11.3.1`。此腳本是診斷工具，不是使用者設定流程。

## 修訂版方案仍需修正之處

1. 寫入無線設定的範例參數順序錯誤。11.3.1 的介面是 `set_value(value, domain=..., key=...)`；應使用 `await lockdown.set_enable_wifi_connections(True)`，再讀回確認。原提案的 `set_value("EnableWifiConnections", True, domain=...)` 會造成參數衝突，不能執行。
2. `lockdown.pair_record` 可以作為候選資料來源，但取得後仍須檢查是否配對成功、必要欄位是否存在，以及重新開啟 TCP 時是否有效。Windows ACL、原子寫入與刪除行為仍須實作和測試。
3. 「插 USB 自動切到 USB，拔線再切回直連」不能只替換 Badge。正式決策採 session pinning：操作進行中維持建立 session 的健康 route；USB 只更新 availability，session 結束後才可接管。拔線或關閉 Wi-Fi 不得自動啟用 Direct。
4. `ready` 必須指目前的定位通道確實可操作；若僅曾通過拔線測試，應另記錄「上次驗證成功」，避免把歷史結果顯示成即時連線。
5. 「停止並還原定位」在完全失聯時可能無法立即傳送至手機。UI 必須顯示「已停止本機排程，待重連後嘗試還原」與最終結果，不可先宣稱手機定位已還原。

## 尚待實機驗證的關卡

| 平台與版本 | 必做操作 | 通過條件 |
| --- | --- | --- |
| Windows + iOS 16 | USB 初次授權、啟用無線、拔線、Direct TCP、定位設定及還原 | 拔線後不經 usbmux Network 也可完成定位操作；重啟程式後仍可重連 |
| Windows + iOS 17.0–17.3.1 | 拔線後建立 RSD/DVT，測試需要的驅動或 tunneld | 可清楚界定支援條件，失敗時給使用者可執行的指引 |
| Windows + iOS 17.4 以上 | 拔線後建立 RSD/DVT 並維持定位會話 | 可持續操作、斷線後可恢復，無憑證或通道洩漏 |
| 兩台以上 iOS 17+ | 同時建立無線 RSD/DVT 與分別設定、還原定位 | 驗證單程序限制；若失敗，確定 Worker 子行程方案與 IPC 邊界 |
| 網路異常 | 關閉 mDNS、換 IP、訪客網路隔離、手機鎖定與睡眠 | UI 區分搜尋失敗、網路不通、配對失效與會話失效 |
| 通道切換 | 定位進行中插線、拔線、重新連 Wi-Fi | 同一 UDID 只有一張卡片；不會誤報還原完成或留下執行中狀態 |

Windows 與 iOS 17+ 的測試不能由目前這台 macOS／iOS 16 裝置替代。真正的首版可行性，仍以「**拔線後成功設定並還原定位**」為門檻。
