# 報價 Proxy 韌性 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正 `corsproxy.io` 節流時 VT 與 2409.TW 無法補回的問題，讓報價流程以雙 proxy 與一次缺漏 Spark 重試取得完整 6 支報價。

**Architecture:** 保留單一 `index.html` 與既有三層瀑布。`tryFetch` / `tryFetchText` 依序嘗試 `corsproxy.io` 與 AllOrigins；首輪 Spark 後只對 `missing` 做一次批次 Spark 重試，仍缺漏才逐支呼叫 v8，最後維持 Stooq、Open ER、快取與錯誤 Modal 行為。

**Tech Stack:** 原生 HTML/CSS/JavaScript、Fetch API、localStorage、CSP SHA-384、瀏覽器 `_check.js` 測試。

---

## 檔案異動清單

| 檔案 | 類型 | 責任 |
|------|------|------|
| `_check.js` | 修改 | 新增截圖 shape 與雙 proxy 的 RED/GREEN 整合測試 |
| `index.html` | 修改 | 加入 AllOrigins wrapper、CSP 白名單及缺漏 Spark 批次重試 |
| `docs/DEVELOPMENT-PLAN.md` | 修改 | 同步實際 proxy 與 Layer 1 流程 |
| `AGENTS.md` | 修改 | 同步報價維護規則與 CSP 網域 |

---

### Task 1：新增截圖情境 RED 測試

**Files:**
- Modify: `_check.js` 的 `runIntegrationTests()`

- [ ] **Step 1：新增精確重現截圖 shape 的場景**

新增場景：首輪六支 Spark 只回 BND、0050.TW、006208.TW、TWD=X；`missing` 必須是 VT 與 2409.TW。第一 proxy 對缺漏 Spark 回 429，第二 proxy 回 VT 與 2409.TW。

斷言必須同時包含：

```javascript
integResults.push({ name: '截圖回歸: 6 支最終完整', ok: pricesReady === true });
integResults.push({ name: '截圖回歸: VT 已由缺漏 Spark 補回', ok: prices.vt === 110 });
integResults.push({ name: '截圖回歸: 2409.TW 已由缺漏 Spark 補回', ok: prices.auo === 15 });
integResults.push({ name: '截圖回歸: modal 不出現', ok: !modalShown });
integResults.push({ name: '截圖回歸: 不發逐支 v8 request', ok: v8RequestCount === 0 });
```

- [ ] **Step 2：執行測試並確認 RED**

啟動：

```powershell
python -m http.server 8765
```

瀏覽器載入最新版 `_check.js` 後執行：

```javascript
window._runChecks()
```

預期：新場景至少一項 FAIL，原因是目前只有一個 proxy 且沒有缺漏 Spark 重試。

- [ ] **Step 3：提交 RED 測試**

```powershell
git add _check.js
git commit -m "test: 重現報價 proxy 節流缺漏"
```

---

### Task 2：加入雙 proxy 與缺漏 Spark 重試

**Files:**
- Modify: `index.html` 的 CSP、`CORS_WRAPS`、`fetchQuotes()`

- [ ] **Step 1：在 CSP `connect-src` 加入 AllOrigins**

加入：

```text
https://api.allorigins.win
```

不得加入 `unsafe-inline` 或其他新網域。

- [ ] **Step 2：加入第二順位 wrapper**

將 wrapper 定義為：

```javascript
const CORS_WRAPS = [
  u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`
];
```

`tryFetch` 與 `tryFetchText` 沿用既有逐一嘗試、非 2xx 繼續、gzip 解壓及錯誤紀錄邏輯。

- [ ] **Step 3：首輪 Spark 後只重試 missing**

在逐支 v8 之前加入：

```javascript
if (missing.size > 0) {
  const retryTargets = [...missing];
  const retryData = await fetchYahooBatch(retryTargets);
  retryTargets.forEach(sym => {
    const data = retryData[sym];
    if (data?.price) {
      applyTickerData(sym, data.price, data.prevClose);
      missing.delete(sym);
    }
  });
}
```

逐支 v8 loop 必須讀取重試後的 `[...missing]`，不得再請求已補回的 VT 或 2409.TW。

- [ ] **Step 4：更新 CSP hash**

```powershell
python update-csp-hash.py
```

預期：顯示新 SHA-384 並更新 `index.html`。

- [ ] **Step 5：執行 GREEN 測試**

重新載入頁面與最新版 `_check.js`，執行 `window._runChecks()`。

預期：全部單元與整合測試通過；截圖回歸場景確認 VT、2409.TW 存在，Modal 不存在，v8 request 數為 0。

- [ ] **Step 6：提交產品修正**

```powershell
git add index.html _check.js
git commit -m "fix: 加入報價雙 proxy 與缺漏重試"
```

---

### Task 3：同步維護文件

**Files:**
- Modify: `docs/DEVELOPMENT-PLAN.md` 的多來源報價規格
- Modify: `AGENTS.md` 的 Quote Waterfall 與 CSP 規則

- [ ] **Step 1：同步雙 proxy 與 Layer 1A/1B/1C**

兩份文件都必須明記：

```text
proxy 順序：corsproxy.io → api.allorigins.win
Layer 1：全量 Spark → 缺漏 Spark 重試一次 → v8 逐支補漏
```

保留 Stooq 無真前收、`range=5d`、快取版本及失敗必顯示 Modal 等既有規則。

- [ ] **Step 2：檢查文件與程式一致**

```powershell
git diff --check
git diff --stat
```

預期：只有 `_check.js`、`index.html`、`docs/DEVELOPMENT-PLAN.md`、`AGENTS.md` 與本計畫檔案。

- [ ] **Step 3：提交文件**

```powershell
git add AGENTS.md docs/DEVELOPMENT-PLAN.md
git commit -m "docs: 同步報價雙 proxy 流程"
```

---

### Task 4：端到端與交付驗證

**Files:**
- Verify: `index.html`
- Verify: `_check.js`

- [ ] **Step 1：用截圖實際 shape 做頁面端到端驗證**

Playwright 攔截條件必須與 RED fixture 相同：首輪 Spark 缺 VT/2409.TW、第一 proxy 節流、第二 proxy 補回兩支。

正面斷言：6 支價格全部有效、`pricesReady === true`。

反面斷言：`quote-error-modal` 不顯示、VT/2409.TW 不殘留於錯誤清單、沒有逐支 v8 request。

- [ ] **Step 2：執行真實來源驗證**

清除測試產生的 `wd_prices_v2` 後重載一次，確認：

```text
6 支報價完整
沒有錯誤 Modal
console 無 CSP error
```

若公共 proxy 當下皆節流，需如實回報 HTTP 狀態，不得以 mock PASS 取代真實來源結果。

- [ ] **Step 3：最終靜態與 CSP 驗證**

```powershell
python update-csp-hash.py
git diff --check
git status --short
```

預期：CSP hash 相同、diff check 通過、沒有非預期檔案。

- [ ] **Step 4：交付報告**

報告必含 `_runChecks()` 通過數、截圖 shape 端到端斷言、真實來源結果、CSP 結果與 `git diff --stat`。