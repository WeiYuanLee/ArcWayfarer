# ArcWayfarer 前端開發指南

> 狀態：提案／重構基準。新功能與既有 UI 遷移均應遵守本文件。

## 1. 產品與設計定位

ArcWayfarer 是桌面優先的 iOS 位置控制工具，不是一般資料表導向的管理後台。介面應採用 **Technical Map Control Console**：以企業 SaaS 的清楚、克制與可靠為基礎，讓地圖和目前任務成為視覺焦點。

- 地圖是工作畫布，不應被裝飾性 UI 壓過。
- 控制面板是任務區；清楚顯示當前模式、輸入、狀態與一個主要操作。
- 介面以中性色和單一藍色品牌色建立層級；綠、黃、紅只用於語意狀態。
- 不使用玻璃擬態、霓虹發光、裝飾性漸層、過度陰影或 emoji 作為 UI icon。
- 桌面版優先；Mobile Remote 保持相同設計 token，但採用觸控優先的底部 sheet 版面。

## 2. 技術決策

### 2.1 UI 基礎

使用 Mantine 作為共用元件和主題系統，並使用 `@tabler/icons-react` 作為唯一通用圖示來源。

```text
@mantine/core          基礎元件、Theme、色彩模式
@mantine/hooks         UI hooks
@mantine/modals        確認與高風險操作
@mantine/notifications 全域通知
@mantine/spotlight     Command Palette
@tabler/icons-react    圖示
```

不導入 Naive UI，因為它是 Vue 3 元件庫；本專案為 React 18。

### 2.2 樣式責任邊界

Mantine 負責所有通用互動元件：Button、Input、Modal、Drawer、Menu、Tooltip、Tabs、Slider、Switch、Notification 與 Spotlight。

保留自訂 CSS 的範圍僅限：

- Leaflet 地圖與 marker/path/popup 覆蓋
- 地圖上的固定定位（control dock、工具列、選點提示）
- Mobile Remote 的 layout / bottom sheet 手勢
- 本文件未被 Mantine 覆蓋的產品專屬可視化

禁止再為一般 Button、Input、Dialog、Toast、Dropdown、Tooltip 建立新的手刻元件或全域 class。

### 2.3 PostCSS

Mantine 核心元件只需在入口引入各 package 的 CSS，並不以安裝 PostCSS 為前置條件。若未來需要 Mantine PostCSS mixin 或 CSS Modules 的進階功能，再獨立加入 `postcss-preset-mantine`；不要為了導入 Mantine 而先變更 CSS pipeline。

## 3. Theme 與 light / dark / auto

### 3.1 色彩模式規則

- 預設為 `auto`，跟隨 macOS / Windows 系統設定。
- 設定頁提供 `Light`、`Dark`、`Follow system` 三選一。
- 使用者的選擇須持久保存；桌面版與 Mobile Remote 使用相同 key 和邏輯。
- 僅顯示日／月切換按鈕不足以滿足需求；設定中必須能選 `auto`。
- 主題切換時不保留色彩 transition，避免地圖操作中的閃爍。

### 3.2 Token 原則

Token 集中於 `frontend/src/theme/theme.ts`。產品專屬 CSS 透過 `html[data-mantine-color-scheme]` 對應同一組語意變數，不直接寫色碼。

| 語意 | Light | Dark | 用途 |
| --- | --- | --- | --- |
| `bg-canvas` | 中性灰白 | 深石墨灰 | App 與非地圖畫布 |
| `bg-surface` | 白 | 深灰 surface | 面板、Drawer、Modal |
| `bg-elevated` | 淺灰 | 較亮深灰 | hover、次級區塊 |
| `text-primary` | 深灰 | 近白 | 標題與主要內容 |
| `text-secondary` | 中灰 | 淺灰 | 輔助說明 |
| `border-default` | 淺灰 | 中深灰 | 元件分隔 |
| `brand-primary` | Blue 6 | Blue 7/8 | focus、selected、primary action |
| `status-success` | 綠 | 綠 | 成功／運行中 |
| `status-warning` | 琥珀 | 琥珀 | 注意／暫停 |
| `status-danger` | 紅 | 紅 | 錯誤／破壞性操作 |

色彩不以 mode（Teleport、Navigate 等）區分；模式使用文字、icon、選取狀態區別。所有 token 均需在 light 和 dark 下檢視對比度與 focus ring。

### 3.3 尺度

- Spacing：`4, 8, 12, 16, 24, 32, 48px`。
- 圓角：control `6px`、surface `8px`、modal 最大 `12px`。
- 字級：頁面標題 24–28px、區段 18–20px、元件標題 14–16px、正文 14px、輔助 12px。
- 預設字體：系統 sans-serif；座標、速度、技術值才使用 monospace。
- Motion：`150–200ms`，遵守 reduced motion；不得用持續光暈或跳動作為一般狀態。

## 4. Desktop 與 Mobile 架構

本專案有兩個前端入口：`frontend/src/main.tsx`（Desktop）與 `frontend/mobile/main.tsx`（Mobile Remote）。兩者都必須在根節點提供：

```tsx
<MantineProvider theme={arcWayfarerTheme} defaultColorScheme="auto">
  <ModalsProvider>
    <Notifications />
    <I18nProvider>{/* app */}</I18nProvider>
  </ModalsProvider>
</MantineProvider>
```

建議新增結構：

```text
frontend/src/theme/
  theme.ts             Mantine theme、元件預設值
  tokens.css           地圖與產品專屬語意 CSS variables
  colorScheme.ts       可測試的設定 key 與選項
frontend/src/components/ui/
  AppButton.tsx        僅在產品語意確有必要時封裝 Mantine
  StatusBadge.tsx
  PanelSection.tsx
```

不應把整個 Mantine API 再包一層。`components/ui` 只承載 ArcWayfarer 特有語意，不能成為第二套 UI library。

## 5. Layer 與 Leaflet 規則

Leaflet 的 popup/control 有高 z-index；所有 Mantine overlay 必須在地圖之上。

- Mantine theme 的 overlay / modal / popover z-index 設為至少 `2000`。
- 地圖專屬 dock 保持低於 Modal/Drawer，並集中使用明確的 z-index scale。
- 所有 map overlay 由 `MapView` 的定位容器管理；不可新增 scattered `position: fixed`，除非是全域 modal/notification。
- Mantine `Menu`、`Tooltip`、`Modal` 開啟時，必須實測不被 Leaflet control、popup 或 marker 遮蔽。
- 地圖底圖需有成對的 light / dark tile 策略；切換主題時同步更新 tile layer，並保留 attribution。

## 6. 元件選用規範

| 情境 | 優先使用 | 禁止／避免 |
| --- | --- | --- |
| 主要操作 | `Button` | 同一區域多個 primary button |
| 次要操作 | `Button variant="default/subtle"` | 自創不同風格按鈕 |
| icon-only 操作 | `ActionIcon` + `aria-label` + Tooltip | emoji 與無名稱 icon button |
| 模式切換 | `SegmentedControl` | 大型發光 capsule |
| 裝置切換 | `Tabs` 或 compact selector | 無限增長的 pill 清單 |
| 表單 | `TextInput`、`NumberInput`、`Switch`、`Slider` | 只有 placeholder、沒有 label 的欄位 |
| 確認危險操作 | `modals.openConfirmModal` | 手刻 backdrop/focus trap |
| 一般視窗 | `Modal` | 自建 portal |
| 收藏與歷史 | `Drawer` | 在地圖上任意位置展開的 card |
| 全域訊息 | `notifications.show` | 重複建立 toast state/context |
| 指令搜尋 | `Spotlight` | 第二套 command modal |
| 右鍵選單 | `Menu`，保留 Leaflet 座標事件 | 不可存取的絕對定位清單 |

每個 interactive control 必須具備 default、hover、active、focus-visible、disabled 與 loading（如適用）狀態。可測試的 UI 必須優先使用 accessible name；只有語意不足時才加 `data-testid`。

## 7. 既有元件遷移對照

| 既有內容 | 目標 | 遷移限制 |
| --- | --- | --- |
| `Toast.tsx`、`UndoToast.tsx` | Notifications | 保留 undo 的可取消行為 |
| `ConfirmModal.tsx` | Modals Manager | 危險確認須明確 danger action |
| `UpdateModal.tsx`、`SponsorModal.tsx`、`PasteCoordinatesModal.tsx` | Modal | 不改 API/service 邏輯 |
| `CommandPalette.tsx` | Spotlight | 保留 Cmd/Ctrl+K、現有 actions 與 i18n |
| `FavoritesDrawer.tsx`、`HistoryDrawer.tsx` | Drawer | 維持 dnd-kit 操作與鍵盤可及性 |
| `DevMenuButton.tsx`、`ContextMenu.tsx` | Menu | Leaflet client position 要正確轉交 |
| `ModeSelector.tsx` | SegmentedControl | 維持每裝置 mode state |
| `DeviceTabs.tsx` | Tabs / compact control | 維持裝置狀態與 hover 資訊 |
| `SpeedSlider.tsx` | Slider | 維持鍵盤與精確數值行為 |
| 各 panel 手刻 form | Mantine form controls | 不改定位、WebSocket、Leaflet state |

`@dnd-kit` 搭配 Mantine 時，Sortable 的 `setNodeRef` 必須落在能正確轉發 ref 的節點；不確定時，保留外層原生 `div` 作 sortable node，Mantine 元件放在其內。

## 8. 分階段重構計畫

### Phase 0 — 基線與保護措施

1. 為現有 Desktop、Mobile 主要畫面截圖並記錄 E2E 基線。
2. 盤點每個 CSS 區塊由哪個元件使用，避免誤刪仍被 mobile 使用的規則。
3. 先為關鍵互動補上 accessible name 或 `data-testid`，不以脆弱 CSS class 作 E2E 選擇器。

驗收：既有 `npm run build`、單元測試與 Playwright E2E 全數通過。

### Phase 1 — Theme 與雙色模式基礎

1. 安裝 Mantine 與 Tabler Icons，於兩個入口引入必要的 package CSS。
2. 建立共用 theme、tokens、`auto/light/dark` 偏好保存與設定 UI。
3. 設定 overlay z-index，為 light/dark 建立地圖 tile 切換策略。
4. 先套用 app canvas、TopBar 與一個 FloatingCard 作視覺驗證。

驗收：Desktop/Mobile 可切換三種模式；重開 app 後偏好仍存在；Modal 在 Leaflet popup 之上。

### Phase 2 — 低耦合全域元件

依序遷移 notifications、confirm modal、一般 modal、Spotlight。每完成一種元件就刪除其對應手刻樣式與舊 portal/focus 管理。

驗收：Esc、Tab focus、螢幕閱讀器名稱、danger confirm、Cmd/Ctrl+K 均正常；所有舊元件引用已移除。

### Phase 3 — 導覽與地圖周邊

遷移 Drawer、Menu、Mode selector、Device switcher、右側 action rail，統一成緊湊的 6/8px enterprise control 樣式。

驗收：Drawer/Menu/Tooltip 不會被 Leaflet 遮蔽；觸控與鍵盤都可完成裝置、模式、收藏與歷史操作。

### Phase 4 — 各模式面板

先遷移 Teleport 和 Navigate，確立 `PanelSection`、表單列、狀態訊息、主要/危險 action 的模式，再套用到 Route Loop、Multi-stop、Random Walk、Joystick。

驗收：每個面板只有一個明確主要 action；驗證錯誤含文字訊息；loading 不允許重複送出；控制行為和 API payload 不變。

### Phase 5 — CSS 收斂與完整驗證

刪除僅屬於已遷移元件的 CSS。不得以大範圍覆寫 Mantine class 來「暫時修好」視覺；必要調整寫在 theme component defaults 或產品語意 class 中。

驗收：`styles.css` 僅保留 reset、地圖、mobile layout、產品專屬 overlay；每個 light/dark 畫面完成視覺檢查和 E2E。

## 9. 開發流程與 Definition of Done

新 UI 工作必須依序：

1. 檢查 Mantine 是否已有符合元件；其次檢查 `components/ui` 是否有產品語意元件。
2. 在 theme/token 層定義新視覺需求；不得先在單一頁面寫硬編碼色彩或任意 spacing。
3. 為 Desktop 和 Mobile 指定行為；不要求相同 layout，但必須用相同語意 token。
4. 補上 i18n、鍵盤操作、focus、loading/empty/error state。
5. 執行 build、受影響的 unit test 與 Playwright；視覺性改動需檢查 light/dark 截圖。

一個 UI 工作只有在以下條件都成立時才算完成：

- 沒有新增未定義 token 的色彩、spacing、radius 或 shadow。
- 沒有新增 emoji UI icon、手刻 portal、手刻 focus trap 或無名稱 icon button。
- light、dark、auto 均可用，且 status 不只靠顏色表達。
- Leaflet 層級、dnd-kit 拖曳、Desktop/Mobile build、現有互動測試均無回歸。
- 已刪除或遷移因本工作而不再使用的 CSS，而非留下雙套實作。

## 10. 禁止事項

- 不混用 Mantine、另一套完整 React UI library 與自製通用元件。
- 不為單一頁面建立新的色彩或 layout system。
- 不將 map overlay 當一般 Card 任意堆疊；每個浮層必須有明確任務與層級。
- 不以 `!important` 或大量 selector 覆寫 Mantine internals 解決設計問題。
- 不在未確認可替換前刪除舊 CSS、E2E selector 或 Leaflet event handling。
