/* CPU-profile the render path: sync real data once, then alternate tabs / toggles N times and print top self-time functions. */
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
    if (url.indexOf('pinnacle') >= 0) return route.fulfill({ status: 200, headers: cors, body: '[]' });
    return route.fulfill({ status: 404, headers: cors, body: '{}' });
  });
  const cdp = await ctx.newCDPSession(page);
  await page.goto('http://localhost:' + PORT + '/index.html?v=1');
  if (ODDS) { await page.click('#oddsBtn'); }
  await page.click('#syncBtn');
  await page.waitForFunction(() => !document.querySelector('#syncBtn').disabled, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
  const t = await page.evaluate(() => {
    const seq = ['cbb', 'nba', 'cbb', 'nhl', 'cbb', 'nba', 'cbb', 'nhl', 'cbb', 'nba'];
    const t0 = performance.now();
    for (const k of seq) { const b = document.querySelector('#tabs button[data-lg="' + k + '"]'); if (b) b.click(); document.body.offsetHeight; }
    return performance.now() - t0;
  });
  const { profile } = await cdp.send('Profiler.stop');
  // self time per function
  const byId = {}; profile.nodes.forEach(n => { byId[n.id] = n; });
  const self = {};
  const dts = profile.timeDeltas; let total = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    const n = byId[profile.samples[i]]; const key = n.callFrame.functionName + ' @' + n.callFrame.url.split('/').pop() + ':' + n.callFrame.lineNumber;
    self[key] = (self[key] || 0) + dts[i]; total += dts[i];
  }
  const rows = Object.entries(self).sort((a, b) => b[1] - a[1]).slice(0, 18);
  console.log('10 tab switches took', Math.round(t), 'ms wall (throttle ' + THROTTLE + (ODDS ? ', odds on' : '') + '); profiled', Math.round(total / 1000), 'ms');
  rows.forEach(r => console.log(String(Math.round(r[1] / 1000)).padStart(6) + ' ms  ' + r[0]));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
