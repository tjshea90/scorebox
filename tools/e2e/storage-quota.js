/* A full localStorage must not silently lose data (server for app/src/main/assets on :8765, or E2E_PORT).
   The page is given a small quota BEFORE it loads (setItem throws QuotaExceededError past `cap` characters).
   1  cache full of old days: a Sync must evict the oldest past days and still save today's games
   2  no room at all: the day stays usable for this session (it used to be written to a memory copy nothing ever read) */
const { chromium } = require('playwright');
const PORT = process.env.E2E_PORT || 8765;

function pad(n) { return (n < 10 ? '0' : '') + n; }
function ymd(d) { return '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
const TODAY = new Date();

function side(abbr, ha, score) {
  return { homeAway: ha, score: String(score), linescores: [], winner: false, records: [{ type: 'total', summary: '1-0' }],
    team: { abbreviation: abbr, displayName: abbr + ' City', location: abbr, shortDisplayName: abbr, color: '1d428a' } };
}
function events() {
  return [0, 1, 2].map(i => {
    const d = new Date(TODAY); d.setHours(19 + i, 0, 0, 0);
    return { id: 'q' + i, date: d.toISOString(),
      status: { type: { state: 'pre', completed: false, shortDetail: '7:00 PM', detail: '7:00 PM', name: 'STATUS_SCHEDULED', description: 'Scheduled' }, period: 0 },
      competitions: [{ timeValid: true, competitors: [side('HQ' + i, 'home', 0), side('AQ' + i, 'away', 0)] }] };
  });
}

let fails = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''));
  if (!ok) fails++;
}

async function scenario(browser, cap, seedDays) {
  const ctx = await browser.newContext({ viewport: { width: 411, height: 860 }, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => { errs.push(e.message); });
  await page.addInitScript(({ cap, seeds }) => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      seeds.forEach(ds => localStorage.setItem('sbx2:nba:' + ds, JSON.stringify({ t: 1, games: [], pad: new Array(9000).join('x') })));
    }
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (this === window.localStorage) {
        let n = 0;
        for (let i = 0; i < localStorage.length; i++) { const kk = localStorage.key(i); if (kk !== k) n += kk.length + localStorage.getItem(kk).length; }
        if (n + k.length + String(v).length > cap) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      }
      return orig.call(this, k, v);
    };
  }, { cap, seeds: seedDays });
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith('http://localhost:' + PORT + '/')) return route.continue();
    const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    const m = /sports\/([^?]+)\/scoreboard\?dates=(\d{8})/.exec(url);
    const evs = (m && m[1] === 'basketball/nba' && m[2] === ymd(TODAY)) ? events() : [];
    return route.fulfill({ status: 200, headers: cors, body: m ? JSON.stringify({ events: evs }) : '[]' });
  });
  await page.goto('http://localhost:' + PORT + '/index.html?v=99');
  await page.waitForTimeout(500);
  await page.click('#syncBtn');
  await page.waitForFunction(() => !document.querySelector('#syncBtn').disabled, null, { timeout: 15000 });
  await page.waitForTimeout(600);
  const s = await page.evaluate(ds => ({
    cards: document.querySelectorAll('#games .card').length,
    empty: (document.querySelector('#games .empty .big') || {}).textContent || '',
    keys: Object.keys(localStorage).filter(k => k.indexOf('sbx2:') === 0).sort(),
    chars: Object.keys(localStorage).reduce((n, k) => n + k.length + localStorage.getItem(k).length, 0)
  }), null);
  await ctx.close();
  return { s, errs };
}

(async () => {
  const browser = await chromium.launch();
  const old = [9, 8, 7, 6, 5, 4, 3, 2].map(n => ymd(addDays(TODAY, -n)));     // 8 past days x ~9 KB
  const todayKey = 'sbx2:nba:' + ymd(TODAY);

  /* 1. full of old days: 8 seeds of ~9 KB = 72.2 KB; the cap leaves ~1.8 KB, less than the sync writes (~3.3 KB), so something must go */
  let r = await scenario(browser, 74000, old);
  check('1a Sync into a full cache still shows today\'s 3 games', r.s.cards === 3, r.s);
  check('1b ...and today\'s schedule really reached localStorage', r.s.keys.indexOf(todayKey) >= 0, r.s.keys.filter(k => k.indexOf(':nba:') > 0));
  check('1c ...by dropping the OLDEST past days first (' + old[0] + ' gone, ' + old[7] + ' kept)',
    r.s.keys.indexOf('sbx2:nba:' + old[0]) < 0 && r.s.keys.indexOf('sbx2:nba:' + old[7]) >= 0, r.s.keys.filter(k => k.indexOf(':nba:') > 0));
  check('1d ...staying inside the quota (' + r.s.chars + ' <= 74000)', r.s.chars <= 74000, r.s.chars);
  check('1e no script errors', r.errs.length === 0, r.errs);

  /* 2. no room whatsoever: nothing to evict, nothing fits */
  r = await scenario(browser, 60, []);
  check('2a with no storage room at all the day is still shown for this session (3 games)', r.s.cards === 3, r.s);
  check('2b no script errors', r.errs.length === 0, r.errs);

  console.log(fails ? '\n' + fails + ' check(s) FAILED' : '\nall storage-quota checks passed');
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
