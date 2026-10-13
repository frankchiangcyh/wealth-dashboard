// ╔══════════════════════════════════════════════════════════╗
// ║       資產戰情室 — 自動化測試套件（_check.js）            ║
// ║                                                          ║
// ║  使用方式：在瀏覽器開啟 index.html 後，至 Console 輸入   ║
// ║    window._runChecks()                                   ║
// ║  即可執行全部測試並在 Console 輸出結果。                  ║
// ║                                                          ║
// ║  包含：                                                   ║
// ║    1. 純函式單元測試（parseTwseDaily / safeNum / fracYear）║
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

function testClientIdValidation() {
  assert('OAuth Client ID：有效格式', isValidClientId('123456789-example.apps.googleusercontent.com'), true);
  assert('OAuth Client ID：拒絕用戶端密鑰', isValidClientId('GOCSPX-example'), false);
  assert('OAuth Client ID：拒絕空字串', isValidClientId(''), false);
  assert('OAuth Client ID：拒絕附加網址', isValidClientId('123-example.apps.googleusercontent.com/path'), false);
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
//  Section 3：臺證交所官方日資料解析測試
// ──────────────────────────────────────────────────────────

function testParseTwseDaily() {
  const now = new Date(2026, 9, 13);
  const rows = [
    { Code:'0050', Date:'1151012', ClosingPrice:'114.80', Change:'-0.15' },
    { Code:'006208', Date:'1151012', ClosingPrice:'263.15', Change:'+0.25' },
    { Code:'2409', Date:'1151012', ClosingPrice:'35.55', Change:'X' }
  ];
  const data = parseTwseDaily(rows, now);
  assert('臺證交所：0050 收盤價', data['0050.TW']?.price, 114.8);
  assert('臺證交所：0050 真前收', data['0050.TW']?.prevClose, 114.95, 0.000001);
  assert('臺證交所：006208 收盤價', data['006208.TW']?.price, 263.15);
  assertNull('臺證交所：無漲跌資料不推估前收', data['2409.TW']?.prevClose);
  assert('臺證交所：拒絕逾期資料', Object.keys(parseTwseDaily(rows, new Date(2026, 10, 1))).length, 0);
  assert('臺證交所：拒絕非陣列資料', Object.keys(parseTwseDaily(null, now)).length, 0);
  assert('臺證交所：拒絕無效價格', Object.keys(parseTwseDaily([{ ...rows[0], ClosingPrice:'--' }], now)).length, 0);
}

function testQuoteWithoutPreviousClose() {
  const oldPrice = prices.auo;
  const oldChange = changes.auo;
  try {
    changes.auo = { change: 2, pct: 5 };
    applyTickerData('2409.TW', 15, null);
    assertNull('無前收備援：清除上一輪漲跌幅', changes.auo);
  } finally {
    prices.auo = oldPrice;
    changes.auo = oldChange;
  }
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
    const proxyUrl = String(url);
    let urlStr = proxyUrl;
    let proxyHost = '';
    try {
      const parsed = new URL(proxyUrl);
      proxyHost = parsed.hostname;
      if ((proxyHost === 'proxy.cors.dev' || proxyHost === 'api.allorigins.win') && parsed.searchParams.has('url')) {
        urlStr = parsed.searchParams.get('url');
      }
    } catch (e) {}
    for (const [key, fn] of Object.entries(urlHandlers)) {
      if (urlStr.includes(key)) return fn(urlStr, proxyHost);
    }
    return defaultHandler ? defaultHandler(urlStr, proxyHost) : new Response('', { status: 503 });
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

function yahooSparkOkResponse(priceMap) {
  const result = Object.entries(priceMap).map(([symbol, price]) => ({
    symbol,
    response: [{
      meta: { symbol, regularMarketPrice: price, chartPreviousClose: price - 1 },
      indicators: { quote: [{ close: [price - 1, price] }] }
    }]
  }));
  return new Response(JSON.stringify({ spark: { result, error: null } }), { status: 200 });
}

// 建立模擬失敗的 Response
function failResponse(status = 503) {
  return new Response('error', { status });
}

// 建立模擬臺證交所 OpenAPI Response
function twseOkResponse() {
  const today = new Date();
  const date = String(today.getFullYear() - 1911).padStart(3, '0')
    + String(today.getMonth() + 1).padStart(2, '0')
    + String(today.getDate()).padStart(2, '0');
  return new Response(JSON.stringify([
    { Code:'0050', Date:date, ClosingPrice:'169.00', Change:'+1.00' },
    { Code:'006208', Date:date, ClosingPrice:'86.00', Change:'+0.50' },
    { Code:'2409', Date:date, ClosingPrice:'16.00', Change:'-0.25' }
  ]), { status: 200 });
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
  const origPriceCache = localStorage.getItem(LS.PRICES);

  function reset() {
    Object.keys(prices).forEach(k => prices[k] = origPrices[k]);
    Object.keys(changes).forEach(k => changes[k] = origChanges[k]);
    pricesReady = origReady;
    localStorage.removeItem(LS.PRICES);
  }

  // ── 場景 1：Yahoo 全部成功（6/6）─────────────────────────
  await (async () => {
    reset();
    let modalShown = false;
    let yahooRequestCount = 0;
    let activeYahoo = 0;
    let maxActiveYahoo = 0;
    const origShow = window.showQuoteErrorModal;
    window.showQuoteErrorModal = () => { modalShown = true; };

    window.fetch = mockFetch({
      'query1.finance.yahoo.com': async url => {
        const isLiveQuote = url.includes('interval=1d') && url.includes('range=5d');
        if (isLiveQuote) {
          yahooRequestCount++;
          activeYahoo++;
          maxActiveYahoo = Math.max(maxActiveYahoo, activeYahoo);
          await new Promise(resolve => setTimeout(resolve, 5));
          activeYahoo--;
        }
        const priceMap = { VT:110, BND:73, '0050.TW':168, '006208.TW':85, '2409.TW':15, 'TWD=X':32 };
        if (url.includes('/spark?')) return yahooSparkOkResponse(priceMap);
        const sym = decodeURIComponent(url.split('/chart/')[1]?.split('?')[0] ?? '');
        return priceMap[sym] ? yahooOkResponse(sym, priceMap[sym], priceMap[sym]-1) : failResponse();
      }
    });

    await fetchQuotes();

    integResults.push({ name: '場景1: Yahoo 全部成功 → pricesReady=true', ok: pricesReady });
    integResults.push({ name: '場景1: Yahoo 全部成功 → modal 不出現', ok: !modalShown });
    integResults.push({ name: '場景1: Yahoo 全部成功 → prices.usdtwd = 32', ok: prices.usdtwd === 32 });
    integResults.push({ name: '場景1: Yahoo 批次單一請求', ok: maxActiveYahoo === 1 });
    integResults.push({ name: '場景1: Yahoo 全部成功僅需 1 個 request', ok: yahooRequestCount === 1 });

    window.showQuoteErrorModal = origShow;
  })();

  // ── 截圖回歸：首輪 Spark 缺 VT/2409.TW，主代理故障，AllOrigins 補回 ──
  await (async () => {
    reset();
    let modalShown = false;
    let failedSet = null;
    let sparkRequestCount = 0;
    let v8RequestCount = 0;
    const origShow = window.showQuoteErrorModal;
    window.showQuoteErrorModal = symbols => { modalShown = true; failedSet = symbols; };

    window.fetch = mockFetch({
      'query1.finance.yahoo.com/v7/finance/spark': (url, proxyHost) => {
        sparkRequestCount++;
        if (sparkRequestCount === 1) {
          return yahooSparkOkResponse({ BND:73, '0050.TW':168, '006208.TW':85, 'TWD=X':32 });
        }
        if (proxyHost === 'proxy.cors.dev') return failResponse(429);
        if (proxyHost === 'api.allorigins.win') {
          return yahooSparkOkResponse({ VT:110, '2409.TW':15 });
        }
        return failResponse();
      },
      'query1.finance.yahoo.com/v8/finance/chart': () => {
        v8RequestCount++;
        return failResponse(429);
      }
    });

    await fetchQuotes();

    integResults.push({ name: '截圖回歸: 6 支最終完整', ok: pricesReady === true });
    integResults.push({ name: '截圖回歸: VT 已由缺漏 Spark 補回', ok: prices.vt === 110 });
    integResults.push({ name: '截圖回歸: 2409.TW 已由缺漏 Spark 補回', ok: prices.auo === 15 });
    integResults.push({ name: '截圖回歸: modal 不出現', ok: !modalShown });
    integResults.push({ name: '截圖回歸: VT/2409.TW 不殘留於錯誤清單', ok: !failedSet?.has('VT') && !failedSet?.has('2409.TW') });
    integResults.push({ name: '截圖回歸: 不發逐支 v8 request', ok: v8RequestCount === 0 });

    window.showQuoteErrorModal = origShow;
  })();

  // ── 場景 2：Yahoo 缺台股與匯率，臺證交所與 Open ER 分別補齊 ──
  await (async () => {
    reset();
    let modalShown = false;
    const origShow = window.showQuoteErrorModal;
    window.showQuoteErrorModal = () => { modalShown = true; };

    window.fetch = mockFetch({
      // Yahoo：0050.TW、TWD=X 失敗，其餘成功
      'query1.finance.yahoo.com': url => {
        const sym = decodeURIComponent(url.split('/chart/')[1]?.split('?')[0] ?? '');
        if (sym === '0050.TW' || sym === 'TWD=X') return failResponse(401);
        const priceMap = { VT:110, BND:73, '006208.TW':85, '2409.TW':15 };
        return priceMap[sym] ? yahooOkResponse(sym, priceMap[sym], priceMap[sym]-1) : failResponse();
      },
      'openapi.twse.com.tw': () => twseOkResponse(),
      // Open ER：TWD=X 成功
      'open.er-api.com': () => erOkResponse(31.5)
    });

    await fetchQuotes();

    integResults.push({ name: '場景2: 部分失敗→補齊 → pricesReady=true', ok: pricesReady });
    integResults.push({ name: '場景2: 部分失敗→補齊 → modal 不出現', ok: !modalShown });
    integResults.push({ name: '場景2: 臺證交所補 0050 → prices.tw0050 = 169', ok: prices.tw0050 === 169 });
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
    pricesReady = true;  // 模擬上一輪報價成功後，本輪定時更新全失敗
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
    integResults.push({ name: '場景4: 全部失敗且無快取 → pricesReady=false', ok: pricesReady === false });

    window.showQuoteErrorModal = origShow;
    window.loadPricesCache = origLoad;
  })();

  // 還原真實 fetch
  window.fetch = _origFetch;
  if (origPriceCache == null) localStorage.removeItem(LS.PRICES);
  else localStorage.setItem(LS.PRICES, origPriceCache);
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

function testCalculateCAGR() {
  const closes = Array.from({ length: 121 }, (_, index) => 100 * Math.pow(1.1, index / 12));
  assert('calculateCAGR: 5 年固定 10% 年化', calculateCAGR(closes, 5), 0.1, 1e-10);
  assert('calculateCAGR: 10 年固定 10% 年化', calculateCAGR(closes, 10), 0.1, 1e-10);
  assertNull('calculateCAGR: 少於 12 個月回傳 null', calculateCAGR([100, 101], 5));
  assertNull('calculateCAGR: 全部無效值回傳 null', calculateCAGR([null, NaN, 0, -1], 5));
}

async function testFetchHistoricalReturns() {
  const closes = Array.from({ length: 121 }, (_, index) => 100 * Math.pow(1.1, index / 12));
  let requestCount = 0;
  window.fetch = mockFetch({
    'query1.finance.yahoo.com/v7/finance/spark': () => {
      requestCount++;
      const result = ['VT', 'BND', '0050.TW', '006208.TW'].map(symbol => ({
        symbol,
        response: [{ indicators: { quote: [{ close: closes }] } }]
      }));
      return new Response(JSON.stringify({ spark: { result, error: null } }), { status: 200 });
    }
  });

  try {
    const historical = await fetchHistoricalReturns();
    assert('fetchHistoricalReturns: 僅發 1 個 Spark request', requestCount, 1);
    assert('fetchHistoricalReturns: VT 5 年為 10%', historical?.VT?.[5], 0.1, 1e-10);
    assert('fetchHistoricalReturns: VT 10 年為 10%', historical?.VT?.[10], 0.1, 1e-10);
  } finally {
    window.fetch = _origFetch;
  }
}

// ──────────────────────────────────────────────────────────
//  Section 6：Google Sheets HTTP 錯誤處理
// ──────────────────────────────────────────────────────────
async function testSheetsHttpErrors() {
  const origToken = sessionStorage.getItem(LS.TOKENS);
  const origFetch = window.fetch;
  sessionStorage.setItem(LS.TOKENS, JSON.stringify({
    access_token: 'test-access-token',
    expires_at: Date.now() + 3600000
  }));
  window.fetch = async () => new Response(
    JSON.stringify({ error: { code: 403, message: 'Permission denied' } }),
    { status: 403, headers: { 'Content-Type': 'application/json' } }
  );

  let rejected = false;
  try {
    await sheetsAppend('snapshots!A:L', [[1, 2, 3]]);
  } catch (e) {
    rejected = true;
  } finally {
    window.fetch = origFetch;
    if (origToken == null) sessionStorage.removeItem(LS.TOKENS);
    else sessionStorage.setItem(LS.TOKENS, origToken);
  }

  assert('Sheets HTTP 403：寫入必須拒絕', rejected, true);
}

async function testRefreshWithoutSecret() {
  const origToken = sessionStorage.getItem(LS.TOKENS);
  const origSecret = sessionStorage.getItem(LS.SECRET);
  const origRefresh = localStorage.getItem(LS.REFRESH);
  const origFetch = window.fetch;
  let fetchCalled = false;

  sessionStorage.removeItem(LS.TOKENS);
  sessionStorage.removeItem(LS.SECRET);
  localStorage.setItem(LS.REFRESH, 'test-refresh-token');
  window.fetch = async () => {
    fetchCalled = true;
    return new Response(JSON.stringify({ error: 'invalid_client' }), { status: 400 });
  };

  try {
    const token = await getAccessToken();
    assertNull('OAuth 無密鑰：不回傳 access token', token);
    assert('OAuth 無密鑰：不得送出 refresh request', fetchCalled, false);
    assert('OAuth 無密鑰：保留 refresh token', localStorage.getItem(LS.REFRESH), 'test-refresh-token');
  } finally {
    window.fetch = origFetch;
    if (origToken == null) sessionStorage.removeItem(LS.TOKENS);
    else sessionStorage.setItem(LS.TOKENS, origToken);
    if (origSecret == null) sessionStorage.removeItem(LS.SECRET);
    else sessionStorage.setItem(LS.SECRET, origSecret);
    if (origRefresh == null) localStorage.removeItem(LS.REFRESH);
    else localStorage.setItem(LS.REFRESH, origRefresh);
  }
}

async function testSheetsReadRecovery() {
  const originalGet = window.sheetsGet;
  const originalClear = window.clearTokens;
  const modal = document.getElementById('sheets-error-modal');
  let tokenCleared = false;
  window.clearTokens = () => { tokenCleared = true; };
  try {
    window.sheetsGet = async () => { throw new TypeError('Failed to fetch'); };
    await syncFromSheets();
    assert('Sheets 讀取失敗：顯示重試視窗', modal.classList.contains('show'), true);
    assert('Sheets 讀取失敗：保留授權', tokenCleared, false);
    assert('Sheets 讀取失敗：顯示錯誤原因',
      document.getElementById('sheets-error-detail').textContent.includes('Failed to fetch'), true);

    window.sheetsGet = async () => ({ values: [] });
    await syncFromSheets();
    assert('Sheets 重試成功：關閉錯誤視窗', modal.classList.contains('show'), false);
  } finally {
    window.sheetsGet = originalGet;
    window.clearTokens = originalClear;
    hideSheetsErrorModal();
  }
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
  try { testClientIdValidation(); } catch(e) { results.push({ name:'testClientIdValidation（例外）', ok:false, message:e.message }); }
  try { testFracYear();     } catch(e) { results.push({ name:'testFracYear（例外）', ok:false, message:e.message }); }
  try { testParseTwseDaily();} catch(e) { results.push({ name:'testParseTwseDaily（例外）', ok:false, message:e.message }); }
  try { testQuoteWithoutPreviousClose(); } catch(e) { results.push({ name:'testQuoteWithoutPreviousClose（例外）', ok:false, message:e.message }); }
  try { await testLockScreen(); } catch(e) { results.push({ name:'testLockScreen（例外）', ok:false, message:e.message }); }
  try { testCalculateCAGR(); } catch(e) { results.push({ name:'testCalculateCAGR（例外）', ok:false, message:e.message }); }
  try { await testFetchHistoricalReturns(); } catch(e) { results.push({ name:'testFetchHistoricalReturns（例外）', ok:false, message:e.message }); }
  try { await testSheetsHttpErrors(); } catch(e) { results.push({ name:'testSheetsHttpErrors（例外）', ok:false, message:e.message }); }
  try { await testRefreshWithoutSecret(); } catch(e) { results.push({ name:'testRefreshWithoutSecret（例外）', ok:false, message:e.message }); }
  try { await testSheetsReadRecovery(); } catch(e) { results.push({ name:'testSheetsReadRecovery（例外）', ok:false, message:e.message }); }

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
