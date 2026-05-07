# 鎖定畫面設計規格書

> 版本：1.0｜日期：2026-05-07｜狀態：已核准

---

## 1. 背景與動機

專案已改為 Public Repo，原始碼公開。雖然所有憑證已移出原始碼，但任何人只要知道 GitHub Pages URL 就能直接看到完整的財務數字（淨資產、持倉、快照歷史）。

本功能在 App 層加入密碼保護，使未授權者無法看到財務內容，同時保持 OAuth 流程與既有功能不受影響。

---

## 2. 設計目標

1. **未解鎖前內容完全不可見**：頁面載入時儀表板 DOM 以 CSS 隱藏，鎖定畫面覆蓋全頁
2. **關分頁重新鎖定**：解鎖狀態存 sessionStorage，關分頁即清除
3. **閒置 30 分鐘自動鎖定**：任何滑鼠/鍵盤操作重置計時器
4. **手動立即鎖定**：Header 右側 🔒 鎖定按鈕
5. **OAuth redirect 相容**：Google 授權後跳回時，需先解鎖才能繼續 OAuth callback
6. **零後端**：密碼僅在瀏覽器本地驗證，不傳送至任何伺服器

---

## 3. 儲存設計

| 鍵名 | 儲存位置 | 值 | 說明 |
|------|---------|-----|------|
| `wd_lock_hash` | localStorage | SHA-256 hex 字串 | 密碼雜湊，跨 session 持久 |
| `wd_unlocked` | sessionStorage | `"1"` | 解鎖旗標，關分頁即清除 |

**密碼 hash 計算方式**：`SubtleCrypto.digest('SHA-256', TextEncoder.encode(password))` → hex string

---

## 4. 畫面狀態機

```
App 啟動
    │
    ├─ localStorage['wd_lock_hash'] 不存在
    │       → 顯示「首次設定密碼」畫面
    │         輸入兩次密碼 → 確認一致 → 存 hash → sessionStorage 標記已解鎖
    │         → 隱藏鎖定層，顯示儀表板，繼續 init()
    │
    └─ localStorage['wd_lock_hash'] 存在
            ├─ sessionStorage['wd_unlocked'] === '1'
            │       → 已解鎖（同分頁重載）
            │         → 隱藏鎖定層，顯示儀表板，繼續 init()
            │
            └─ sessionStorage['wd_unlocked'] 不存在
                    → 顯示「輸入密碼解鎖」畫面
                      輸入密碼 → hash 比對
                      ├─ 正確 → sessionStorage 標記已解鎖 → 繼續 init()
                      └─ 錯誤 → 紅色錯誤提示，清空 input，重新輸入

手動鎖定（Header 🔒 按鈕）
    → 清除 sessionStorage['wd_unlocked']
    → 清除閒置計時器
    → 顯示鎖定層

閒置 30 分鐘
    → 與手動鎖定相同流程
```

---

## 5. UI 規格

### 5.1 鎖定層結構

```html
<div id="lock-screen">            <!-- position:fixed; inset:0; z-index:9999; background:#0d1117 -->
  <div class="lock-logo">⚡ 資產戰情室</div>
  <div class="lock-subtitle">個人退休資產追蹤儀表板</div>
  <div class="lock-box">
    <!-- 首次設定 或 解鎖輸入（JS 切換顯示） -->
  </div>
</div>
```

頁面載入時若需鎖定：`document.body` 加上 `class="locked"`（CSS 隱藏儀表板內容），`#lock-screen` 顯示。

### 5.2 首次設定密碼（`lock-box` 內容 A）

- 標題：`🔐 設定解鎖密碼`
- 說明：密碼僅在瀏覽器本地驗證，不傳送至任何伺服器
- 輸入欄 1：`設定密碼`（type=password）
- 輸入欄 2：`再次輸入確認`（type=password）
- 按鈕：`設定並進入儀表板`
- 兩次輸入不一致時：輸入框變紅色邊框 + 錯誤提示文字
- 底部提示：`密碼以 SHA-256 雜湊儲存於 localStorage｜忘記密碼？清除 localStorage 後重新設定`

### 5.3 解鎖畫面（`lock-box` 內容 B）

- 標題：`🔒 輸入密碼解鎖`
- 說明：`儀表板已鎖定。輸入密碼繼續。`
- 輸入欄：`輸入密碼`（type=password，autofocus，Enter 鍵觸發解鎖）
- 按鈕：`🔓 解鎖`
- 密碼錯誤：紅色 banner `⚠ 密碼錯誤，請再試一次` + input 紅框 + 清空輸入
- 底部提示：`按 Enter 可直接解鎖｜忘記密碼？清除 localStorage 後重新設定`

### 5.4 眼睛圖示（顯示/隱藏密碼）

所有密碼輸入欄右側加入 👁 切換按鈕，點擊在 `type=password` 與 `type=text` 間切換。

### 5.5 Header 鎖定按鈕

位置：Header 右側，時鐘左側。

```html
<button id="btn-lock" class="btn-lock">🔒 鎖定</button>
```

樣式：平時為灰色（與其他 header 按鈕一致），hover 時邊框變紅、文字變紅（`#f85149`）。

---

## 6. 閒置計時器規格

```javascript
const IDLE_MS = 30 * 60 * 1000;  // 30 分鐘
let idleTimer = null;

function resetIdleTimer() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(lockApp, IDLE_MS);
}

// 監聽事件：mousemove, keydown, click, touchstart, scroll
// 監聽對象：document（捕獲階段）
// 解鎖後啟動，鎖定時停止
```

計時器**只在解鎖狀態下運作**。鎖定後清除計時器，解鎖後重新啟動。

---

## 7. OAuth Redirect 相容性

Google 授權後跳回帶有 `?code=...`，此時頁面需先解鎖才能執行 `handleOAuthCallback(code)`。

**處理方式**：
1. 頁面載入時，先判斷鎖定狀態
2. 若需要解鎖，先顯示解鎖畫面
3. 解鎖成功後，`init()` 內的 OAuth callback 檢查照常執行（URL 中的 `?code=` 仍在）
4. Google 的 `code` 有效期約 10 分鐘，正常解鎖操作不影響

---

## 8. CSS 隱藏機制

```css
/* 鎖定時隱藏整個儀表板 */
body.locked > *:not(#lock-screen) {
  visibility: hidden;
}
```

使用 `visibility:hidden`（而非 `display:none`）確保 DOM 結構與尺寸保留，解鎖後不需重新計算 layout。

---

## 9. 函式清單

| 函式 | 說明 |
|------|------|
| `hashPassword(pwd)` | `SubtleCrypto` SHA-256，回傳 hex string（async） |
| `isLockEnabled()` | 檢查 `localStorage['wd_lock_hash']` 是否存在 |
| `isUnlocked()` | 檢查 `sessionStorage['wd_unlocked'] === '1'` |
| `showLockScreen()` | 顯示鎖定層，`body.classList.add('locked')` |
| `hideLockScreen()` | 隱藏鎖定層，`body.classList.remove('locked')` |
| `lockApp()` | 清除 sessionStorage 解鎖旗標，停止閒置計時器，顯示鎖定層 |
| `unlockApp()` | 設定 sessionStorage 解鎖旗標，隱藏鎖定層，啟動閒置計時器 |
| `confirmSetPassword()` | 驗證兩次輸入一致 → hash → 存 localStorage → 呼叫 unlockApp() |
| `confirmUnlock()` | hash 輸入密碼 → 比對 → 成功呼叫 unlockApp()，失敗顯示錯誤 |
| `resetIdleTimer()` | 清除並重新設定 30 分鐘計時器 |
| `startIdleWatch()` | 綁定 document 事件監聽器，啟動計時器 |
| `stopIdleWatch()` | 移除事件監聽器，清除計時器 |

---

## 10. init() 整合

```javascript
(async function init() {
  // ── 鎖定畫面事件綁定（必須在 return 之前完成）──────────────
  // 無論是否已解鎖，這些按鈕都需要可用
  document.getElementById('btn-set-password') .addEventListener('click', confirmSetPassword);
  document.getElementById('btn-unlock')        .addEventListener('click', confirmUnlock);
  document.getElementById('btn-lock')          .addEventListener('click', lockApp);
  document.getElementById('lock-pw-input')     .addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmUnlock();
  });

  // ── 鎖定狀態檢查 ───────────────────────────────────────────
  // 條件：尚未解鎖（首次使用 → 設定畫面；已設密碼 → 輸入畫面）
  if (!isUnlocked()) {
    showLockScreen();   // 內部依 isLockEnabled() 決定顯示設定或解鎖畫面
    return;             // 暫停 init，解鎖後由 unlockApp() 重新呼叫 init()
  }
  hideLockScreen();
  startIdleWatch();

  // ... 原有的 init 邏輯（token 遷移、loadSnapshots、fetchQuotes 等）
})();
```

**注意**：鎖定畫面的事件綁定放在 `init()` 最頂端，確保即使後續 `return` 提前離開，按鈕仍可使用。

解鎖後，`unlockApp()` 呼叫 `init()` 重新執行完整初始化流程（第二次執行時 `isUnlocked()` 為 true，跳過鎖定畫面直接繼續）。

---

## 11. 測試規格（_check.js 新增）

| 測試 | 輸入 | 預期 |
|------|------|------|
| `hashPassword('abc')` | 字串 | 64 位 hex string |
| `hashPassword('')` | 空字串 | 64 位 hex string（不同於非空） |
| `isLockEnabled()` | localStorage 有 `wd_lock_hash` | `true` |
| `isUnlocked()` | sessionStorage 有 `wd_unlocked='1'` | `true` |
| `isUnlocked()` | sessionStorage 無此鍵 | `false` |

---

## 12. 檔案異動清單

| 檔案 | 類型 | 說明 |
|------|------|------|
| `index.html` | 修改 | 新增 lock-screen HTML、CSS、JS 函式，修改 init() |
| `_check.js` | 修改 | 新增 hashPassword / isLockEnabled / isUnlocked 單元測試 |
| `docs/DEVELOPMENT-PLAN.md` | 修改 | 新增 Phase 9 鎖定畫面 |
