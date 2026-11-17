/* Profile ScoreBox in Chromium with REAL ESPN payloads (python3 tools/perf/fetch-fixtures.py) under CPU throttling.
   usage: node tools/perf/profile.js [throttle=6] [label]   (assets server on :8765, same as tools/e2e/run.sh) */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THROTTLE = Number(process.argv[2] || 6);
const LABEL = process.argv[3] || 'run';
const PORT = process.env.PORT || 8765;
const FIX = process.env.ESPN_FIXTURES || path.join(__dirname, 'fixtures');
const KEYS = { 'baseball/mlb': 'mlb', 'basketball/nba': 'nba', 'basketball/wnba': 'wnba', 'football/nfl': 'nfl',
  'football/college-football': 'cfb', 'basketball/mens-college-basketball': 'cbb', 'hockey/nhl': 'nhl' };
const cache = {};
function fixture(key, ds) {
  const f = path.join(FIX, key + '-' + ds + '.json');
  if (!fs.existsSync(f)) return '{"events":[]}';
  return cache[f] || (cache[f] = fs.readFileSync(f, 'utf8'));
}
let tick = 0, mutate = false;
function mutated(body) {
  // simulate a live tick: first game of the slate flips to "in" with a new clock + score each call
  const j = JSON.parse(body);
  const ev = (j.events || [])[0];
  if (ev) {
    tick++;
    const st = ev.status || (ev.competitions[0] || {}).status;
    st.type.state = 'in'; st.type.completed = false; st.type.shortDetail = (20 - (tick % 20)) + ':00 - 1st Half';
    st.period = 1;
    const cs = ev.competitions[0].competitors;
    cs[0].score = String(tick); cs[1].score = String(tick + 1);
  }
  return JSON.stringify(j);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 411, height: 860 }, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith('http://localhost:' + PORT + '/')) return route.continue();
    const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    let m = /sports\/([^?]+)\/scoreboard\?dates=(\d{8})/.exec(url);
    if (m && KEYS[m[1]]) {
      let body = fixture(KEYS[m[1]], m[2]);
      if (mutate && KEYS[m[1]] === 'cbb') body = mutated(body);
      return route.fulfill({ status: 200, headers: cors, body });
    }
    if (url.indexOf('pinnacle') >= 0) return route.fulfill({ status: 200, headers: cors, body: '[]' });
    return route.fulfill({ status: 404, headers: cors, body: '{}' });
  });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  async function metrics() {
    const r = await cdp.send('Performance.getMetrics'); const o = {};
    r.metrics.forEach(x => { o[x.name] = x.value; }); return o;
  }
  function diff(a, b) {
    const ms = k => Math.round(((b[k] || 0) - (a[k] || 0)) * 1000);
    return { task: ms('TaskDuration'), script: ms('ScriptDuration'), layout: ms('LayoutDuration'), style: ms('RecalcStyleDuration'),
      layouts: (b.LayoutCount || 0) - (a.LayoutCount || 0), styles: (b.RecalcStyleCount || 0) - (a.RecalcStyleCount || 0) };
  }
  const waitSync = async () => {
    await page.waitForFunction(() => !document.querySelector('#syncBtn').disabled, null, { timeout: 120000 });
    await page.waitForTimeout(800);
  };
  const out = { label: LABEL, throttle: THROTTLE };

  await page.goto('http://localhost:' + PORT + '/index.html?v=1');
  await page.waitForTimeout(800);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });

  /* 1. full Sync on real payloads */
  let m0 = await metrics(); const t0 = Date.now();
  await page.click('#syncBtn'); await waitSync();
  out.syncWall = Date.now() - t0; out.sync = diff(m0, await metrics());

  /* 2. storage footprint */
  out.storage = await page.evaluate(() => { let n = 0, k = 0, big = []; for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); const v = localStorage.getItem(key); n += key.length + v.length; k++; big.push([key, v.length]); } big.sort((a, b) => b[1] - a[1]); return { keys: k, chars: n, top: big.slice(0, 4) }; });

  /* 3. cold start (reload) with a full cache */
  m0 = await metrics(); const t1 = Date.now();
  await page.reload(); await page.waitForSelector('#games .card', { timeout: 60000 });
  out.coldWall = Date.now() - t1; out.cold = diff(m0, await metrics());

  /* helper: run an action inside the page and time script+style+layout synchronously */
  async function timed(name, fn, arg) {
    const r = await page.evaluate(({ fn, arg }) => {
      const t = performance.now(); (new Function('a', fn))(arg); document.body.offsetHeight; return performance.now() - t;
    }, { fn, arg });
    out[name] = Math.round(r);
  }
  const tabs = await page.evaluate(() => Array.from(document.querySelectorAll('#tabs button')).map(b => b.getAttribute('data-lg') || 'moves'));
  out.tabs = tabs;
  const sel = k => "document.querySelector('#tabs button[data-lg=\"" + k + "\"]').click()";
  /* 4. tab switches: cbb <-> nba <-> nhl */
  if (tabs.indexOf('cbb') >= 0) { await timed('tab_cbb', sel('cbb')); }
  await page.waitForTimeout(300);
  if (tabs.indexOf('nba') >= 0) { await timed('tab_nba', sel('nba')); }
  await page.waitForTimeout(300);
  if (tabs.indexOf('cbb') >= 0) { await timed('tab_cbb2', sel('cbb')); }
  out.nodes_cbb = await page.evaluate(() => document.getElementsByTagName('*').length);
  out.cards_cbb = await page.evaluate(() => document.querySelectorAll('#games .card').length);
  const mem = await metrics(); out.heapMB = Math.round(mem.JSHeapUsedSize / 1e5) / 10; out.domNodes = mem.Nodes;

  /* 5. identical re-render (what a timer tick without a data change costs) */
  await timed('rerender_same', "document.querySelector('#remBtn').click(); document.querySelector('#remBtn').click();");

  /* 6. live ticks with a changing score on the open CBB slate */
  mutate = true;
  await page.click('#liveBtn');           // starts live sync (immediate silent syncToday)
  await page.waitForTimeout(1500);
  m0 = await metrics(); const t2 = Date.now();
  // force 5 more ticks by calling the live loop's trigger: wait for 10s interval ticks (throttle slows CPU not timers)
  await page.waitForTimeout(31000);
  out.live31s = diff(m0, await metrics()); out.liveTicks = tick;
  await page.click('#liveBtn'); mutate = false;

  /* 7. odds ON: turn on, Sync, then tab switch cost */
  await page.click('#oddsBtn'); await page.waitForTimeout(300);
  await page.click('#syncBtn'); await waitSync(); await page.waitForTimeout(1500);
  if (tabs.indexOf('nba') >= 0) await timed('odds_tab_nba', sel('nba'));
  if (tabs.indexOf('cbb') >= 0) await timed('odds_tab_cbb', sel('cbb'));
  out.errors = errs;
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error('HARNESS FAIL', e); process.exit(1); });
