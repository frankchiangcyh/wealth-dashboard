# AGENTS.md — 資產戰情室（Wealth Dashboard）

> 給所有 AI Coding Agent（GitHub Copilot、Claude、Cursor、Aider、Codex 等）的權威工作規範。
> 若同 repo 內另有 `CLAUDE.md` / `.cursorrules` / `.github/copilot-instructions.md`，皆以本檔為準。

---

## 0. 語言規則（Language Policy）— 最高優先

**所有 AI 對話、可見分析摘要、註解、commit message、PR 描述一律使用繁體中文**，唯一例外是**專有名詞**，例如：

- 技術詞彙：`localStorage`、`sessionStorage`、`fetch`、`Promise`、`CORS`、`CSP`、`SHA-384`、`OAuth 2.0`、`PKCE`、`Chart.js`、`Yahoo Finance`、`Stooq`、`open.er-api.com`、`Google Sheets API`
- 符號 / 識別字：函式名、變數名、檔名、股票代號（`VT` / `BND` / `0050.TW` / `TWD=X`）
- 常見縮寫：ETF、API、URL、JSON、CSV、HTTP、DOM、UI、UX、CI、SRI

不得因對象是英文標準文件或 stack trace 就整段改用英文回覆。錯誤訊息可**原文引用**，但解釋與行動計畫仍用中文寫。

---

## 1. 專案速覽（30 秒版）

- **產品**：個人退休資產儀表板，追蹤 3,000 萬 TWD 目標、每月 7 萬投資現金流。
- **架構**：**單一** `index.html`（約 2,200 行，內嵌所有 HTML/CSS/JS），**無後端、無 build step**。下載後瀏覽器直接開啟即可用。
- **同步**：所有歷史快照存於使用者自己的 Google Sheets（OAuth PKCE 授權），跨裝置一致。
- **報價**：三層瀑布備援 —— Yahoo Finance v8 → Stooq CSV → open.er-api.com（僅補匯率）。
- **部署**：GitHub Pages 公開 repo，敏感 ID / secret 全部走執行期輸入，**原始碼零憑證**。

詳見 [docs/DEVELOPMENT-PLAN.md](docs/DEVELOPMENT-PLAN.md)。

---

## 2. 檔案地圖

```
Wealth dashboard/
├── index.html                              ← 產品主體，所有邏輯在此
├── _check.js                               ← 瀏覽器 console 執行的自動化測試
├── update-csp-hash.py                      ← 每次改 <script> 區塊後必跑
├── retirement-mc-report.html               ← Monte Carlo 報告（互動版）
├── retirement-mc-report-standalone.html    ← Monte Carlo 報告（離線版）
├── mc/
│   ├── mc_engine.py                        ← Python 退休 MC 引擎（獨立於前端）
│   └── mc-results.json                     ← MC 執行結果，供報告頁載入
└── docs/
    ├── DEVELOPMENT-PLAN.md                 ← 技術規格、資料流、Phase 進度
    ├── retirement-interview-2026-06-13.md  ← MC 引擎參數的來源訪談
    └── superpowers/                        ← 設計 spec 與計畫（lock screen 等）
```

`.claude/` 與 `*.txt` 已在 `.gitignore` 內，不應被 commit。

---

## 3. 動 `index.html` 的鐵則

### 3.1 CSP script hash 必更新

`index.html` 開頭的 CSP meta 用 `'sha384-...'` 鎖定 inline `<script>`。**任何**動到 `<script>...</script>` 區塊（含空白、換行、註解）都會使 hash 失效，瀏覽器直接拒絕執行 → 頁面白畫面。

**流程**：

```powershell
python update-csp-hash.py
```

腳本會自動計算新 SHA-384 並替換 CSP meta 內的 `'sha384-...'`。改完 `index.html` 一律先跑這行再測、再 commit。

### 3.2 CSP `connect-src` 白名單

新增任何外部網域（新 CORS proxy、新 API、新 CDN）都必須同步加進 `<meta http-equiv="Content-Security-Policy">` 的 `connect-src` / `script-src` / `img-src` 名單。忘記加 → 瀏覽器 console 出現 `Refused to connect to ...`。

### 3.3 外部 CDN 必附 SRI

`cdn.jsdelivr.net` 的 `chart.js` 與 `chartjs-plugin-annotation` 都帶 `integrity="sha384-..."` + `crossorigin="anonymous"`。升版時務必同步更新 SRI，否則瀏覽器擋載入。

### 3.4 不新增 build step / 打包工具

專案的核心價值是「下載一個檔案就能用」。**不得**引入 webpack、Vite、npm scripts、TypeScript compile 等步驟。所有 JS 必須繼續內嵌在 `index.html` 的 inline `<script>` 內或以 CDN + SRI 形式引入。

---

## 4. 報價系統（Quote Waterfall）

三層備援設計，動任何一層前先讀 `index.html` 的 `fetchQuotes()` 及其上下文（約 L780–L1130）。

| Layer | 來源 | 走 CORS Proxy | 支援標的 | 失敗時 |
|-------|------|--------------|---------|--------|
| 1 | Yahoo Finance Spark 批次 + v8 chart 補漏 | 是（雙 proxy） | 全部 6 支 | 進 Layer 2 |
| 2 | Stooq.com CSV | 是（雙 proxy） | 5 支股票（不含 `TWD=X`） | 進 Layer 3（僅 TWD=X） |
| 3 | `open.er-api.com` | 否，原生 CORS | 僅 `TWD=X` | localStorage 快取補齊 |

**已知眉角**：

- **corsproxy.io 語法**：必用 `https://corsproxy.io/?url=<encoded>`。舊寫法 `?<encoded>` 於 2026-08 起回傳 HTTP 403（Commit `b306cd8` 的修正即此案）。
- **proxy 順序**：所有 Yahoo / Stooq 請求依序嘗試 `corsproxy.io` → `api.allorigins.win`；兩者都失敗才進下一資料來源。
- **gzip 自動解壓**：Yahoo 經 proxy 有時回傳 gzip binary，`tryFetch` / `tryFetchText` 用瀏覽器原生 `DecompressionStream` 偵測 magic number `0x1f 0x8b` 並解壓，勿改壞這段。
- **Yahoo 查詢策略**：全量 Spark → 缺漏 Spark 重試一次 → v8 chart 逐支補漏並固定 `range=5d`；v7 `/quote` 已需 Crumb 認證，永久 401，**不得復活**。
- **Stooq 前收**：Stooq 單日 CSV 沒有真前收，`parseStooqCSV` 刻意回傳 `prevClose: null`；不要「順手補上」用 open 當前收，那是舊 v1 快取 bug 的成因。
- **快取版本鑰**：`LS.PRICES = 'wd_prices_v2'`。若快取 schema 再改，**必須改 v3**，否則舊裝置讀到爛資料。
- **失敗必彈 modal**：任何符號在 3 層都失敗 → `showQuoteErrorModal(missing)`，不可靜默降級為 0。

---

## 5. Google Sheets 同步 / OAuth

- 走 Authorization Code + PKCE flow。**不得**改回 Implicit flow 或把 `CLIENT_SECRET` 寫進原始碼。
- Token 儲存策略是安全設計，**不要重排**：
  - `access_token` → sessionStorage（關分頁清除）
  - `refresh_token` → localStorage（長效）
  - `CLIENT_SECRET` → sessionStorage（每次開頁手動輸入）
  - `CLIENT_ID` / `SHEET_ID` → localStorage（首次 Modal 輸入即可）
- Scopes 僅 `https://www.googleapis.com/auth/spreadsheets`，不得放大。
- Redirect URI 白名單在 Google Cloud Console 端管理，程式碼變更需同步告知使用者。

---

## 6. 測試（`_check.js`）

專案沒有 Jest / Vitest，測試以「瀏覽器 console 執行」方式進行。

**執行方式**：

1. 瀏覽器開 `index.html`
2. 開 DevTools → Console
3. 輸入 `window._runChecks()`
4. 檢視測試結果表（含純函式單元測試與瀑布備援 mock 整合測試）

**動 `parseStooqCSV` / `safeNum` / `fracYear` / `fetchQuotes` 相關程式碼後，必須跑一次 `_runChecks()` 並貼出結果**。有測試 fail → 不得交付。

---

## 7. Monte Carlo 引擎（`mc/`）

- `mc_engine.py` 是**獨立**於前端的 Python 腳本，用於產生退休模擬報告。
- 參數的來源真理是 [docs/retirement-interview-2026-06-13.md](docs/retirement-interview-2026-06-13.md)。**改任何預設值必須在 diff 說明中引用訪談章節**（例如 `L644–L654`、`Q2 修正`），不得憑感覺調整。
- 執行輸出寫入 `mc/mc-results.json`，供 `retirement-mc-report*.html` 讀取。
- 隨機種子 `SEED = 20260622` 是可重現性的基石，**不得改成隨機**。
- 路徑數 `N_PATHS = 10_000` 若要調，需在 PR 描述附「為什麼」與對關鍵百分位（P10 / P50 / P90）的影響評估。

---

## 8. Commit / PR 慣例

- 訊息用中文（首行可保留 conventional commits 前綴：`fix:` / `feat:` / `docs:` / `refactor:` / `style:` / `chore:`）。
- 首行 ≤ 72 字元；正文可加英文技術術語。
- 動到 `index.html` 的 `<script>` 區塊 → **同一 commit** 必須包含 `update-csp-hash.py` 產生的新 hash。分開 commit 會讓中間狀態白畫面。
- 動到報價 / OAuth / Sheets 同步邏輯 → PR 描述必寫「已在瀏覽器實測 `_runChecks()` 全綠 + 手動 refresh 一次成功取得 6 支報價」。
- 動到 MC 引擎 → 附一次 `python mc_engine.py` 執行後 `mc-results.json` 的 P10/P50/P90 前後比對。

---

## 9. 安全與隱私（Public Repo 前提）

- **零憑證原則**：`CLIENT_ID` / `SHEET_ID` / `CLIENT_SECRET` / any token — 一律**不得**寫進原始碼、註解、範例、測試 fixture、markdown 或 commit message。
- **零 PII 原則**：使用者的實際淨資產、持股數、房貸餘額、退休日期等**個資**不得出現在原始碼、範例或提交紀錄。若要展示，用明顯的假資料（例如 `12345678`）。
- CSP 是主要 XSS 防線，**不得**放寬到 `'unsafe-inline'` 給 script（style 的 `'unsafe-inline'` 是既有妥協，不再擴大）。
- CDN 外部腳本 100% 帶 SRI，不接受無 integrity 的 `<script src>`。
- 遇到疑似 secret 洩漏 → 立即停止動作，通知使用者到 [Google 帳戶授權](https://myaccount.google.com/permissions) 撤銷。

---

## 10. 常見 AI 誤區（真實踩過的坑，勿再犯）

1. **改 `<script>` 忘更新 CSP hash** → 頁面白畫面。動 script 一定跑 `python update-csp-hash.py`。
2. **把 `CLIENT_SECRET` 塞回原始碼「方便測試」** → 立即回退，本 repo 是 Public。
3. **新增 CORS proxy 忘加 `connect-src`** → console 出 `Refused to connect`，功能靜默壞掉。
4. **用「合理猜測」寫 Stooq 前收** → parseStooqCSV 早就故意回 `null`，勿當 bug 修。
5. **改快取 schema 沒 bump `LS.PRICES` 版本** → 舊裝置讀到不相容資料。
6. **在 Yahoo v8 用 `range=1d`** → 回 gzip 但缺前收；固定用 `range=5d`。
7. **把 UI 文字或 log 改成英文** → 本專案 UI 全繁中，違反 §0 語言規則。
8. **「先寫 TODO 待補」放進 commit** → 除非明確標 `// TODO(name):` 且在 PR 描述交代 follow-up。
9. **引入 npm / build step 只為了「更好維護」** → 直接違反 §3.4，會被回退。
10. **改參數不引用訪談章節**（MC 引擎） → PR 會被打回。

---

## 11. 交付前自檢清單（Delivery Checklist）

動任何非文件變更，交付訊息內必包含以下 5 點的實測結果：

- [ ] `python update-csp-hash.py` 已跑（若動了 `<script>`）
- [ ] 瀏覽器開 `index.html` 無 CSP 錯誤、無紅字 console error
- [ ] `window._runChecks()` 全綠（若動了被 `_check.js` 覆蓋的函式）
- [ ] 手動 refresh 一次，6 支報價全綠、無錯誤 modal（若動了報價路徑）
- [ ] `git diff --stat` 只包含預期檔案，沒有意外的 `.claude/` / `*.txt` / 大檔

若某項不適用，明說「不適用，因為 XXX」，不得留白。

---

## 12. 參考文件

- [docs/DEVELOPMENT-PLAN.md](docs/DEVELOPMENT-PLAN.md) — 完整技術規格與資料流
- [docs/retirement-interview-2026-06-13.md](docs/retirement-interview-2026-06-13.md) — MC 引擎參數的來源訪談
- [docs/superpowers/](docs/superpowers/) — 設計 spec 與計畫（如 lock screen）
