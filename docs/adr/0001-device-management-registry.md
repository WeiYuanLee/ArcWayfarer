# ADR-0001：設備管理採用 Registry、Aggregate 與 Strangler 遷移

- 狀態：Accepted
- 日期：2026-09-21
- 決策範圍：USB、系統 Wi-Fi、Wireless Direct、配對能力與定位 session 的狀態管理
- 詳細設計：[設備管理架構決策提案](../device-management-architecture.zh-TW.md)
- 實作計畫：[設備管理重構實作計畫](../device-management-implementation-plan.zh-TW.md)
- 正式不變量：[ARCHITECTURE.md](../../ARCHITECTURE.md#設備管理與傳輸路由)

## 背景

既有 `device_manager.py` 同時負責 discovery、配對、route 選擇、tunnel 生命週期與設備描述。掃描及 connect command 會並發修改多組模組級全域狀態，查詢路徑也能關閉 transport。近期修正 Wi-Fi 換網、USB 接管與 Direct 黏著行為時，反覆產生跨情境 regression。

單一 `USB / Wi-Fi / Wireless Direct / Disconnected` 狀態不足以描述一台設備同時具有多條可用 transport、使用者顯式選擇及 active session 的情況。

## 決策

1. 以每個 UDID 一個 `DeviceAggregate` 作為設備狀態單位，集中存入 `DeviceRegistry`。
2. Aggregate 分開保存 availability、Direct runtime、authorization、user intent、selected route、session binding 與 revision。
3. Discovery 只產生帶 `success / failed` 的 immutable snapshot，不建立、切換或關閉 transport。
4. `route_policy` 是無 I/O 的純函式，計算唯一對外 `selected_route`。
5. `TransportController` 是唯一能建立或關閉 tunnel 的元件。
6. Active session 綁定建立它的 route，直到 session 停止或該 transport 實際失敗。
7. Wireless Direct 採嚴格手動、黏著模式：配對與歷史紀錄不會自動啟用 Direct。
8. 每次 aggregate 變更遞增 revision；前端不得用較舊的 scan 覆蓋較新的 command 結果。
9. Discovery coordinator 可發布 observation event；HTTP GET 只能讀 snapshot。Policy 產生的 transport effect 只有 Controller 能執行，且必須按設備與 revision 去重。
9. 以 P0～P4 strangler 階段替換既有實作，不進行一次性切換。

Direct endpoint discovery 只提供連線候選，不是 active Direct 健康狀態的權威來源。只有 Transport Controller 的 tunnel lifecycle 或實際 session I/O 結果能把 Direct runtime 轉為 `ready` 或 `failed`。

## 路由政策

Session active 時固定使用 `bound_route`。Session idle 時依序選擇：USB、使用者顯式啟用且健康的 Direct、系統 Wi-Fi、none。USB 在 active session 期間只更新 availability；session 結束後才接管。Direct 實際失敗後可重新計算並使用仍可用的系統 Wi-Fi。

## 被否決方案

### 繼續修補全域 dict/set

無法提供跨掃描與 command 的原子狀態，也無法建立可驗證的不變量。

### 只拆分檔案

如果新模組仍共同修改同一批全域狀態，只會形成分散式 God Object，不會降低競爭風險。

### 單一互斥 transport enum

無法表示多條 transport 同時可用、Direct 使用者意圖與 session pinning，因此拒絕。

### 一次性全面切換

現有測試大量耦合私有狀態，且 Windows、不同 iOS 世代與多設備尚未完全實機驗證。一次性切換無法安全定位 regression。

## 後果

### 正面

- 查詢與 discovery 不再破壞 transport。
- 路由優先權集中且可用 table tests 完整驗證。
- 每台設備的操作與清理具有隔離邊界。
- revision 能阻止前端 stale scan 覆蓋 command 結果。
- 後續 Windows adapter 可加入 discovery 層，不必修改 route policy。

### 成本

- 遷移期會短暫維護新舊兩套狀態來源。
- 現有直接 patch 私有全域的測試必須改寫成行為測試。
- API 需逐步加入 revision 與 selected route 語意。
- Session 與 transport 的責任邊界需要重整。

## 遷移護欄

- 每個階段使用獨立 PR，必須可回退。
- P0 先建立不依賴私有全域的行為測試。
- 新 registry 在接管寫入前先 shadow 計算並比對舊 API 輸出。
- 任一設備操作不得改變其他 UDID 的 aggregate revision。
- 未通過 macOS、Windows、iOS 16、iOS 17+ 與多設備驗收前，不移除舊路徑。
