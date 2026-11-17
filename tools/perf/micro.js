/* Split the cost of swapping a big card list in: HTML parse+DOM create vs style+layout, and what CSS containment buys. */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const PORT = process.env.PORT || 8765, THROTTLE = Number(process.argv[2] || 6);
const FIX = process.env.ESPN_FIXTURES || path.join(__dirname, 'fixtures');
const KEYS = { 'baseball/mlb': 'mlb', 'basketball/nba': 'nba', 'basketball/wnba': 'wnba', 'football/nfl': 'nfl',
  'football/college-football': 'cfb', 'basketball/mens-college-basketball': 'cbb', 'hockey/nhl': 'nhl' };
const cache = {};
function fixture(key, ds) { const f = path.join(FIX, key + '-' + ds + '.json'); if (!fs.existsSync(f)) return '{"events":[]}'; return cache[f] || (cache[f] = fs.readFileSync(f, 'utf8')); }
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 411, height: 860 }, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith('http://localhost:' + PORT + '/')) return route.continue();
    const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    const m = /sports\/([^?]+)\/scoreboard\?dates=(\d{8})/.exec(url);
    if (m && KEYS[m[1]]) return route.fulfill({ status: 200, headers: cors, body: fixture(KEYS[m[1]], m[2]) });
    return route.fulfill({ status: 200, headers: cors, body: '[]' });
  });
  const cdp = await ctx.newCDPSession(page);
  await page.goto('http://localhost:' + PORT + '/index.html?v=1');
  await page.click('#syncBtn');
  await page.waitForFunction(() => !document.querySelector('#syncBtn').disabled, null, { timeout: 120000 });
  await page.waitForTimeout(1000);
  await page.click('#tabs button[data-lg="cbb"]');
  await page.waitForTimeout(300);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  for (const mode of ['plain', 'cv-auto', 'contain']) {
    const r = await page.evaluate((mode) => {
      const m = document.getElementById('games'), html = m.innerHTML;
      let st = document.getElementById('xs'); if (st) st.remove();
      if (mode !== 'plain') {
        st = document.createElement('style'); st.id = 'xs';
        st.textContent = mode === 'cv-auto' ? '.card{content-visibility:auto;contain-intrinsic-size:auto 150px}' : '.card{contain:layout style}';
        document.head.appendChild(st);
      }
      const runs = [];
      for (let i = 0; i < 6; i++) {
        m.innerHTML = ''; document.body.offsetHeight;
        const a = performance.now(); m.innerHTML = html; const b = performance.now();
        document.body.offsetHeight; const c = performance.now();
        runs.push([b - a, c - b]);
      }
      runs.shift();   // warm-up
      const avg = k => Math.round(runs.reduce((s, x) => s + x[k], 0) / runs.length);
      return { cards: m.querySelectorAll('.card').length, htmlKB: Math.round(html.length / 1024), parse_ms: avg(0), styleLayout_ms: avg(1) };
    }, mode);
    console.log(mode.padEnd(8), JSON.stringify(r));
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
