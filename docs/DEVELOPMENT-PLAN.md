# 資產戰情室 — 開發計畫書

> 版本：1.2｜更新日期：2026-05-07｜架構：單一 index.html，無後端

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
| 即時報價 | 三層備援：Yahoo Finance v8 → Stooq.com CSV → open.er-api.com | 零 API Key，任一來源失敗自動切換 |
| 資料儲存 | Google Sheets API v4 | 跨裝置同步、免費、可直接檢視 |
| 認證 | Google OAuth 2.0（PKCE flow） | 只有本人能存取；純前端可用 |
| 部署 | GitHub Pages（Public Repo） | 靜態托管，HTTPS 免費，支援 OAuth redirect；敏感 ID 已移出原始碼 |
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

## 7. 多來源報價規格（三層備援）

### Layer 1：Yahoo Finance v8（主要）

| 項目 | 值 |
|------|----|
| Endpoint | `https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=5d` |
| CORS proxy | `corsproxy.io` |
| 回應格式 | JSON（可能 gzip，`tryFetch` 自動偵測解壓） |
| 支援標的 | 全部 6 支（VT、BND、0050.TW、006208.TW、2409.TW、TWD=X） |
| 現價欄位 | `chart.result[0].meta.regularMarketPrice` |
| 前收欄位 | `meta.chartPreviousClose`（計算漲跌幅） |
| 已棄用 | v7 `/quote` 自 2024 年起需 Crumb Cookie 認證 → 永久 401 |

### Layer 2：Stooq.com CSV（第一備援）

| 項目 | 值 |
|------|----|
| Endpoint | `https://stooq.com/q/l/?s={stooqSymbol}&f=sd2t2ohlcv&h&e=csv` |
| CORS proxy | `corsproxy.io` |
| 回應格式 | CSV 文字（`tryFetchText` 取得，`parseStooqCSV` 解析） |
| 支援標的 | VT、BND、0050.TW、006208.TW、2409.TW（**不含 TWD=X**） |
| 現價欄位 | CSV 第 7 欄（Close，0-indexed = col 6） |
| 前收估算 | CSV 第 4 欄（Open，0-indexed = col 3） |

**Stooq 符號對照**：`VT→vt.us`、`BND→bnd.us`、`0050.TW→0050.tw`、`006208.TW→006208.tw`、`2409.TW→2409.tw`

### Layer 3：open.er-api.com（匯率專用）

| 項目 | 值 |
|------|----|
| Endpoint | `https://open.er-api.com/v6/latest/USD` |
| CORS proxy | **不需要**（原生支援 CORS） |
| 支援標的 | 僅 `TWD=X` |
| 匯率欄位 | `rates.TWD` |
| 限制 | 每月 1500 次免費 |

### 流程與錯誤處理

- **瀑布式**：Layer 1 平行全取 → Layer 2 補失敗的非匯率標的 → Layer 3 補 TWD=X
- **快取保底**：全層失敗的符號從 localStorage 快取補齊
- **Modal 通知**：任何符號在全 3 層均失敗 → `showQuoteErrorModal(missing)` 彈出，列出失敗標的，不可靜默失敗
- **不重複疊加**：再次失敗時更新現有 modal 內容，不新增第二個

---

## 8. Google OAuth 2.0 設定（PKCE Flow）

純前端使用 **Authorization Code + PKCE** flow：

```
使用者點「連結 Google」
    ↓
⚙ 設定 Modal（首次）：輸入 CLIENT_ID + SHEET_ID → 存入 localStorage
    ↓
🔑 密鑰 Modal：輸入 CLIENT_SECRET → 存入 sessionStorage（關分頁即清除）
    ↓
生成 code_verifier + code_challenge（SHA-256）→ code_verifier 存 localStorage（PKCE 暫存）
    ↓
跳轉 Google 授權頁面（scope: spreadsheets）
    ↓
Redirect back → 解析 ?code= → 換取 Access Token + Refresh Token
    ↓
access_token  → sessionStorage（短效，關分頁清除）
refresh_token → localStorage（長效，自動換新 access_token）
```

**Scopes**：`https://www.googleapis.com/auth/spreadsheets`

**Token 儲存策略**：

| Token | 儲存位置 | 生命週期 | 理由 |
|-------|---------|---------|------|
| `access_token` | sessionStorage | 關分頁即清除 | 短效憑證，降低竊取視窗 |
| `refresh_token` | localStorage | 跨 session 持久 | 長效，讓使用者不需每天重新登入 |
| `CLIENT_SECRET` | sessionStorage | 關分頁即清除 | 每次開頁手動輸入，不寫死於原始碼 |
| `CLIENT_ID` | localStorage | 跨 session 持久 | 非憑證，首次設定後不需重複輸入 |
| `SHEET_ID` | localStorage | 跨 session 持久 | 非憑證，首次設定後不需重複輸入 |

---

## 9. 敏感資料處理策略

本專案為 **Public Repo**，所有憑證均已移出原始碼。

| 資料 | 儲存位置 | 是否在原始碼 | 外流風險 |
|------|---------|------------|---------|
| `CLIENT_SECRET` | sessionStorage（使用者每次開頁手動輸入） | ❌ 從未 | 極低：關分頁即自動清除 |
| `access_token` | sessionStorage | ❌ 從未 | 低：1 小時過期，關分頁清除 |
| `refresh_token` | localStorage | ❌ 從未 | 中：長效，但 CSP 防 XSS 注入 |
| `CLIENT_ID` | localStorage（首次設定 Modal 輸入） | ❌ 已移除 | 低：無法獨立取得資料 |
| `SHEET_ID` | localStorage（首次設定 Modal 輸入） | ❌ 已移除 | 低：無 OAuth token 無法讀寫 |

**防護機制**：
1. 所有憑證與 ID **不寫死於原始碼**，透過執行期 Modal 輸入
2. Git 歷史已全數清除（孤兒分支重建），舊版本含憑證的 commit 不存在
3. CSP 嚴格限制：inline script 用 SHA-384 鎖定，外部腳本僅 cdn.jsdelivr.net
4. CDN 腳本有 SRI `integrity` 屬性防竄改
5. OAuth Redirect URI 白名單限定（GitHub Pages URL + localhost）
6. 外流後補救：到 [Google 帳戶安全性](https://myaccount.google.com/permissions) 撤銷授權

**v2→v3 遷移機制**（舊裝置自動升級）：
- `localStorage['wd_tokens']` → 拆分至 sessionStorage（access_token）+ localStorage（refresh_token）
- `localStorage['wd_client_secret']` → 自動搬移至 sessionStorage 並刪除 localStorage 副本

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

### Phase 2：Yahoo Finance 即時報價 ✅ 完成

| 狀態 | 項目 | 說明 |
|------|------|------|
| [x] | `fetchQuotes()` | 非同步抓取 6 支 Ticker，處理 CORS |
| [x] | `updateQuoteTable()` | 填入現價、漲跌幅（含顏色） |
| [x] | `calcNetAssets()` | 依持倉數量 × 現價 × 匯率計算淨資產 |
| [x] | 錯誤處理 | API 失敗 → 顯示警告 banner，不 crash |
| [x] | 載入狀態 | 抓取中顯示 loading 動畫 |

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
| [x] | ~~填入 `CLIENT_ID` + `SHEET_ID` 常數~~ | 已改為執行期 Modal 輸入，不寫死於原始碼 |
| [ ] | GitHub Pages 啟用 | Settings → Pages → Source: main branch |
| [ ] | OAuth redirect URI 確認 | 確認 Google Cloud Console 白名單與 Pages URL 一致 |
| [ ] | 全功能測試 | 桌機 / 手機兩端各完整走一次流程 |
| [ ] | `README.md` | 說明首次使用如何輸入 CLIENT_ID / SHEET_ID / CLIENT_SECRET |

**驗收標準**：用 GitHub Pages URL 開啟，完整功能正常，手機瀏覽器可用。

---

### Phase 7：報價韌性升級 ✅ 完成（2026-05-07）

| 狀態 | 項目 | 說明 |
|------|------|------|
| [x] | gzip 自動解壓 | `DecompressionStream('gzip')` 偵測 magic bytes 解壓 |
| [x] | Layer 2 Stooq 備援 | `fetchStooqTicker` + `parseStooqCSV` + `STOOQ_MAP` |
| [x] | Layer 3 Open ER 備援 | `fetchExchangeRate`，僅 TWD=X，無需 CORS proxy |
| [x] | `applyTickerData` 共用 | DRY 化 prices/changes 寫入，三層共用同一函式 |
| [x] | 三層瀑布 `fetchQuotes` | missing Set 追蹤、平行請求、逐層補齊 |
| [x] | 報價錯誤 Modal | 列出失敗標的、快取時間提示、重試按鈕、不可靜默失敗 |
| [x] | `setQuoteStatus('partial')` | 部分失敗狀態燈號，不重複觸發 alert banner |
| [x] | CSP 更新 | 加入 `stooq.com`、`open.er-api.com`，移除 `api.allorigins.win` |
| [x] | `_check.js` 測試 | 單元測試（parseStooqCSV、safeNum、fracYear）+ 整合測試（mock fetch） |

**驗收標準**：Console 執行 `window._runChecks()` 全部通過；Yahoo 失敗時自動切 Stooq；TWD=X 失敗時自動切 Open ER；任何符號全層失敗時彈出 Modal。

---

### Phase 8：資安強化 ✅ 完成（2026-05-07）

| 狀態 | 項目 | 說明 |
|------|------|------|
| [x] | CLIENT_SECRET 移至 sessionStorage | 舊版存 localStorage（v2），現改存 sessionStorage（v3），含自動遷移 |
| [x] | CLIENT_ID / SHEET_ID 移出原始碼 | 改為執行期 localStorage 輸入，首次使用由設定 Modal 引導 |
| [x] | 設定 Modal（⚙）| 首次連結 Google 時輸入兩個 ID，支援後續修改 |
| [x] | `getClientId()` / `getSheetId()` / `getSheetsApi()` getter | 取代寫死的常數，動態讀取 localStorage |
| [x] | Git 歷史清除 | 舊 30 個 commit（含敏感 ID）以孤兒分支強制覆蓋，GitHub 歷史僅存 1 個 commit |
| [x] | OAuth 錯誤日誌修正 | `console.error` 改為只記錄 `error` / `error_description`，不輸出完整 tokens 物件 |
| [x] | v1→v2 token 格式遷移 | 舊版 tokens 全存 localStorage → 拆分至 sessionStorage + localStorage |
| [x] | v2→v3 SECRET 遷移 | localStorage 殘留的 CLIENT_SECRET 自動搬至 sessionStorage 並刪除原鍵 |

**驗收標準**：原始碼中無任何 CLIENT_ID / SHEET_ID / SECRET 字面值；Public Repo 公開可見；Git log 只有 1 個 commit。

---

### Phase 9：鎖定畫面 ✅ 完成（2026-05-07）

| 狀態 | 項目 | 說明 |
|------|------|------|
| [x] | CSS：body.locked + lock-screen 樣式 | visibility:hidden 隱藏儀表板，z-index:9999 全頁覆蓋 |
| [x] | HTML：lock-screen（設定/解鎖兩態）| #lock-setup / #lock-unlock，JS 切換顯示 |
| [x] | HTML：Header 🔒 鎖定按鈕 | id="btn-lock"，hover 變紅 |
| [x] | JS：hashPassword | SubtleCrypto SHA-256，64 位 hex，async |
| [x] | JS：isLockEnabled / isUnlocked | 查詢 localStorage / sessionStorage 狀態 |
| [x] | JS：showLockScreen / hideLockScreen | 顯示/隱藏鎖定層，切換 body.locked |
| [x] | JS：lockApp / unlockApp | 狀態切換 + 閒置計時器控制 + init() 重啟 |
| [x] | JS：confirmSetPassword | 驗證兩次輸入 → hash → 存 LS → 解鎖 |
| [x] | JS：confirmUnlock | hash 比對 → 成功解鎖 / 失敗顯示錯誤 |
| [x] | JS：startIdleWatch / stopIdleWatch | 5 事件監聽，30 分鐘閒置自動鎖定 |
| [x] | init() 整合 | 鎖定事件先綁（一次性 flag），isUnlocked() 檢查，提前 return |
| [x] | _check.js 測試 | testLockScreen：hashPassword / isLockEnabled / isUnlocked 共 10 項 |

**驗收標準**：首次使用設定密碼 → 儀表板正常顯示；關分頁重開需重新輸入密碼；🔒 按鈕立即鎖定；閒置 30 分鐘自動鎖定；`window._runChecks()` 全部通過。

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
| Yahoo Finance API CORS 限制 | 低 | 三層備援（Yahoo → Stooq → Open ER）；任一失敗自動切換，Modal 通知 |
| Yahoo Finance 結構改版 | 低 | `fetchOneTicker` 集中 Yahoo 解析；Stooq/ER 作為長期備援，不依賴 Yahoo 單點 |
| Google OAuth PKCE 在本機 `file://` 無法運作 | 低 | 本機使用 `http://localhost`（需簡易 HTTP server）或直接用 Pages URL |
| `refresh_token` 存在 localStorage 被 XSS 竊取 | 低 | 嚴格 CSP（SHA-384 鎖定 inline script）+ SRI 防 CDN 竄改；無法注入第三方 JS |
| Google Sheets API quota（100 req/100s） | 極低 | 個人使用每日寥寥幾次，遠低於限額 |
| `CLIENT_SECRET` 存於 sessionStorage（非理想位置） | 低 | 關分頁即清除；替代方案為改用 Desktop OAuth 類型（不需 secret）|
| Public Repo 原始碼可見 | 無 | CLIENT_ID / SHEET_ID / SECRET 均不在原始碼；Git 歷史已清除 |

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
- [ ] OAuth tokens 分開存放：access_token → sessionStorage，refresh_token → localStorage
- [x] `CLIENT_ID` / `SHEET_ID` 不寫死於原始碼，透過執行期 Modal 輸入存入 localStorage
- [x] `CLIENT_SECRET` 不寫死於原始碼，透過執行期 Modal 輸入存入 sessionStorage
- [ ] Yahoo Finance 解析邏輯集中，改版只需改一處
- [ ] Google Sheets 欄位定義集中（`SHEET_COLUMNS` 常數），增欄只需改一處
- [x] 無任何 API Key 或 secret 寫死在原始碼或 Git 歷史中
- [ ] 手機瀏覽器測試通過（RWD 版型）
