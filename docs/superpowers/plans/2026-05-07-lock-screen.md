# 鎖定畫面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 index.html 加入 App 層密碼鎖定，未解鎖前財務數字完全不可見，關分頁重新鎖定，閒置 30 分鐘自動鎖定。

**Architecture:** 全頁 `#lock-screen` div 以 `position:fixed; z-index:9999` 覆蓋儀表板；`body.locked` CSS 規則用 `visibility:hidden` 隱藏 lock-screen 以外的全部元素。解鎖狀態存 sessionStorage，密碼 SHA-256 hash 存 localStorage。init() 最頂端做鎖定檢查，未解鎖時提前 return，解鎖後 `unlockApp()` 重新呼叫 `init()`。

**Tech Stack:** 原生 `SubtleCrypto.digest('SHA-256')`（瀏覽器內建，無需 CDN）、sessionStorage / localStorage、setTimeout 閒置計時器。

---

## 檔案異動清單

| 檔案 | 類型 | 異動內容 |
|------|------|---------|
| `index.html` | 修改 | 新增 CSS（鎖定層樣式、body.locked）、HTML（lock-screen、header 按鈕）、JS（11 個新函式、修改 LS、修改 init()） |
| `_check.js` | 修改 | 新增 Section 5：lockScreen 單元測試（hashPassword、isLockEnabled、isUnlocked） |
| `docs/DEVELOPMENT-PLAN.md` | 修改 | 新增 Phase 9 鎖定畫面 |

---

## Task 1：LS 常數 + 純函式 + 測試

**Files:**
- Modify: `index.html`（LS 物件約第 485 行）
- Modify: `_check.js`（末尾加入 Section 5）

- [ ] **Step 1：在 `_check.js` 末尾、`window._runChecks` 之前加入 Section 5 測試函式**

在 `_check.js` 中找到 `window._runChecks = async function()` 這行（約第 363 行），在它**之前**插入：

```javascript
// ──────────────────────────────────────────────────────────
//  Section 5：lockScreen 單元測試
//  hashPassword / isLockEnabled / isUnlocked 定義於 index.html 全域
// ──────────────────────────────────────────────────────────
async function testLockScreen() {
  // 5.1 hashPassword 回傳 64 位 hex string
  const h1 = await hashPassword('abc');
  assert('hashPassword: 長度為 64', h1.length, 64);
  assert('hashPassword: 全為 hex 字元', /^[0-9a-f]{64}$/.test(h1), true);

  // 5.2 相同輸入產生相同 hash
  const h2 = await hashPassword('abc');
  assert('hashPassword: 相同輸入相同 hash', h1, h2);

  // 5.3 不同輸入產生不同 hash
  const h3 = await hashPassword('xyz');
  assert('hashPassword: 不同輸入不同 hash', h1 !== h3, true);

  // 5.4 空字串也能 hash
  const h4 = await hashPassword('');
  assert('hashPassword: 空字串長度為 64', h4.length, 64);
  assert('hashPassword: 空字串與非空不同', h4 !== h1, true);

  // 5.5 isLockEnabled：localStorage 有 wd_lock_hash 時回傳 true
  const origHash = localStorage.getItem(LS.LOCK_HASH);
  localStorage.setItem(LS.LOCK_HASH, 'test');
  assert('isLockEnabled: 有 hash 回傳 true', isLockEnabled(), true);
  localStorage.removeItem(LS.LOCK_HASH);
  assert('isLockEnabled: 無 hash 回傳 false', isLockEnabled(), false);
  if (origHash) localStorage.setItem(LS.LOCK_HASH, origHash);

  // 5.6 isUnlocked：sessionStorage 有 wd_unlocked='1' 時回傳 true
  const origUnlocked = sessionStorage.getItem(LS.UNLOCKED);
  sessionStorage.setItem(LS.UNLOCKED, '1');
  assert('isUnlocked: 值為 "1" 回傳 true', isUnlocked(), true);
  sessionStorage.removeItem(LS.UNLOCKED);
  assert('isUnlocked: 無值回傳 false', isUnlocked(), false);
  if (origUnlocked) sessionStorage.setItem(LS.UNLOCKED, origUnlocked);
}
```

- [ ] **Step 2：在 `window._runChecks` 內的單元測試區段加入 testLockScreen 呼叫**

找到（約第 370 行）：
```javascript
  try { testParseStooqCSV();} catch(e) { results.push({ name:'testParseStooqCSV（例外）', ok:false, message:e.message }); }
```
在其後插入：
```javascript
  try { await testLockScreen(); } catch(e) { results.push({ name:'testLockScreen（例外）', ok:false, message:e.message }); }
```

- [ ] **Step 3：在 `index.html` 的 LS 物件加入兩個新 key**

找到（約第 494 行）：
```javascript
  SHEET_ID:  'wd_sheet_id'        // localStorage:    Google Sheets 試算表 ID（執行期輸入，不寫死在程式碼）
};
```
改為：
```javascript
  SHEET_ID:  'wd_sheet_id',       // localStorage:    Google Sheets 試算表 ID（執行期輸入，不寫死在程式碼）
  LOCK_HASH: 'wd_lock_hash',      // localStorage:    SHA-256 密碼雜湊（跨 session 持久）
  UNLOCKED:  'wd_unlocked'        // sessionStorage:  解鎖旗標（關分頁即清除）
};
```

- [ ] **Step 4：在 `index.html` 的 `<script>` 標籤內、LS 物件之後加入三個純函式**

找到（約第 497 行）：
```javascript
// 報價自動刷新間隔：每 5 分鐘更新一次
const QUOTE_REFRESH_MS = 5 * 60 * 1000;
```
在其**之前**插入：
```javascript
// ╔══════════════════════════════════════════════════════════╗
// ║                    鎖定畫面 — 純函式                      ║
// ╚══════════════════════════════════════════════════════════╝

// SHA-256 密碼雜湊（async，使用瀏覽器內建 SubtleCrypto，不需任何 CDN）
// 回傳 64 位元組 lowercase hex string
async function hashPassword(pwd) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pwd));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// 是否已設定密碼（localStorage 有 wd_lock_hash）
function isLockEnabled() { return !!localStorage.getItem(LS.LOCK_HASH); }

// 本次 session 是否已解鎖（sessionStorage 有 wd_unlocked='1'）
function isUnlocked()    { return sessionStorage.getItem(LS.UNLOCKED) === '1'; }
```

- [ ] **Step 5：在瀏覽器開啟 index.html，Console 執行 `window._runChecks()`**

預期：Section 5 的 8 個測試全部通過（`✅`），如有 `hashPassword is not defined` 表示 Step 4 插入位置錯誤。

- [ ] **Step 6：Commit**

```bash
cd "D:\Google_Antigravity\Claude_PRJ\Wealth dashboard"
python update-csp-hash.py
git add index.html _check.js
git commit -m "feat(lock): 新增 LS 常數與純函式 hashPassword/isLockEnabled/isUnlocked"
```

---

## Task 2：CSS

**Files:**
- Modify: `index.html`（`</style>` 之前，約第 218 行）

- [ ] **Step 1：在 `</style>` 標籤（約第 219 行）之前插入鎖定畫面樣式**

找到：
```css
@media(max-width:700px){
  .grid-top{grid-template-columns:1fr;}
  .grid-bot{grid-template-columns:1fr;}
  .slider-grid{grid-template-columns:1fr;}
}
</style>
```
在 `</style>` 之前插入：
```css
/* ── 鎖定畫面 ───────────────────────────────────────────── */
/* 鎖定時以 visibility:hidden 隱藏儀表板（保留 DOM 結構與尺寸，解鎖後無需重繪） */
body.locked > *:not(#lock-screen) { visibility:hidden; }

#lock-screen {
  display:none; position:fixed; inset:0; z-index:9999;
  background:#0d1117;
  flex-direction:column; align-items:center; justify-content:center;
}
#lock-screen.show { display:flex; }

.lock-logo { font-size:32px; font-weight:700; color:#58a6ff; letter-spacing:2px; margin-bottom:6px; }
.lock-subtitle { font-size:14px; color:#8b949e; margin-bottom:40px; }

.lock-box {
  background:#161b22; border:1px solid #30363d; border-radius:16px;
  padding:36px 40px; width:360px; box-shadow:0 8px 40px rgba(0,0,0,0.5);
}
.lock-box h2 { text-align:center; font-size:18px; color:#e6edf3; margin-bottom:6px; }
.lock-box-desc { text-align:center; font-size:13px; color:#8b949e; margin-bottom:24px; line-height:1.6; }
.lock-icon { text-align:center; font-size:40px; margin-bottom:16px; }

.lock-input-wrap { position:relative; margin-bottom:16px; }
.lock-pw-input {
  width:100%; background:#0d1117; border:1px solid #30363d; border-radius:8px;
  padding:12px 44px 12px 14px; color:#e6edf3; font-size:16px; outline:none;
  transition:border-color 0.2s;
}
.lock-pw-input:focus { border-color:#58a6ff; }
.lock-pw-input.error { border-color:#f85149; }
.lock-pw-input::placeholder { color:#484f58; }
.lock-eye {
  position:absolute; right:12px; top:50%; transform:translateY(-50%);
  background:none; border:none; color:#8b949e; cursor:pointer; font-size:16px; padding:2px 4px;
}
.lock-eye:hover { color:#e6edf3; }

.lock-btn {
  width:100%; padding:12px; background:#1f6feb; color:#fff; border:none;
  border-radius:8px; font-size:16px; font-weight:600; cursor:pointer;
  transition:background 0.2s; margin-bottom:12px;
}
.lock-btn:hover { background:#388bfd; }

.lock-error {
  display:none; background:#2a1215; border:1px solid #f85149;
  color:#f85149; font-size:13px; padding:8px 12px; border-radius:6px;
  text-align:center; margin-bottom:12px;
}
.lock-error.show { display:block; }
.lock-hint { text-align:center; font-size:12px; color:#484f58; line-height:1.6; }

/* Header 鎖定按鈕（hover 變紅） */
.btn-lock {
  display:flex; align-items:center; gap:5px;
  padding:7px 14px; border-radius:6px; font-size:14px; font-weight:600;
  cursor:pointer; border:1px solid #30363d; background:#21262d;
  color:#8b949e; transition:all 0.2s; white-space:nowrap;
}
.btn-lock:hover { border-color:#f85149; color:#f85149; background:#2a1215; }
```

- [ ] **Step 2：在瀏覽器重整 index.html，確認沒有 CSS 語法錯誤（頁面正常顯示）**

- [ ] **Step 3：Commit**

```bash
python update-csp-hash.py
git add index.html
git commit -m "feat(lock): 新增鎖定畫面 CSS 樣式"
```

---

## Task 3：HTML — 鎖定層與 Header 按鈕

**Files:**
- Modify: `index.html`（`<body>` 開頭區、Header 區）

- [ ] **Step 1：在 `<div class="alert-banner"...>` 之後（約第 237 行）插入鎖定畫面 HTML**

找到：
```html
<div class="alert-banner" id="alert-banner"></div>

<!-- Secret setup modal -->
```
在兩者之間插入：
```html
<!-- 鎖定畫面：App 層密碼保護，未解鎖前儀表板以 body.locked 完全隱藏 -->
<!-- 狀態 A（#lock-setup）：首次使用，無 wd_lock_hash → 設定密碼 -->
<!-- 狀態 B（#lock-unlock）：已設密碼，sessionStorage 無解鎖旗標 → 輸入密碼 -->
<div id="lock-screen">
  <div class="lock-logo">⚡ 資產戰情室</div>
  <div class="lock-subtitle">個人退休資產追蹤儀表板</div>
  <div class="lock-box">

    <div id="lock-setup">
      <div class="lock-icon">🔐</div>
      <h2>設定解鎖密碼</h2>
      <p class="lock-box-desc">首次使用需設定密碼。<br>密碼僅在你的瀏覽器本地驗證，<br>不會傳送至任何伺服器。</p>
      <div class="lock-input-wrap">
        <input class="lock-pw-input" id="lock-pw1" type="password"
               placeholder="設定密碼" autocomplete="new-password">
        <button class="lock-eye" data-target="lock-pw1">👁</button>
      </div>
      <div class="lock-input-wrap">
        <input class="lock-pw-input" id="lock-pw2" type="password"
               placeholder="再次輸入確認" autocomplete="new-password">
        <button class="lock-eye" data-target="lock-pw2">👁</button>
      </div>
      <div class="lock-error" id="lock-setup-error"></div>
      <button class="lock-btn" id="btn-set-password">設定並進入儀表板</button>
      <div class="lock-hint">密碼以 SHA-256 雜湊儲存於 localStorage<br>忘記密碼？清除 localStorage 後重新設定</div>
    </div>

    <div id="lock-unlock" style="display:none;">
      <div class="lock-icon">🔒</div>
      <h2>輸入密碼解鎖</h2>
      <p class="lock-box-desc">儀表板已鎖定。輸入密碼繼續。</p>
      <div class="lock-error" id="lock-unlock-error"></div>
      <div class="lock-input-wrap">
        <input class="lock-pw-input" id="lock-pw-input" type="password"
               placeholder="輸入密碼" autocomplete="current-password">
        <button class="lock-eye" data-target="lock-pw-input">👁</button>
      </div>
      <button class="lock-btn" id="btn-unlock">🔓 解鎖</button>
      <div class="lock-hint">按 Enter 可直接解鎖<br>忘記密碼？清除 localStorage 後重新設定</div>
    </div>

  </div>
</div>
```

- [ ] **Step 2：在 Header 的 `<div class="timestamp" id="clock"></div>` 之前（約第 233 行）加入鎖定按鈕**

找到：
```html
    <div class="timestamp" id="clock"></div>
  </div>
</div>
```
改為：
```html
    <button class="btn-lock" id="btn-lock">🔒 鎖定</button>
    <div class="timestamp" id="clock"></div>
  </div>
</div>
```

- [ ] **Step 3：在瀏覽器重整，確認頁面正常顯示（lock-screen 不應出現，因為尚未整合 JS）**

- [ ] **Step 4：Commit**

```bash
python update-csp-hash.py
git add index.html
git commit -m "feat(lock): 新增鎖定畫面 HTML 與 Header 鎖定按鈕"
```

---

## Task 4：JS UI 函式（showLockScreen / hideLockScreen / lockApp / unlockApp / confirmSetPassword / confirmUnlock）

**Files:**
- Modify: `index.html`（在 `// ── INIT` 區段之前插入，約第 2316 行）

- [ ] **Step 1：在 `// ── INIT ───` 這行之前插入 UI 與狀態函式**

找到：
```javascript
// ── INIT ───────────────────────────────────────────────────
(async function init() {
```
在其**之前**插入：
```javascript
// ╔══════════════════════════════════════════════════════════╗
// ║                 鎖定畫面 — UI / 狀態函式                  ║
// ╚══════════════════════════════════════════════════════════╝

// 顯示鎖定層：依 isLockEnabled() 決定呈現「設定密碼」或「輸入密碼」畫面
function showLockScreen() {
  const hasHash = isLockEnabled();
  document.getElementById('lock-setup') .style.display = hasHash ? 'none'  : 'block';
  document.getElementById('lock-unlock').style.display = hasHash ? 'block' : 'none';
  document.getElementById('lock-screen').classList.add('show');
  document.body.classList.add('locked');
  // 自動 focus 對應輸入框（延遲避免 focus 在 display:none 狀態執行）
  const focusId = hasHash ? 'lock-pw-input' : 'lock-pw1';
  setTimeout(() => document.getElementById(focusId)?.focus(), 50);
}

// 隱藏鎖定層，恢復儀表板可見性
function hideLockScreen() {
  document.getElementById('lock-screen').classList.remove('show');
  document.body.classList.remove('locked');
}

// 鎖定 App：清除解鎖旗標、停止閒置計時器、顯示鎖定層
function lockApp() {
  sessionStorage.removeItem(LS.UNLOCKED);
  stopIdleWatch();
  showLockScreen();
}

// 解鎖 App：設定解鎖旗標、隱藏鎖定層、啟動閒置計時器、重新執行 init()
function unlockApp() {
  sessionStorage.setItem(LS.UNLOCKED, '1');
  hideLockScreen();
  startIdleWatch();
  init();  // 第二次執行時 isUnlocked()=true，跳過鎖定檢查，繼續完整初始化
}

// 首次設定密碼：驗證兩次輸入一致 → hash → 存 localStorage → 解鎖
async function confirmSetPassword() {
  const pw1 = document.getElementById('lock-pw1').value;
  const pw2 = document.getElementById('lock-pw2').value;
  const errEl = document.getElementById('lock-setup-error');

  // 清除上次錯誤狀態
  errEl.classList.remove('show');
  document.getElementById('lock-pw1').classList.remove('error');
  document.getElementById('lock-pw2').classList.remove('error');

  if (!pw1) {
    errEl.textContent = '請輸入密碼';
    errEl.classList.add('show');
    document.getElementById('lock-pw1').classList.add('error');
    document.getElementById('lock-pw1').focus();
    return;
  }
  if (pw1 !== pw2) {
    errEl.textContent = '⚠ 兩次輸入不一致，請重新輸入';
    errEl.classList.add('show');
    document.getElementById('lock-pw1').classList.add('error');
    document.getElementById('lock-pw2').classList.add('error');
    document.getElementById('lock-pw2').value = '';
    document.getElementById('lock-pw2').focus();
    return;
  }
  localStorage.setItem(LS.LOCK_HASH, await hashPassword(pw1));
  unlockApp();
}

// 解鎖：hash 輸入密碼 → 比對 localStorage hash → 成功/失敗
async function confirmUnlock() {
  const pw = document.getElementById('lock-pw-input').value;
  const errEl = document.getElementById('lock-unlock-error');

  errEl.classList.remove('show');
  document.getElementById('lock-pw-input').classList.remove('error');

  if (!pw) { document.getElementById('lock-pw-input').focus(); return; }

  const hash = await hashPassword(pw);
  if (hash === localStorage.getItem(LS.LOCK_HASH)) {
    document.getElementById('lock-pw-input').value = '';
    unlockApp();
  } else {
    errEl.textContent = '⚠ 密碼錯誤，請再試一次';
    errEl.classList.add('show');
    document.getElementById('lock-pw-input').classList.add('error');
    document.getElementById('lock-pw-input').value = '';
    document.getElementById('lock-pw-input').focus();
  }
}
```

- [ ] **Step 2：Commit（不含 init 整合，先保持可用狀態）**

```bash
python update-csp-hash.py
git add index.html
git commit -m "feat(lock): 新增 showLockScreen/hideLockScreen/lockApp/unlockApp/confirmSetPassword/confirmUnlock"
```

---

## Task 5：JS 閒置計時器函式

**Files:**
- Modify: `index.html`（接續 Task 4 插入的區塊，或在同一位置繼續加）

- [ ] **Step 1：在 Task 4 插入的 `confirmUnlock` 函式之後，`// ── INIT` 之前，插入閒置計時器函式**

找到（Task 4 完成後）：
```javascript
// ── INIT ───────────────────────────────────────────────────
```
在其之前插入：
```javascript
// ╔══════════════════════════════════════════════════════════╗
// ║                 鎖定畫面 — 閒置計時器                     ║
// ╚══════════════════════════════════════════════════════════╝

const IDLE_MS = 30 * 60 * 1000;   // 閒置自動鎖定門檻：30 分鐘
let   idleTimer     = null;        // setTimeout handle
let   idleListening = false;       // 是否已綁定事件監聽器

// 重設閒置計時器（任何使用者互動時呼叫）
function resetIdleTimer() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(lockApp, IDLE_MS);
}

// 儲存事件處理器參考（確保 removeEventListener 能正確移除同一個函式）
const _idleHandler = resetIdleTimer;

// 啟動閒置監聽（解鎖後呼叫）
// 監聽 mousemove / keydown / click / touchstart / scroll 的捕獲階段
function startIdleWatch() {
  if (idleListening) return;
  ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'].forEach(ev =>
    document.addEventListener(ev, _idleHandler, { capture: true, passive: true })
  );
  idleListening = true;
  resetIdleTimer();  // 解鎖當下立即開始計時
}

// 停止閒置監聽（鎖定時呼叫）
function stopIdleWatch() {
  clearTimeout(idleTimer);
  if (!idleListening) return;
  ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'].forEach(ev =>
    document.removeEventListener(ev, _idleHandler, { capture: true })
  );
  idleListening = false;
}
```

- [ ] **Step 2：Commit**

```bash
python update-csp-hash.py
git add index.html
git commit -m "feat(lock): 新增閒置計時器 startIdleWatch/stopIdleWatch/resetIdleTimer（30 分鐘）"
```

---

## Task 6：init() 整合

**Files:**
- Modify: `index.html`（init() 函式，約第 2317 行）

- [ ] **Step 1：在 init() 最頂端加入鎖定事件綁定與鎖定檢查**

找到：
```javascript
(async function init() {

  // ── 舊版 token 格式遷移（v1 → v2）───────────────────────────
```
改為：
```javascript
(async function init() {

  // ── 鎖定畫面事件綁定（必須在任何 return 之前完成）──────────
  // 這些按鈕在鎖定和解鎖狀態下都需要可用
  document.getElementById('btn-set-password')?.addEventListener('click', confirmSetPassword);
  document.getElementById('btn-unlock')       ?.addEventListener('click', confirmUnlock);
  document.getElementById('btn-lock')         ?.addEventListener('click', lockApp);
  document.getElementById('lock-pw-input')    ?.addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmUnlock();
  });
  // 眼睛圖示：切換各密碼輸入框的顯示 / 隱藏
  document.querySelectorAll('.lock-eye').forEach(btn => {
    btn.addEventListener('click', () => {
      const inp = document.getElementById(btn.dataset.target);
      if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
    });
  });

  // ── 鎖定狀態檢查 ───────────────────────────────────────────
  // 未解鎖：顯示鎖定畫面並提前返回（解鎖後 unlockApp() 會重新呼叫 init()）
  if (!isUnlocked()) {
    showLockScreen();
    return;
  }
  hideLockScreen();
  startIdleWatch();

  // ── 舊版 token 格式遷移（v1 → v2）───────────────────────────
```

注意：使用 `?.addEventListener` 防止 init() 第一次鎖定返回後第二次執行時重複綁定事件（`addEventListener` 本身對相同函式只綁定一次，但 `?.` 可防止 null 錯誤）。

- [ ] **Step 2：驗證「首次使用」流程**

1. 清除 localStorage 的 `wd_lock_hash` 和 sessionStorage 的 `wd_unlocked`（Console：`localStorage.removeItem('wd_lock_hash'); sessionStorage.removeItem('wd_unlocked');`）
2. 重整頁面
3. 預期：出現「設定解鎖密碼」畫面，儀表板不可見
4. 輸入密碼兩次，點「設定並進入儀表板」
5. 預期：鎖定層消失，儀表板正常顯示，報價開始載入

- [ ] **Step 3：驗證「已設密碼 + 關分頁重新鎖定」流程**

1. 解鎖後直接重整頁面（模擬同分頁重載）→ 預期：**不需重新輸入密碼**（sessionStorage 保留）
2. 開新分頁開啟同一網址 → 預期：出現「輸入密碼解鎖」畫面
3. 輸入正確密碼 → 解鎖成功
4. 輸入錯誤密碼 → 紅色錯誤提示，input 清空

- [ ] **Step 4：驗證「Header 鎖定按鈕」**

1. 解鎖狀態下點 Header 的「🔒 鎖定」按鈕
2. 預期：立即顯示解鎖畫面

- [ ] **Step 5：驗證「OAuth redirect 相容性」**

1. 清除 sessionStorage（`sessionStorage.clear()`），重整頁面
2. 出現解鎖畫面時，注意 URL 若有 `?code=` 仍保留
3. 輸入密碼解鎖後，init() 繼續執行，`handleOAuthCallback` 正常處理 `?code=`

（若無 `?code=` 可跳過此步驟）

- [ ] **Step 6：Commit**

```bash
python update-csp-hash.py
git add index.html
git commit -m "feat(lock): 整合 init()，加入鎖定事件綁定與鎖定狀態檢查"
```

---

## Task 7：_check.js 確認測試通過 + 文件更新 + 最終 Commit

**Files:**
- Modify: `_check.js`（確認已在 Task 1 加入，並加入 `await` 呼叫）
- Modify: `docs/DEVELOPMENT-PLAN.md`

- [ ] **Step 1：確認 _check.js 的 `window._runChecks` 有正確 `await` testLockScreen**

確認（約第 370 行）存在：
```javascript
try { await testLockScreen(); } catch(e) { results.push({ name:'testLockScreen（例外）', ok:false, message:e.message }); }
```
且 `window._runChecks` 宣告為 `async function`（已是如此，第 363 行）。

- [ ] **Step 2：在瀏覽器開啟 index.html，解鎖後在 Console 執行 `window._runChecks()`**

預期輸出（Section 5 全部通過）：
```
✅ hashPassword: 長度為 64
✅ hashPassword: 全為 hex 字元
✅ hashPassword: 相同輸入相同 hash
✅ hashPassword: 不同輸入不同 hash
✅ hashPassword: 空字串長度為 64
✅ hashPassword: 空字串與非空不同
✅ isLockEnabled: 有 hash 回傳 true
✅ isLockEnabled: 無 hash 回傳 false
✅ isUnlocked: 值為 "1" 回傳 true
✅ isUnlocked: 無值回傳 false
```

- [ ] **Step 3：在 DEVELOPMENT-PLAN.md 加入 Phase 9**

找到（約第 335 行）：
```markdown
**驗收標準**：Console 執行 `window._runChecks()` 全部通過；…
```
在 Phase 8 整個區塊之後插入：
```markdown
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
| [x] | init() 整合 | 鎖定事件先綁，isUnlocked() 檢查，提前 return |
| [x] | _check.js 測試 | testLockScreen：hashPassword / isLockEnabled / isUnlocked 共 10 項 |

**驗收標準**：首次使用設定密碼 → 儀表板正常顯示；關分頁重開需重新輸入密碼；🔒 按鈕立即鎖定；閒置 30 分鐘自動鎖定；`window._runChecks()` 全部通過。
```

- [ ] **Step 4：最終 Commit**

```bash
python update-csp-hash.py
git add index.html _check.js docs/DEVELOPMENT-PLAN.md
git commit -m "feat(lock): 完成鎖定畫面功能（密碼設定/解鎖/閒置30分/手動鎖定）"
```

---

## 自我審查

### Spec Coverage 對照

| Spec 章節 | Task |
|---------|------|
| 3. 儲存設計（LS.LOCK_HASH / LS.UNLOCKED） | Task 1 Step 3 |
| 4. 狀態機（首次/已設/OAuth redirect） | Task 6 Step 2-5 |
| 5.1 lock-screen HTML | Task 3 Step 1 |
| 5.2 首次設定密碼 UI | Task 3 Step 1（#lock-setup） |
| 5.3 解鎖畫面 UI | Task 3 Step 1（#lock-unlock） |
| 5.4 眼睛圖示 | Task 6 Step 1（.lock-eye 事件） |
| 5.5 Header 鎖定按鈕 | Task 3 Step 2 |
| 6. 閒置計時器（30 分鐘） | Task 5 |
| 7. OAuth Redirect 相容 | Task 6 Step 5 |
| 8. CSS 隱藏機制 | Task 2 Step 1（body.locked） |
| 9. 函式清單（11 函式） | Task 1, 4, 5 |
| 10. init() 整合 | Task 6 Step 1 |
| 11. 測試規格 | Task 1 Step 1-2 + Task 7 |
| 12. DEVELOPMENT-PLAN.md 更新 | Task 7 Step 3 |

所有 spec 章節均有對應 task，無遺漏。
