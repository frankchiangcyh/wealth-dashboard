// ╔══════════════════════════════════════════════════════════╗
// ║       資產戰情室 — 自動化測試套件（_check.js）            ║
// ║                                                          ║
// ║  使用方式：在瀏覽器開啟 index.html 後，至 Console 輸入   ║
// ║    window._runChecks()                                   ║
// ║  即可執行全部測試並在 Console 輸出結果。                  ║
// ║                                                          ║
// ║  包含：                                                   ║
// ║    1. 純函式單元測試（parseStooqCSV / safeNum / fracYear）║
// ║    2. 瀑布備援整合測試（mock fetch 模擬各層失敗場景）      ║
// ╚══════════════════════════════════════════════════════════╝

(function() {

// ──────────────────────────────────────────────────────────
//  測試工具：簡易 assert + 結果收集
// ──────────────────────────────────────────────────────────

const results = [];  // { name, ok, message }

/**
 * 斷言工具：比較實際值與預期值
 * @param {string} name    測試名稱（顯示在 Console）
 * @param {*}      actual  實際取得的值
 * @param {*}      expect  預期應得的值
 * @param {number} [tol]   允許誤差（浮點數比較用，預設 0）
 */
function assert(name, actual, expect, tol = 0) {
  const ok = tol > 0
    ? Math.abs(actual - expect) <= tol
    : actual === expect;
  results.push({ name, ok, message: ok ? '' : `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expect)}` });
}

/**
 * 斷言工具：驗證值為 null
 */
function assertNull(name, actual) {
  results.push({
    name,
    ok: actual === null,
    message: actual === null ? '' : `got ${JSON.stringify(actual)}, expected null`
  });
}

/**
 * 斷言工具：驗證值不為 null
 */
function assertNotNull(name, actual) {
  results.push({
    name,
    ok: actual !== null && actual !== undefined,
    message: actual != null ? '' : 'got null/undefined, expected non-null'
  });
}

// ──────────────────────────────────────────────────────────
//  Section 1：safeNum 單元測試
//  （直接呼叫全域函式，需在 index.html 環境中執行）
// ──────────────────────────────────────────────────────────

function testSafeNum() {
  // 正常數字：應在範圍內原樣回傳
  assert('safeNum: 正常數字 50', safeNum(50, 0, 100), 50);

  // 字串數字：應能正確轉型
  assert('safeNum: 字串 "42"', safeNum('42', 0, 100), 42);

  // 非數字字串：應回傳 0（預設值）
  assert('safeNum: 非數字 "abc"', safeNum('abc', 0, 100), 0);

  // 超出上限：應截為上限
  assert('safeNum: 超出上限 200', safeNum(200, 0, 100), 100);

  // 超出下限：應截為下限
  assert('safeNum: 超出下限 -5', safeNum(-5, 0, 100), 0);

  // 極大值（超出上限）
  assert('safeNum: 1e20 超出 max=100', safeNum(1e20, 0, 100), 100);

  // NaN：應回傳 0
  assert('safeNum: NaN', safeNum(NaN, 0, 100), 0);

  // Infinity：應回傳 0
  assert('safeNum: Infinity', safeNum(Infinity, 0, 100), 0);

  // 零：應正常回傳
  assert('safeNum: 零值', safeNum(0, 0, 100), 0);
}

// ──────────────────────────────────────────────────────────
//  Section 2：fracYear 單元測試
//  fracYear 已提升至全域，可直接呼叫
// ──────────────────────────────────────────────────────────

function testFracYear() {
  // 2026-05-07 → 約 2026.35（容許 ±0.01 誤差）
  assert('fracYear: 2026/05/07 斜線格式', fracYear('2026/05/07'), 2026.35, 0.01);
  assert('fracYear: 2026-05-07 連字號格式', fracYear('2026-05-07'), 2026.35, 0.01);

  // 兩種格式結果應相同
  assert('fracYear: 斜線與連字號結果相同', fracYear('2026/05/07'), fracYear('2026-05-07'));

  // 年初：1 月 15 日（預設日）≈ 年份 + 14.5/365.25
  const jan = fracYear('2026/01/15');
  assert('fracYear: 1/15 略大於 2026.0', jan > 2026.0, true);
  assert('fracYear: 1/15 小於 2026.1', jan < 2026.1, true);

  // 僅有年份：缺少月份預設 1 月，缺少日期預設 15 日
  const yearOnly = fracYear('2026');
  const janDefault = fracYear('2026/01/15');
  assert('fracYear: 僅年份格式應等同 2026/01/15', yearOnly, janDefault);

  // 年底（12 月）應接近 2026.99
  assert('fracYear: 2026/12/31 接近年底', fracYear('2026/12/31') > 2026.95, true);
}

// ──────────────────────────────────────────────────────────
//  Section 3：parseStooqCSV 單元測試
//  parseStooqCSV 定義於 index.html 全域作用域
// ──────────────────────────────────────────────────────────

function testParseStooqCSV() {
  // ── 3.1 正常 CSV（f=sd2t2ohlcv 格式）────────────────────
  // 欄位：Symbol, Date, Time, Open, High, Low, Close, Volume
  const normalCSV = [
    'Symbol,Date,Time,Open,High,Low,Close,Volume',
    'VT.US,2026-05-07,16:00:00,110.50,111.20,110.10,111.05,3500000'
  ].join('\n');
  const r1 = parseStooqCSV(normalCSV);
  assertNotNull('parseStooqCSV: 正常 CSV 不為 null', r1);
  assert('parseStooqCSV: 正常 CSV price = 111.05', r1?.price, 111.05);
  assert('parseStooqCSV: 正常 CSV prevClose = 110.50（用 open 估算）', r1?.prevClose, 110.50);

  // ── 3.2 空字串 → null ────────────────────────────────────
  assertNull('parseStooqCSV: 空字串回傳 null', parseStooqCSV(''));

  // ── 3.3 只有標題沒有資料 → null ──────────────────────────
  assertNull('parseStooqCSV: 只有標題行回傳 null',
    parseStooqCSV('Symbol,Date,Time,Open,High,Low,Close,Volume\n'));

  // ── 3.4 Stooq 無資料標記 N/D → null ─────────────────────
  const ndCSV = [
    'Symbol,Date,Time,Open,High,Low,Close,Volume',
    'VT.US,2026-05-07,16:00:00,N/D,N/D,N/D,N/D,0'
  ].join('\n');
  assertNull('parseStooqCSV: N/D 標記回傳 null', parseStooqCSV(ndCSV));

  // ── 3.5 Close 為 0 → null（無效報價）────────────────────
  const zeroCSV = [
    'Symbol,Date,Time,Open,High,Low,Close,Volume',
    'VT.US,2026-05-07,16:00:00,0,0,0,0,0'
  ].join('\n');
  assertNull('parseStooqCSV: Close=0 回傳 null', parseStooqCSV(zeroCSV));

  // ── 3.6 Close 為負值 → null ───────────────────────────────
  const negCSV = [
    'Symbol,Date,Time,Open,High,Low,Close,Volume',
    'VT.US,2026-05-07,16:00:00,110,-5,-5,-5,0'
  ].join('\n');
  assertNull('parseStooqCSV: Close<0 回傳 null', parseStooqCSV(negCSV));

  // ── 3.7 Open 無效但 Close 有效 → 用 Close 作為 prevClose ─
  const noOpenCSV = [
    'Symbol,Date,Time,Open,High,Low,Close,Volume',
    'VT.US,2026-05-07,16:00:00,,111.0,109.0,110.5,1000'
  ].join('\n');
  const r7 = parseStooqCSV(noOpenCSV);
  assertNotNull('parseStooqCSV: Open 空白仍可解析 Close', r7);
  assert('parseStooqCSV: Open 空白時 prevClose 退回 Close 值', r7?.prevClose, 110.5);
}

// ──────────────────────────────────────────────────────────
//  Section 4：整合測試（mock fetch 瀑布場景）
//  透過暫時替換 window.fetch 來模擬各種 API 回應
// ──────────────────────────────────────────────────────────

// mock fetch 工廠：
//   urlHandlers: { [urlSubstring]: () => Response } — 依 URL 子字串匹配
//   defaultHandler: () => Response — 未匹配時的預設回應
function mockFetch(urlHandlers, defaultHandler) {
  return async (url, opts) => {
    const urlStr = String(url);
    for (const [key, fn] of Object.entries(urlHandlers)) {
      if (urlStr.includes(key)) return fn(urlStr);
    }
    return defaultHandler ? defaultHandler(urlStr) : new Response('', { status: 503 });
  };
}

// 建立模擬成功的 Yahoo v8 JSON Response
function yahooOkResponse(symbol, price, prevClose) {
  const body = JSON.stringify({
    chart: { result: [{ meta: {
      symbol, regularMarketPrice: price, chartPreviousClose: prevClose
    }}], error: null }
  });
  return new Response(body, { status: 200 });
}

// 建立模擬失敗的 Response
function failResponse(status = 503) {
  return new Response('error', { status });
}

// 建立模擬 Stooq CSV Response
function stooqOkResponse(symbol, open, close) {
  const csv = [
    'Symbol,Date,Time,Open,High,Low,Close,Volume',
    `${symbol},2026-05-07,16:00:00,${open},${close},${open},${close},100000`
  ].join('\n');
  return new Response(csv, { status: 200 });
}

// 建立模擬 Open ER API Response
function erOkResponse(twd) {
  const body = JSON.stringify({ result: 'success', rates: { TWD: twd, USD: 1 } });
  return new Response(body, { status: 200 });
}

// 在整合測試前後保存/還原 fetch
const _origFetch = window.fetch;

async function runIntegrationTests() {
  const integResults = [];

  // 快照：儲存目前的 prices/changes/pricesReady，測試後還原
  const origPrices  = { ...prices };
  const origChanges = { ...changes };
  const origReady   = pricesReady;

  function reset() {
    Object.keys(prices).forEach(k => prices[k] = origPrices[k]);
    Object.keys(changes).forEach(k => changes[k] = origChanges[k]);
    pricesReady = origReady;
  }

  // ── 場景 1：Yahoo 全部成功（6/6）─────────────────────────
  await (async () => {
    reset();
    let modalShown = false;
    const origShow = window.showQuoteErrorModal;
    window.showQuoteErrorModal = () => { modalShown = true; };

    window.fetch = mockFetch({
      'query1.finance.yahoo.com': url => {
        const sym = decodeURIComponent(url.split('/chart/')[1]?.split('?')[0] ?? '');
        const priceMap = { VT:110, BND:73, '0050.TW':168, '006208.TW':85, '2409.TW':15, 'TWD=X':32 };
        return priceMap[sym] ? yahooOkResponse(sym, priceMap[sym], priceMap[sym]-1) : failResponse();
      }
    });

    await fetchQuotes();

    integResults.push({ name: '場景1: Yahoo 全部成功 → pricesReady=true', ok: pricesReady });
    integResults.push({ name: '場景1: Yahoo 全部成功 → modal 不出現', ok: !modalShown });
    integResults.push({ name: '場景1: Yahoo 全部成功 → prices.usdtwd = 32', ok: prices.usdtwd === 32 });

    window.showQuoteErrorModal = origShow;
  })();

  // ── 場景 2：Yahoo 部分失敗（VT/TWD=X 失敗），Stooq 補 VT，ER API 補 TWD=X ──
  await (async () => {
    reset();
    let modalShown = false;
    const origShow = window.showQuoteErrorModal;
    window.showQuoteErrorModal = () => { modalShown = true; };

    window.fetch = mockFetch({
      // Yahoo：只有 BND/0050/006208/2409 成功，VT 和 TWD=X 失敗
      'query1.finance.yahoo.com': url => {
        const sym = decodeURIComponent(url.split('/chart/')[1]?.split('?')[0] ?? '');
        if (sym === 'VT' || sym === 'TWD=X') return failResponse(401);
        const priceMap = { BND:73, '0050.TW':168, '006208.TW':85, '2409.TW':15 };
        return priceMap[sym] ? yahooOkResponse(sym, priceMap[sym], priceMap[sym]-1) : failResponse();
      },
      // Stooq：VT 成功
      'stooq.com': url => {
        if (url.includes('vt.us')) return stooqOkResponse('VT.US', 110, 111);
        return failResponse();
      },
      // Open ER：TWD=X 成功
      'open.er-api.com': () => erOkResponse(31.5)
    });

    await fetchQuotes();

    integResults.push({ name: '場景2: 部分失敗→補齊 → pricesReady=true', ok: pricesReady });
    integResults.push({ name: '場景2: 部分失敗→補齊 → modal 不出現', ok: !modalShown });
    integResults.push({ name: '場景2: Stooq 補 VT → prices.vt = 111', ok: prices.vt === 111 });
    integResults.push({ name: '場景2: ER API 補 TWD=X → prices.usdtwd = 31.5', ok: prices.usdtwd === 31.5 });

    window.showQuoteErrorModal = origShow;
  })();

  // ── 場景 3：TWD=X 全部失敗（Yahoo 失敗 + ER API 失敗）─────
  await (async () => {
    reset();
    let modalShown = false;
    let failedSet  = null;
    const origShow = window.showQuoteErrorModal;
    window.showQuoteErrorModal = (s) => { modalShown = true; failedSet = s; };

    window.fetch = mockFetch({
      // Yahoo：非 TWD=X 全部成功
      'query1.finance.yahoo.com': url => {
        const sym = decodeURIComponent(url.split('/chart/')[1]?.split('?')[0] ?? '');
        if (sym === 'TWD=X') return failResponse(401);
        const priceMap = { VT:110, BND:73, '0050.TW':168, '006208.TW':85, '2409.TW':15 };
        return priceMap[sym] ? yahooOkResponse(sym, priceMap[sym], priceMap[sym]-1) : failResponse();
      },
      // Open ER：失敗
      'open.er-api.com': () => failResponse(500)
    });

    await fetchQuotes();

    integResults.push({ name: '場景3: TWD=X 全失敗 → modal 出現', ok: modalShown });
    integResults.push({ name: '場景3: TWD=X 全失敗 → failedSet 包含 TWD=X', ok: failedSet?.has('TWD=X') ?? false });
    integResults.push({ name: '場景3: TWD=X 全失敗 → 其他 5 支仍取得', ok: prices.vt === 110 });

    window.showQuoteErrorModal = origShow;
  })();

  // ── 場景 4：全部來源失敗（確認 modal 顯示所有符號）──────────
  await (async () => {
    reset();
    let modalShown = false;
    let failedSet  = null;
    const origShow = window.showQuoteErrorModal;
    window.showQuoteErrorModal = (s) => { modalShown = true; failedSet = s; };

    // 清除快取確保無保底
    const origLoad = window.loadPricesCache;
    window.loadPricesCache = () => null;

    window.fetch = mockFetch({}, () => failResponse(503));  // 全部失敗

    await fetchQuotes();

    integResults.push({ name: '場景4: 全部失敗 → modal 出現', ok: modalShown });
    integResults.push({ name: '場景4: 全部失敗 → failedSet 有 6 支', ok: (failedSet?.size ?? 0) === 6 });

    window.showQuoteErrorModal = origShow;
    window.loadPricesCache = origLoad;
  })();

  // 還原真實 fetch
  window.fetch = _origFetch;
  reset();

  return integResults;
}

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

// ──────────────────────────────────────────────────────────
//  主要入口：window._runChecks()
// ──────────────────────────────────────────────────────────

/**
 * 執行全部測試，在 Console 輸出結果摘要
 * 使用方式：在 index.html 載入後於 Console 執行 window._runChecks()
 */
window._runChecks = async function() {
  console.group('🧪 _runChecks 開始');

  // ── 單元測試 ──
  results.length = 0;
  console.group('── 單元測試');
  try { testSafeNum();      } catch(e) { results.push({ name:'testSafeNum（例外）', ok:false, message:e.message }); }
  try { testFracYear();     } catch(e) { results.push({ name:'testFracYear（例外）', ok:false, message:e.message }); }
  try { testParseStooqCSV();} catch(e) { results.push({ name:'testParseStooqCSV（例外）', ok:false, message:e.message }); }
  try { await testLockScreen(); } catch(e) { results.push({ name:'testLockScreen（例外）', ok:false, message:e.message }); }

  const unitPass = results.filter(r => r.ok).length;
  const unitFail = results.filter(r => !r.ok).length;
  results.forEach(r => {
    if (r.ok) console.info(`  ✅ ${r.name}`);
    else      console.error(`  ❌ ${r.name}: ${r.message}`);
  });
  console.info(`單元測試：${unitPass} 通過 / ${unitFail} 失敗`);
  console.groupEnd();

  // ── 整合測試 ──
  console.group('── 整合測試（mock fetch）');
  let intResults = [];
  try {
    intResults = await runIntegrationTests();
  } catch(e) {
    console.error('整合測試例外：', e);
    window.fetch = _origFetch;  // 確保 fetch 還原
  }
  const intPass = intResults.filter(r => r.ok).length;
  const intFail = intResults.filter(r => !r.ok).length;
  intResults.forEach(r => {
    if (r.ok) console.info(`  ✅ ${r.name}`);
    else      console.error(`  ❌ ${r.name}`);
  });
  console.info(`整合測試：${intPass} 通過 / ${intFail} 失敗`);
  console.groupEnd();

  // ── 總結 ──
  const totalPass = unitPass + intPass;
  const totalFail = unitFail + intFail;
  const emoji = totalFail === 0 ? '🎉' : '⚠';
  console.info(`${emoji} 總計：${totalPass} 通過 / ${totalFail} 失敗`);
  console.groupEnd();

  return { unitPass, unitFail, intPass, intFail, totalFail };
};

console.info('[_check.js] 已載入 → 在 Console 執行 window._runChecks() 開始測試');

})();
