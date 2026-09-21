# macOS 無線直連測試版

macOS 已分別以 iOS 16.7.16 的 Direct TCP 與 iOS 26.6.2 的 RemotePairing／RSD 完成限定環境實機驗證。這些結果不能推定所有 iOS 版本與網路環境都可用；目前設備狀態與切換行為以 [設備管理架構決策](device-management-architecture.zh-TW.md)為準。

## 使用步驟

1. 將 iPhone 與 Mac 接上 USB，解鎖手機，並在手機上信任這部電腦。
2. 打開 ArcWayfarer 的「裝置管理」，在「macOS 無線直連測試版」找到這台手機，按「設定無線連線」。程式會確認手機允許 Wi-Fi lockdown，先透過 USB 準備開發者映像，再於這台 Mac 的 `~/.arcwayfarer/pairing_records/` 保存配對紀錄。目錄權限為 `0700`，檔案權限為 `0600`。首次準備映像可能需要較長時間。
3. 拔除 USB 線，保持手機與 Mac 位於可互相連線的區域網路。按「連線 Direct」。若 mDNS 找不到手機，可以在進階欄位輸入手機「設定 → Wi-Fi → 已連線網路旁的 ⓘ」顯示的 IP。
4. 設定一次定位並執行「停止並還原」。只有手機地圖實際移動且恢復，才算完成驗收；單憑「Direct 已連線」仍不足以證明定位有效。

若定位正在執行，session 必須維持原本的 `bound_route`；先停止並還原定位，才能切換連線或移除授權。無線連線實際失敗且沒有其他可用 route 時，裝置會從即時清單消失；配對憑證與最近驗證成功的端點仍保留在獨立的快速復連紀錄。掃描只能回報 Direct 候選端點；active Direct 健康狀態由 tunnel lifecycle 或實際定位 I/O 判定。裝置閒置時 USB 可接管；操作進行中插入 USB 只更新可用狀態，待 session 結束後才切換。

## 2026-09-17 實機結果與待解問題

已使用專案指定的 `pymobiledevice3==11.3.1` 與 iOS 16.7.16 實機驗證：USB 授權資料保存成功，檔案權限正確；拔線後 Direct TCP 配對、UDID 身分比對及定位服務通道開啟成功。發現 **Wi-Fi lockdown 可開啟定位服務，但透過 Wi-Fi 執行開發者映像掛載時，手機端會關閉服務連線**；因此設定流程改為在 USB 接著時先掛載映像。

在 Mac 與 iPhone 改連另一支手機熱點後，透過 Direct 通道對東京車站發送定位命令，分別等待約 10 秒、30 秒，手機「地圖」都沒有移動。另一次保持開發者服務連線開啟 30 秒，地圖仍沒有移動。三次測試都成功送出設定與清除定位命令，未出現通訊錯誤；這只能證明資料寫入通道，**不能證明手機接受了模擬位置**。此前的 [Phase 1 探測](wireless-direct-phase1-spike.md) 僅驗證 Direct TCP 配對。

後續已完成對照：同一台手機經系統 Wi-Fi（usbmux `Network`）設定東京車站座標，在 USB 仍接上與**USB 已拔除**兩種情況下，使用者均看到地圖移動並在清除命令後恢復。明確強制走 USB 的一次對照未觀察到移動；先前未指定路徑的一次對照有移動，但因當時 `Network` 與 `USB` 同時存在，不能視為純 USB 證據。兩條無線路徑啟動 `com.apple.dt.simulatelocation` 時都回報 `EnableServiceSSL=True` 並提供服務埠；其回覆不足以確認服務實際接受了定位命令。這些對照將問題收斂到 Direct TCP 服務連線的建立方式，修正前的 Direct 實測未通過。

另以 USB 已拔除的條件重跑 ArcWayfarer 正式後端 `device_session.set_location`／`clear_location` 流程，並確認 usbmux 只有 `Network` 路徑。第二次執行時，使用者確認地圖移到東京並在 20 秒後恢復，證明現有系統 Wi-Fi 路徑可完成 App 端到端定位。第一次執行的視覺結果未記錄，不能視為獨立成功案例。

## Direct TCP 的突破與待驗證範圍

配對紀錄逐欄比較後，系統 Wi-Fi 路徑與 Direct TCP 使用的憑證完全相同。兩條路徑對定位服務啟動時均取得 `EnableServiceSSL=True` 與可連線的服務埠；既有短時間測試在命令送出後觀察到服務連線關閉，但尚未驗證每次呼叫都會明確釋放。系統網路表顯示，系統 Wi-Fi 實際也透過同一個 IPv4 位址連到手機的 `62078` 與動態服務埠，因此 IP、配對資料與服務名稱都不足以解釋差異。

在 `pymobiledevice3==11.3.1` 中，`create_using_tcp` 先建立 asyncio reader/writer，定位服務 TLS 隨後走 `StreamWriter.start_tls()`；usbmux `Network` 的服務 socket 在 TLS 前沒有 reader/writer，會讓 `ServiceConnection.ssl_start()` 直接建立 TLS stream。把 Direct TCP **服務連線**改成後者後，USB 已拔除的 iOS 16.7.16 實機於 20 秒測試中確實移到東京並恢復。專案新增 `DirectTcpLockdownClient`，只改服務 socket 的建立方式，保留原本的 Direct TCP lockdown 配對與 UDID 驗證。這是目前最有力的原因推論，尚未取得手機端日誌證明 `start_tls()` 具體在哪一步造成無效命令。

修正後的 ArcWayfarer 正式 Direct 後端 `connect_direct` → `device_session.set_location` → `clear_location` 已在 USB 拔除時執行成功。另在測試程序內讓 `usbmux_list_devices` 與 `create_using_usbmux` 一律拋錯，重跑相同流程 20 秒；使用者確認手機地圖移到東京並在結束後恢復。這證明本次定位操作確實經由 Direct TCP 完成，沒有退回系統 Wi-Fi 的 usbmux 通道。其他 iOS 16 機型與 Windows 尚未驗證；iOS 17+ 使用另一條 RemotePairing／RSD 路徑，結果見 [iOS 26.6.2 實機驗證](wireless-direct-ios26-spike.md)。

Direct 被明確選取後，定位操作會使用配對紀錄及已驗證的 IP。背景掃描仍可列舉 USB 與系統 Wi-Fi，但依正式架構合約不得藉由掃描關閉或替換 Direct。掃描 source 失敗也不得等同成功空結果。既有分支尚在依 strangler 路線遷移到這個模型；本段的實機結果只證明 Direct TCP 定位路徑可用，不代表舊狀態管理已符合全部不變量。

### 後續驗證門檻

1. `StreamWriter.start_tls()` 與直接建立 TLS stream 的行為差異已由實機對照確認，但「緩衝殘留」、「TLS frame 損毀」及手機端靜默丟棄都尚無封包或裝置日誌證據，不能作為已確認根因。
2. `pymobiledevice3==11.3.1` 的 `DtSimulateLocation.set()`／`clear()` 每次會新開開發者服務連線，卻沒有明確呼叫 `service.close()`。ArcWayfarer 的 iOS 16 wrapper 現在以相同封包格式送出指令，並在正常送出、失敗或取消時明確關閉服務連線；Direct TCP 在 TLS 升級失敗時也會關閉剛建立的 socket。2026-09-17 拔線且強制禁用 usbmux 的 20 秒測試重跑兩次，後端均回報設定與還原指令送出成功；第二次使用者親眼確認手機地圖移到東京並在約 20 秒後恢復，驗證明確關閉服務連線後 Direct TCP 定位仍有效。連續操作、逾時及手機離線後的 socket 數量與狀態仍需驗證。現有資料不足以宣稱已發生 `CLOSE_WAIT` 殘留。
3. Windows 需獨立驗證 Direct TCP 的非阻塞連線、TLS 握手與定位效果，包含 AMDS 不可用、網路切換和重連。iOS 17+ 的無線 RSD／DVT 另作實機驗證，不能由 iOS 16 的結果推定可用。

## 待回頭修：系統 Wi-Fi Socket Hold 探測腳本

先前的一次性對照腳本位於 `/private/tmp/arcwayfarer_network_socket_hold.py`，用途是經 usbmux `Network` 開啟 `com.apple.dt.simulatelocation` 並保持服務連線 20 秒，以便觀察系統網路表。它不是 Direct TCP 測試，也沒有送定位命令；`/private/tmp` 內容可能被清除，日後若要重用，應在專案內重新建立正式診斷工具。

正式化時需處理：

1. 以明確 UDID 選裝置；僅在恰好一台符合條件時才可自動選取。不可直接使用 `pairing_store.list_udids()[0]` 或假設 `glob` 順序固定。
2. 服務連線使用 `async with` 或 `try/finally` 關閉。正常取消需清理；不可宣稱 Ctrl+C 一定造成持續的背景 socket 殘留。
3. 將 `list_devices()` 也放入錯誤處理，並涵蓋指定 UDID 缺席時的 `DeviceNotFoundError`、無裝置與連線中斷；錯誤應回傳非零退出碼。
4. 只有 sleep 20 秒不足以證明 socket 仍存活；需額外觀察 TCP 狀態或設計可判斷的服務往返，並在輸出中區分「已開啟服務」與「定位實際生效」。
5. 標明此工具僅適用 iOS 16 及以下的 legacy developer service；iOS 17+ 另走 RSD／DVT，不預設失敗時一定是特定例外型別。
