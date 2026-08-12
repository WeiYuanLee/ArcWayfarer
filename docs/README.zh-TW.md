# ArcWayfarer

[English](../README.md)

**在 macOS 和 Windows 上模擬 iPhone 的 GPS 位置。**

ArcWayfarer 讓你不需要實際移動，就能在地圖上傳送、導航或沿路線行走。適合測試位置相關 App、玩 AR 遊戲，或保護你的真實位置。

![ArcWayfarer 截圖](screenshot.png)

---

## 下載

> 正式版即將推出，歡迎先 Star 本專案以接收通知。

<!-- 發布後替換為：
[![Download](https://img.shields.io/github/v/release/lencelee/arcwayfarer?label=Download&style=for-the-badge)](https://github.com/lencelee/arcwayfarer/releases/latest)
-->

支援 **macOS**（Apple Silicon + Intel）和 **Windows 10/11**。

---

## 功能

### 導航模式

| 模式 | 說明 |
|------|------|
| **傳送（Teleport）** | 立即跳到地圖上任意位置 |
| **導航（Navigate）** | 沿真實路線步行、慢跑或開車 |
| **路線循環（Route Loop）** | 持續重複同一條路線（支援 GPX / JSON 匯入）|
| **多點路徑（Multi-stop）** | 依序串接多個航點，支援拖曳排序 |
| **搖桿（Joystick）** | 用鍵盤或畫面搖桿即時控制移動方向 |
| **隨機漫步（Random Walk）** | 在指定區域內隨機移動 |

### 其他功能

| 功能 | 說明 |
|------|------|
| **收藏（Favorites）** | 儲存、分組並拖曳排序常用地點 |
| **歷史記錄（History）** | 瀏覽最近造訪過的位置 |
| **地點搜尋（Place Search）** | 以名稱或關鍵字搜尋任何地點 |
| **命令面板（Command Palette）** | 快速切換模式、地點與操作（⌘K）|
| **路線匯入（Import Routes）** | 匯入 GPX 軌跡或 JSON 航點檔案 |
| **手機遙控（Mobile Remote）** | 掃描 QR Code，用手機控制桌面 App |
| **多裝置管理（Multi-device）** | 同時管理多台連接的 iOS 裝置 |
| **自動更新（Auto-update）** | 內建更新檢查，App 內通知新版本 |
| **跨平台（macOS + Windows）** | 原生 Electron App，兩個平台皆支援 |

---

## 安裝設定

### 系統需求

- **macOS**（Intel 或 Apple Silicon）或 **Windows 10/11**（64 位元）
- iOS 裝置透過 USB 連接至電腦

### iOS 相容性

- **iOS 16 及以下** — 透過 USB 連接並信任電腦，裝置會自動出現，無需額外操作。
- **iOS 17 及以上** — ArcWayfarer 會自動處理 RemoteXPC 通道。
  - **macOS**：通道啟動時會出現系統授權視窗。
  - **Windows**：App 啟動時需要系統管理員權限（UAC）。需安裝 iTunes 或 Apple Mobile Device Support。

### 首次使用

第一次對裝置設定位置時，ArcWayfarer 會下載並掛載開發者服務所需的 Developer Disk Image，視網路狀況需要數秒至數分鐘，之後的使用會立即完成。

---

## 開啟未簽署的版本

若下載的版本未經過開發者簽署：

- **macOS**：Gatekeeper 會在第一次開啟時封鎖。對 `.app` 按右鍵 → **開啟** → 確認**開啟**。
- **Windows**：SmartScreen 可能顯示「未知發行者」警告。點擊**更多資訊** → **仍要執行**。

---

## 授權

MIT — 詳見 [LICENSE](../LICENSE)。

---

<details>
<summary>開發者 / 建置說明</summary>

### 環境需求

- Python 3.11+
- Node.js 18+ 與 npm

### 開發模式啟動

後端（在 `backend/` 目錄下執行）：

```bash
python3 -m venv venv
source venv/bin/activate  # Windows: .\venv\Scripts\activate
pip install -r requirements.txt
python main.py       # 服務啟動於 http://127.0.0.1:8787
```

前端（在 `frontend/` 目錄下執行）：

```bash
npm install
npm run dev           # Vite 開發伺服器，埠號 :5173
npm start             # Vite + Electron 同時啟動
```

或一次啟動全部：

```bash
./scripts/start.sh
./scripts/stop.sh
```

### 打包發布

PyInstaller **不支援跨平台編譯**，每個平台必須在各自的原生系統上建置。

**GitHub Actions（推薦）** — 推送版本 tag，CI 會自動建置 macOS（`arm64`、`x64`）和 Windows（`x64`）安裝檔：

```bash
git tag v1.0.0
git push origin v1.0.0
```

**本機建置：**

```bash
# macOS
scripts/build-mac.sh --arch arm64   # 或 --arch x64

# Windows
powershell scripts/build-win.ps1
```

輸出位於 `frontend/release/`。

</details>
