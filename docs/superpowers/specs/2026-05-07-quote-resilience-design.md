# 報價韌性設計規格書

> 版本：1.0｜日期：2026-05-07｜狀態：已核准

---

## 1. 背景與動機

Yahoo Finance 公開 API 在 2024 年底起出現兩個根本性問題：

| 問題 | 現象 | 根因 |
|------|------|------|
| v7 `/quote` 全面 401 | 所有 CORS proxy 均無法繞過 | Yahoo 要求 Crumb Cookie 認證 |
| v8 `/chart` gzip binary | `JSON.parse` 拋 SyntaxError | corsproxy 不解壓 `Content-Encoding: gzip` |

目前已修正 gzip 解壓問題（使用 `DecompressionStream`）。本規格進一步增加多層備援來源，並在任何標的失敗時以視覺 Modal 明確通知使用者。

---

## 2. 設計目標

1. **零 API Key**：所有備援來源皆為公開免費服務，無需使用者申請帳號
2. **瀑布式備援**：Source 1 → Source 2 → Source 3，每層只補前層失敗的符號
3. **任一失敗即通知**：任何符號在全部 3 層後仍取不到，立即彈出 Modal
4. **不可靜默失敗**：報價錯誤必須明確知道，Modal 需手動關閉
5. **快取保底**：全部來源失敗時，使用 localStorage 上次快取值維持可用性

---

## 3. 資料來源規格

### Source 1：Yahoo Finance v8（主要）

| 項目 | 值 |
|------|----|
| URL | `https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=5d` |
| CORS proxy | `corsproxy.io` |
| 回應格式 | JSON（可能 gzip，由 `tryFetch` 自動解壓） |
| 支援符號 | 全部 6 支（VT、BND、0050.TW、006208.TW、2409.TW、TWD=X） |
| 現價欄位 | `chart.result[0].meta.regularMarketPrice` |
| 漲跌欄位 | `meta.chartPreviousClose`（計算差值） |

### Source 2：Stooq.com CSV（第一備援）

| 項目 | 值 |
|------|----|
| URL | `https://stooq.com/q/l/?s={stooqSymbol}&f=sd2t2ohlcv&h&e=csv` |
| CORS proxy | `corsproxy.io` |
| 回應格式 | CSV 文字（第一行為標題，第二行為資料） |
| 支援符號 | VT、BND、0050.TW、006208.TW、2409.TW（**不含 TWD=X**） |
| 現價欄位 | CSV 第 7 欄（Close） |
| 漲跌欄位 | CSV 第 4 欄（Open）計算差值 |

**Stooq 符號對照表：**

| Yahoo Symbol | Stooq Symbol |
|-------------|-------------|
| `VT` | `vt.us` |
| `BND` | `bnd.us` |
| `0050.TW` | `0050.tw` |
| `006208.TW` | `006208.tw` |
| `2409.TW` | `2409.tw` |

### Source 3：Open Exchange Rates（匯率專用備援）

| 項目 | 值 |
|------|----|
| URL | `https://open.er-api.com/v6/latest/USD` |
| CORS proxy | **不需要**（原生支援 CORS） |
| 回應格式 | JSON |
| 支援符號 | 僅 `TWD=X` |
| 匯率欄位 | `rates.TWD` |
| 限制 | 每月 1500 次免費（個人使用遠低於上限） |

---

## 4. fetchQuotes 流程

```
fetchQuotes()
  │
  ├─ 初始化 missing = 全部 6 支符號的 Set
  │
  ├─ Layer 1：Yahoo Finance v8（平行抓取全部 missing）
  │   fetchYahooTicker(sym) × N 個，Promise.all
  │   → 成功的從 missing 移除，更新 prices / changes
  │   → 失敗的留在 missing
  │
  ├─ Layer 2：Stooq CSV（只處理 missing ∩ Stooq支援的符號，平行）
  │   fetchStooqTicker(sym) × M 個，Promise.all
  │   → 成功的從 missing 移除，更新 prices / changes
  │   → 失敗的留在 missing
  │
  ├─ Layer 3：Open ER API（只在 'TWD=X' ∈ missing 時觸發）
  │   fetchExchangeRate()
  │   → 成功 → 從 missing 移除，更新 prices.usdtwd
  │
  └─ 結果判定
      ├─ missing.size === 0 → setQuoteStatus('ok')，存快取
      ├─ missing.size > 0   → showQuoteErrorModal(missing)
      │                        setQuoteStatus('partial', missing)
      └─ prices 全為預設值  → 讀 localStorage 快取（最後保底）
```

---

## 5. 錯誤 Modal 規格

### 觸發條件
任何符號在全部 3 層 source 均失敗後，立即呼叫 `showQuoteErrorModal(missingSymbols)`。

### 視覺設計
```
┌─ modal-overlay（半透明深色遮罩，覆蓋全畫面）─────────────────┐
│                                                              │
│  ┌─ modal-box（中央卡片，黃色邊框）──────────────────────┐   │
│  │                                              [✕ 關閉] │   │
│  │  ⚠ 部分報價無法取得                                   │   │
│  │                                                       │   │
│  │  以下標的在所有來源均取得失敗：                        │   │
│  │    • VT                                               │   │
│  │    • TWD=X（匯率）                                    │   │
│  │                                                       │   │
│  │  淨資產顯示將使用上次快取值（HH:MM 更新）。            │   │
│  │                                                       │   │
│  │                          [🔄 重新嘗試]  [✕ 關閉]      │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 行為規則
| 規則 | 說明 |
|------|------|
| 不可點背景關閉 | `modal-overlay` 點擊無效（防止誤關） |
| 不自動消失 | 需手動點 ✕ 或「重新嘗試」 |
| 不重複疊加 | 再次失敗時更新現有 modal 內容，不新增第二個 |
| 重新嘗試 | 呼叫 `fetchQuotes()`，成功後自動關閉 modal |

### DOM 結構
沿用現有 `secret-modal` 樣式，新增 `id="quote-error-modal"` 區塊。

---

## 6. 測試規格（_check.js）

### 純函式單元測試

| 測試函式 | 輸入 | 預期輸出 |
|---------|------|---------|
| `parseStooqCSV(csv)` | 合法 CSV 字串 | `{price, open, prevClose}` |
| `parseStooqCSV('')` | 空字串 | `null` |
| `parseStooqCSV('N/D,...')` | Stooq 無資料標記 | `null` |
| `safeNum('abc', 0, 100)` | 非數字字串 | `0` |
| `safeNum('1e20', 0, 100)` | 超出上限 | `100` |
| `fracYear('2026/05/07')` | 日期字串 | `≈ 2026.35` |
| `fracYear('2026-05-07')` | 連字號格式 | 與上相同 |

### 整合測試（mock fetch）

| 場景 | Yahoo | Stooq | ER API | 預期結果 |
|------|-------|-------|--------|---------|
| 全部成功 | ✅ 6/6 | — | — | status='ok', modal 不出現 |
| Yahoo 部分失敗 | ✅ 4/6 | ✅ 補 1 | ✅ 補 1 | status='ok', modal 不出現 |
| Yahoo 全失敗 + Stooq 成功 | ❌ | ✅ 5/5 | ✅ 1 | status='ok', modal 不出現 |
| TWD=X 全失敗 | ✅ 5/5 | ✅ 0（不含匯率） | ❌ | modal 出現（TWD=X 失敗） |
| 全部失敗 | ❌ | ❌ | ❌ | modal 出現（全部失敗），讀快取 |

### 手動驗證入口
`index.html` 載入後，在 Console 執行 `window._runChecks()` 輸出測試結果。

---

## 7. CSP 更新需求

新增 `open.er-api.com` 到 `connect-src`：

```html
connect-src https://query1.finance.yahoo.com
            https://query2.finance.yahoo.com
            https://stooq.com
            https://corsproxy.io
            https://open.er-api.com
            https://oauth2.googleapis.com
            https://sheets.googleapis.com
            https://accounts.google.com;
```

注意：移除 `https://api.allorigins.win`（已確認逾時，無用）。

---

## 8. DEVELOPMENT-PLAN.md 更新範圍

| 章節 | 更新內容 |
|------|---------|
| 第 2 節（技術決策） | 報價來源改為「三層備援（Yahoo + Stooq + Open ER）」 |
| 第 7 節（Yahoo API 規格） | 擴充為「多來源報價規格」，加入 Stooq 和 ER API 規格 |
| 第 11 節（開發進度） | Phase 2 所有項目標記完成，新增 Phase 7 韌性升級 |
| 第 13 節（已知風險） | Yahoo API 風險嚴重度由「中」降至「低」 |

---

## 9. 檔案異動清單

| 檔案 | 異動類型 | 說明 |
|------|---------|------|
| `index.html` | 修改 | 新增 Stooq/ER fetcher，重構 fetchQuotes，新增 quote-error-modal HTML+JS |
| `index.html` | 修改 | CSP 加入 stooq.com、open.er-api.com |
| `_check.js` | 修改 | 新增單元測試與整合測試 |
| `docs/DEVELOPMENT-PLAN.md` | 修改 | 更新技術決策、API 規格、進度追蹤 |
| `update-csp-hash.py` | 無需改動 | 已可自動更新 hash |
