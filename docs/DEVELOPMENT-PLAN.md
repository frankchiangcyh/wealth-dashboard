# 資產戰情室 — 開發計畫書

> 版本：1.0｜更新日期：2026-04-23｜架構：單一 index.html，無後端

---

## 1. 專案概述

個人退休資產追蹤儀表板，目標追蹤 **3,000 萬台幣**退休資產進度，管理每月 **7 萬投資現金流**。

**核心原則**：單一 HTML 檔案，無後端、無伺服器。下載後直接瀏覽器開啟即可使用。
**同步原則**：所有快照資料儲存於 Google Sheets，任何裝置開啟即自動讀取歷史紀錄。

---

## 2. 技術決策

| 項目 | 決策 | 理由 |
|------|------|------|
| 架構 | 單一 `index.html`，無後端 | 最簡部署，本機直接開啟可用 |
| 即時報價 | Yahoo Finance 公開 API | 免費、無需 API Key |
| 資料儲存 | Google Sheets API v4 | 跨裝置同步、免費、可直接檢視 |
| 認證 | Google OAuth 2.0（PKCE flow） | 只有本人能存取；純前端可用 |
| 部署 | GitHub Pages（Private Repo） | 靜態托管，HTTPS 免費，支援 OAuth redirect |
| 本機執行 | 下載 `index.html` 直接瀏覽器開啟 | 完全可用（OAuth redirect 需調整） |
| 圖表 | Chart.js + chartjs-plugin-annotation | CDN 引入，無需打包工具 |

---

## 3. 持倉標的

| 標的 | 幣別 | 類型 | Yahoo Finance Symbol |
|------|------|------|----------------------|
| VT | USD | 全球股票 ETF | `VT` |
| BND | USD | 美國債券 ETF | `BND` |
| 0050.TW | TWD | 台灣 50 ETF | `0050.TW` |
| 006208.TW | TWD | 富邦台灣 50 ETF | `006208.TW` |
| 2409.TW（友達） | TWD | 台股個股 | `2409.TW` |
| 現金 | TWD | 活存 / 定存 | — |
| 房貸 | TWD | 負債項目（負值） | — |
| USD/TWD 匯率 | — | 換算用 | `TWD=X` |

---

## 4. UI 架構（Phase 1 已完成）

```
index.html
├── Header：時鐘（每秒更新）+ 報價延遲提示 + Live 指示燈
│
├── Row 1（2欄）
│   ├── 當前淨資產卡：金額 + 進度條（目標 3,000 萬）+ FIRE 達標徽章
│   └── 4% 法則提領卡：每年可領 / 每月可領 / FIRE 狀態
│
├── Row 2（2fr + 1fr）
│   ├── 退休模擬圖（Chart.js）
│   │   ├── 橘色實線 + 圓點 = 歷史快照紀錄
│   │   ├── 藍色填充 = 模擬累積期
│   │   └── 綠色虛線 = 模擬提領期（4% 法則）
│   └── 資產配置環形圖（Donut）+ 圖例
│
├── Row 3（2欄）
│   ├── 即時報價表：Ticker / 現價 / 漲跌 / 持股數 / 市值（TWD）
│   └── 更新持倉面板：各標的數量 input + 現金 + 房貸 + 新增快照按鈕
│
└── 互動滑桿（4項）
    ├── 每月投入（萬）
    ├── 預期年化報酬率（%）
    ├── 退休提領率（%）
    └── 目標資產（萬）
```

---

## 5. 資料流

```
Yahoo Finance API
（頁面載入時抓取 6 支 Ticker）
          ↓
  即時股價（USD + TWD=X 匯率）
          ↓
使用者輸入持倉數量（或從 localStorage 讀取）
          ↓
  計算各標的市值 → 加總淨資產（房貸為負值）
          ↓
點「新增快照」
          ↓
Google Sheets API append（日期 / 淨資產 / 各標的市值 / 配置比例）
          ↓
任何裝置開啟頁面 → Google Sheets API 讀取所有歷史快照 → 繪製圖表
```

---

## 6. Google Sheets 資料結構

**試算表名稱**：`Wealth_Dashboard_DB`

**Sheet：snapshots**

| 欄位 | 說明 | 範例 |
|------|------|------|
| `timestamp` | ISO 8601 | `2026-04-23T10:30:00+08:00` |
| `net_assets_twd` | 淨資產（TWD） | `12500000` |
| `vt_value_twd` | VT 市值（TWD） | `3200000` |
| `bnd_value_twd` | BND 市值（TWD） | `1800000` |
| `tw0050_value_twd` | 0050 市值（TWD） | `2100000` |
| `tw006208_value_twd` | 006208 市值（TWD） | `1500000` |
| `tw2409_value_twd` | 友達市值（TWD） | `450000` |
| `cash_twd` | 現金（TWD） | `5000000` |
| `mortgage_twd` | 房貸餘額（TWD，負值） | `-1550000` |
| `usdtwd_rate` | 匯率 | `32.15` |
| `note` | 備註（選填） | `加薪後調整持倉` |

---

## 7. Yahoo Finance API 規格

**Endpoint（CORS Proxy 版）**：
```
https://query1.finance.yahoo.com/v8/finance/chart/{symbol}
```

**抓取清單**：`VT`, `BND`, `0050.TW`, `006208.TW`, `2409.TW`, `TWD=X`

**錯誤處理策略**：
- API 失敗 → 顯示「⚠ 報價載入失敗，顯示上次快照估算值」
- CORS 問題 → 使用 `https://query2.finance.yahoo.com` 備援
- 部分 Ticker 失敗 → 該欄位顯示 `---`，其餘正常運作

---

## 8. Google OAuth 2.0 設定（PKCE Flow）

純前端使用 **Authorization Code + PKCE** flow（不需 Client Secret）：

```
使用者點「連結 Google」
    ↓
生成 code_verifier + code_challenge（SHA-256）
    ↓
跳轉 Google 授權頁面（scope: spreadsheets）
    ↓
Redirect back → 解析 code → 換取 Access Token + Refresh Token
    ↓
儲存至 localStorage（加密存放）
```

**Scopes**：`https://www.googleapis.com/auth/spreadsheets`

---

## 9. 敏感資料處理策略

本專案為個人私有 Repo，以下資料**不納入版本控制**：

| 資料 | 儲存位置 | 外流風險 |
|------|---------|---------|
| `CLIENT_ID` | `index.html` 中以常數寫入（Private Repo 保護） | 中：他人可用你的 OAuth App 身分發起授權，但無法存取你的 Sheets |
| `SHEET_ID` | `index.html` 中以常數寫入 | 低：沒有 OAuth token 無法讀寫 |
| `access_token` / `refresh_token` | localStorage（`wealth_dashboard_auth`） | 高：他人可存取你的 Sheets；Token 會過期，但 Refresh Token 持續有效 |

**防護機制**：
1. GitHub Repo 設為 **Private**
2. `index.html` 不上傳至任何公開 CDN
3. OAuth Redirect URI 白名單限定（GitHub Pages URL + localhost）
4. 外流後補救：到 [Google 帳戶安全性](https://myaccount.google.com/permissions) 撤銷授權

---

## 10. 資料夾結構

```
Wealth dashboard/
│
├── index.html                  ← 最終產品（單一檔案，所有邏輯內嵌）
│
├── wealth-mockup.html          ← Phase 1 完成的 UI Mockup（靜態資料）
│
└── docs/
    └── DEVELOPMENT-PLAN.md     ← 本文件
```

---

## 11. 開發進度追蹤

### Phase 1：UI Mockup ✅ 完成

| 狀態 | 項目 |
|------|------|
| [x] | `wealth-mockup.html`：完整 UI 骨架（靜態假資料） |
| [x] | Header：時鐘 + Live 指示燈 + 報價延遲提示 |
| [x] | 淨資產卡 + 4% 法則卡（2 欄） |
| [x] | 退休模擬圖（Chart.js，三色區分）+ 滑桿 |
| [x] | 資產配置環形圖 |
| [x] | 即時報價表 + 更新持倉面板 |
| [x] | 歷史快照網格列表 |

**驗收標準**：瀏覽器開啟 `wealth-mockup.html`，所有 UI 元素正確渲染。

---

### Phase 2：Yahoo Finance 即時報價

| 狀態 | 項目 | 說明 |
|------|------|------|
| [ ] | `fetchQuotes()` | 非同步抓取 6 支 Ticker，處理 CORS |
| [ ] | `updateQuoteTable()` | 填入現價、漲跌幅（含顏色） |
| [ ] | `calcNetAssets()` | 依持倉數量 × 現價 × 匯率計算淨資產 |
| [ ] | 錯誤處理 | API 失敗 → 顯示警告 banner，不 crash |
| [ ] | 載入狀態 | 抓取中顯示 loading 動畫 |

**驗收標準**：頁面載入後自動抓取報價，淨資產卡顯示真實計算值。

---

### Phase 3：localStorage 持久化

| 狀態 | 項目 | 說明 |
|------|------|------|
| [ ] | `saveHoldings()` | 持倉數量存入 `localStorage` |
| [ ] | `loadHoldings()` | 頁面載入時自動讀取並填入 input |
| [ ] | `saveLocalSnapshot()` | 「新增快照」時同時存入本機備份 |
| [ ] | `loadLocalSnapshots()` | Google Sheets 未連結時讀取本機快照繪圖 |

**驗收標準**：填入持倉數量 → 重新整理頁面 → 數量自動還原。無網路時仍可查看本機快照。

---

### Phase 4：Google Cloud 設定（使用者自行完成）

使用者需完成以下一次性設定，完成後提供 `CLIENT_ID` 和 `SHEET_ID` 給開發作業繼續：

```
Step 1  建立 Google Sheets
        ├── 新建試算表，命名為 Wealth_Dashboard_DB
        ├── 建立 sheet tab 命名為 snapshots
        └── 取得 SHEET_ID（網址列中 /d/ 後面的長串 ID）

Step 2  Google Cloud Console
        ├── 建立新專案（例如 wealth-dashboard）
        ├── 啟用 Google Sheets API
        └── 建立 OAuth 2.0 憑證
            ├── 應用程式類型：網頁應用程式
            ├── 授權的 JavaScript 來源：https://{github-username}.github.io
            │                             http://localhost（本機用）
            ├── 授權的重新導向 URI：https://{github-username}.github.io/wealth-dashboard/
            │                        http://localhost（本機用）
            └── 取得 CLIENT_ID（格式：xxxxxxx.apps.googleusercontent.com）

Step 3  建立 GitHub Private Repo
        └── 命名建議：wealth-dashboard（或任意名稱）
```

**注意**：OAuth 憑證不需要下載 JSON 檔案，只需記錄 `CLIENT_ID`。

---

### Phase 5：Google Sheets API 整合

| 狀態 | 項目 | 說明 |
|------|------|------|
| [ ] | `authWithGoogle()` | PKCE OAuth flow，取得 tokens，存入 localStorage |
| [ ] | `refreshTokenIfNeeded()` | Access Token 過期（1 小時）自動刷新 |
| [ ] | `appendSnapshot()` | 新增快照 → `spreadsheets.values.append` |
| [ ] | `loadAllSnapshots()` | 頁面載入 → `spreadsheets.values.get` → 讀取歷史 |
| [ ] | `renderRetirementChart()` | 歷史快照（橘色）+ 模擬線（藍/綠）合併繪製 |
| [ ] | Google 連結狀態顯示 | Header 顯示連結 / 未連結狀態 + 連結按鈕 |

**驗收標準**：點「新增快照」→ Google Sheets 新增一列資料。任何裝置重新載入頁面 → 圖表顯示所有歷史快照。

---

### Phase 6：GitHub Pages 部署 + 收尾

| 狀態 | 項目 | 說明 |
|------|------|------|
| [ ] | 將 `wealth-mockup.html` 重構為 `index.html` | 整合所有 Phase 2–5 功能 |
| [ ] | 填入 `CLIENT_ID` + `SHEET_ID` 常數 | |
| [ ] | GitHub Pages 啟用 | Settings → Pages → Source: main branch |
| [ ] | OAuth redirect URI 確認 | 確認 Google Cloud Console 白名單與 Pages URL 一致 |
| [ ] | 全功能測試 | 桌機 / 手機兩端各完整走一次流程 |
| [ ] | `README.md` | 說明如何 fork 自用（需換 CLIENT_ID / SHEET_ID） |

**驗收標準**：用 GitHub Pages URL 開啟，完整功能正常，手機瀏覽器可用。

---

## 12. 首次使用流程（使用者視角）

```
Step 1  開啟頁面（GitHub Pages URL 或本機 index.html）
        │
Step 2  持倉數量
        └── 在「更新持倉」面板填入各標的數量 + 現金 + 房貸
            （自動存入 localStorage，下次開啟自動還原）
        │
Step 3  連結 Google（首次）
        ├── 點 Header 的「連結 Google」按鈕
        ├── Google 授權頁面 → 允許
        └── 自動導回頁面，顯示「已連結」
        │
Step 4  新增第一筆快照
        └── 點「新增快照」→ 當前淨資產記錄至 Google Sheets
        │
Step 5  日常使用
        └── 每月開啟頁面 → 確認持倉數量 → 新增快照 → 查看進度圖
```

---

## 13. 已知風險與應對

| 風險 | 嚴重度 | 應對方式 |
|------|--------|---------|
| Yahoo Finance API CORS 限制 | 中 | 使用 `query1` / `query2` 雙備援；失敗時顯示警告而非 crash |
| Yahoo Finance 結構改版 | 中 | 報價 parser 集中在 `parseYahooResponse()` 函式，改版只需改一處 |
| Google OAuth PKCE 在本機 `file://` 無法運作 | 低 | 本機使用 `http://localhost`（需簡易 HTTP server）或直接用 Pages URL |
| Refresh Token 存在 localStorage 被 XSS 竊取 | 低 | Private Repo + 無第三方 JS（只引入 Chart.js CDN） |
| Google Sheets API quota（100 req/100s） | 極低 | 個人使用每日寥寥幾次，遠低於限額 |
| `CLIENT_ID` 寫在 Private Repo 中 | 低 | Private Repo 保護；即使外洩，無法存取資料（需 OAuth 登入） |

---

## 14. 開發順序依賴圖

```
Phase 1（UI Mockup）✅
    │
    ├──→ Phase 2（Yahoo Finance 報價）
    │           ↓
    ├──→ Phase 3（localStorage 持久化）
    │           ↓
    │   Phase 4（使用者完成 Google Cloud 設定）
    │           ↓
    └──→ Phase 5（Google Sheets API）
                ↓
            Phase 6（部署 + 收尾）
```

Phase 2 和 Phase 3 互不依賴，可平行開發。
Phase 5 需要使用者提供 `CLIENT_ID` + `SHEET_ID` 才能實作。
Phase 6 需要 Phase 2–5 全部完成才能整合部署。

---

## 15. 合規檢查清單（完成後驗收）

- [ ] `index.html` 可直接瀏覽器開啟，無需伺服器（OAuth redirect 除外）
- [ ] 無後端、無 Node.js、無 Python 依賴
- [ ] 所有報價抓取集中在 `fetchQuotes()` 函式
- [ ] 所有 Google API 呼叫集中在 `googleSheets*.()` 函式群
- [ ] OAuth tokens 只存在 localStorage，不寫入任何外部服務
- [ ] `CLIENT_ID` / `SHEET_ID` 以具名常數宣告（`const CLIENT_ID = '...'`），不散落程式碼各處
- [ ] Yahoo Finance 解析邏輯集中，改版只需改一處
- [ ] Google Sheets 欄位定義集中（`SHEET_COLUMNS` 常數），增欄只需改一處
- [ ] 無任何 API Key 或 secret 寫死在公開可見的程式碼路徑
- [ ] 手機瀏覽器測試通過（RWD 版型）
