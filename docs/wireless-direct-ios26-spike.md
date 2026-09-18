# iOS 26.6.2 無線 RSD 通道實機驗證

日期：2026-09-17。測試環境為 macOS、`pymobiledevice3==11.3.1` 與一台 iOS 26.6.2 iPhone。這是獨立測試程序的結果；ArcWayfarer 尚未整合此 iOS 17+ 無線路徑。

## 測試步驟與結果

1. USB 接線並在手機上信任電腦後，usbmux 列出一條 `USB` 路徑。手機已配對，`EnableWifiConnections=True`；`UserspaceRsdTunnel` 可以透過 USB 開啟 RSD、DVT 與定位服務通道。這一步只證明接線路徑可用。
2. 拔線後，usbmux 裝置列表為空；區網可找到 `_remotepairing._tcp` 廣播，本機也有與這支手機相符的遠端配對紀錄。測試程序強制將 `userspace_tunnel.create_using_usbmux` 換成會拋錯的函式，並暫時以 Wi-Fi RemotePairing provider 建立 `UserspaceRsdTunnel`。RSD 的 UDID 與目標相符，DVT 定位服務通道成功開啟。
3. 使用 Python 3.13 隔離環境與專案釘選的依賴，經上述純 Wi-Fi 路徑設定東京車站座標，保持約 20 秒，再送出還原指令。後端無錯誤；使用者親眼確認手機地圖移到東京並恢復。這次操作可作為該裝置的無線 RSD 定位與還原成功案例。

測試程式位於 `/private/tmp/arcwayfarer_ios26_wifi_rsd_probe.py`；它是一次性診斷程式，可能被系統清除，不能直接作為產品實作。程式只輸出計數、通道狀態及操作結果，不輸出完整 UDID、IP 或配對金鑰。

## 找到的實作關卡

- 在此釘選版本中，`UserspaceRsdTunnel` 的預設 provider 會先呼叫 `create_using_usbmux` 嘗試 USB `CoreDeviceProxy`。拔線後即使有可用的 RemotePairing 廣播與配對紀錄，也不能直接使用此預設入口建立純 Wi-Fi 隧道。產品實作需提供明確選取 Wi-Fi RemotePairing provider 的封裝，避免依賴測試程序的私有函式 monkeypatch。
- 同一 Wi-Fi 測試程序在臨時的 Python 3.12／OpenSSL 3.0.15 探測環境中已通過 RemotePairing 連線，但建立 TCP 隧道的 TLS-PSK 握手報 `NO_CIPHERS_AVAILABLE`；在 Python 3.13／OpenSSL 3.6.3 上成功。兩個環境同時改變了 Python 與 OpenSSL，尚未單獨證明是哪一項造成差異。正式 release CI 固定 Python 3.13，macOS 打包腳本亦要求 3.13 以上；開發啟動與 Windows 手動打包入口現也要求 3.13 以上。因此 3.12 失敗不列為正式版阻礙。仍須在實際打包 App 內驗證這條無線通道。
- 探測到多條可用 RemotePairing 位址；測試程序選用一條並關閉其餘已建立的連線。產品程式需管理探索、選路、逾時與資源清理。`UserspaceRsdTunnel` 的 PyTCP stack 在此版本為單程序單隧道，多機併發仍需另外驗證或隔離行程。

## 尚未驗證

- ArcWayfarer UI 的首次設定、重啟後重連、無線定位、停止並還原整條流程。
- 新電腦或沒有既存 RemotePairing 紀錄時，如何完成首次無線配對。
- 手機鎖定、離線、切換網路、IP 變更、mDNS 被阻擋後的恢復與錯誤訊息。
- Windows、其他 iOS 17+ 版本及多機並行。
