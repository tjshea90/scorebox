/* Median cost of switching league tabs (JS + style + layout, measured in-page) on REAL ESPN payloads under CPU throttling.
   Warm-up first, then N alternating switches; prints median / p90 per tab.
   usage: [PORT=8765] [ESPN_FIXTURES=dir] node tools/perf/tabs.js [throttle=6] [odds] */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const PORT = process.env.PORT || 8765, THROTTLE = Number(process.argv[2] || 6), ODDS = process.argv[3] === 'odds';
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
  if (ODDS) await page.click('#oddsBtn');
  await page.click('#syncBtn');
  await page.waitForFunction(() => !document.querySelector('#syncBtn').disabled, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  const res = await page.evaluate(() => {
    const seq = ['cbb', 'nba', 'nhl', 'cbb', 'cfb', 'nba'];
    const times = {}, N = 14;
    function sw(k) {
      const b = document.querySelector('#tabs button[data-lg="' + k + '"]'); if (!b) return null;
      const t = performance.now(); b.click(); document.body.offsetHeight; return performance.now() - t;
    }
    for (let i = 0; i < 4; i++) seq.forEach(sw);                       // warm-up (JIT, caches)
    for (let i = 0; i < N; i++) seq.forEach(k => { const t = sw(k); if (t != null) (times[k] = times[k] || []).push(t); });
    const out = {};
    for (const k in times) {
      const a = times[k].sort((x, y) => x - y);
      out[k] = { cards: 0, median: Math.round(a[a.length >> 1] * 10) / 10, p90: Math.round(a[Math.floor(a.length * 0.9)] * 10) / 10 };
    }
    for (const k in out) { sw(k); out[k].cards = document.querySelectorAll('#games .card').length; }
    return out;
  });
  console.log('throttle ' + THROTTLE + 'x' + (ODDS ? ', odds ON' : ''));
  Object.keys(res).forEach(k => console.log('  ' + k.padEnd(4) + String(res[k].cards).padStart(3) + ' cards   median ' + String(res[k].median).padStart(6) + ' ms   p90 ' + String(res[k].p90).padStart(6) + ' ms'));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
