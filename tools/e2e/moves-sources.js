/* Two sources writing the same book (ESPN's embedded DraftKings line + PropLine's DraftKings line):
   an unchanged line must NOT look like a move; a real PropLine change must. */
const { chromium } = require('playwright');
function pad(n) { return (n < 10 ? '0' : '') + n; }
function ymd(d) { return '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()); }
const TODAY = new Date();
const START = (() => { const d = new Date(TODAY); d.setHours(23, 30, 0, 0); return d.toISOString(); })();
const world = { pl: { sp: -5, tot: 154 }, espn: { sp: -5.5, tot: 153.5 }, calls: { pl: 0, pin: 0 } };
let fails = 0;
function check(n, ok, x) { console.log((ok ? 'PASS ' : 'FAIL ') + n + (!ok && x !== undefined ? '  -> ' + JSON.stringify(x) : '')); if (!ok) fails++; }
function espnEvent() {
  const t = (abbr, full, loc, nick, ha) => ({ homeAway: ha, score: '0', linescores: [], records: [], team: { abbreviation: abbr, displayName: full, location: loc, shortDisplayName: nick, color: '123456' } });
  return { id: 'g1', date: START, status: { type: { state: 'pre', completed: false, shortDetail: '7:30 PM', detail: '7:30 PM', name: 'STATUS_SCHEDULED', description: 'Scheduled' }, period: 0 },
    competitions: [{ timeValid: true, competitors: [t('NYK', 'New York Knicks', 'New York', 'Knicks', 'home'), t('BOS', 'Boston Celtics', 'Boston', 'Celtics', 'away')],
      odds: [{ provider: { displayName: 'DraftKings', name: 'DraftKings' },
        pointSpread: { home: { close: { line: String(world.espn.sp), odds: '-110' } }, away: { close: { line: '+' + (-world.espn.sp), odds: '-110' } } },
        total: { over: { close: { line: 'o' + world.espn.tot, odds: '-110' } }, under: { close: { line: 'u' + world.espn.tot, odds: '-110' } } } }] }] };
}
function plBody() {
  return [{ id: 'e1', home_team: 'New York Knicks', away_team: 'Boston Celtics', commence_time: START,
    bookmakers: [{ key: 'draftkings', title: 'DraftKings', markets: [
      { key: 'spreads', outcomes: [{ name: 'New York Knicks', price: -110, point: world.pl.sp }, { name: 'Boston Celtics', price: -110, point: -world.pl.sp }] },
      { key: 'totals', outcomes: [{ name: 'Over', price: -110, point: world.pl.tot }, { name: 'Under', price: -110, point: world.pl.tot }] }] }] }];
}
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 411, height: 900 } });
  await ctx.addInitScript(() => { if (!localStorage.getItem('sbx2:okeys')) localStorage.setItem('sbx2:okeys', JSON.stringify({ propline: [{ k: 'abcdefgh12345678', until: 0, rem: null, bad: false }] })); });
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith('http://localhost:8765/')) return route.continue();
    const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (url.startsWith('https://site.api.espn.com/')) {
      const m = /sports\/([^?]+)\/scoreboard\?dates=(\d{8})/.exec(url);
      return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ events: (m && m[1] === 'basketball/nba' && m[2] === ymd(TODAY)) ? [espnEvent()] : [] }) });
    }
    if (url.startsWith('https://guest.api.arcadia.pinnacle.com/')) { world.calls.pin++; return route.fulfill({ status: 200, headers: cors, body: '[]' }); }
    if (url.startsWith('https://api.prop-line.com/')) { world.calls.pl++; return route.fulfill({ status: 200, headers: cors, body: /period=/.test(url) ? '[]' : JSON.stringify(plBody()) }); }
    return route.fulfill({ status: 404, headers: cors, body: '{}' });
  });
  async function sync() { await page.click('#syncBtn'); await page.waitForFunction(() => !document.querySelector('#syncBtn').disabled, null, { timeout: 15000 }); await page.waitForTimeout(1200); }
  const stored = () => page.evaluate((k) => { const raw = localStorage.getItem(k); return raw ? JSON.parse(raw) : null; }, 'sbx2:o-nba:' + ymd(TODAY));
  await page.goto('http://localhost:8765/index.html?v=97');
  await page.waitForTimeout(600);
  await page.click('#oddsBtn');
  await sync();
  let o = await stored();
  let dk = o && o.games.g1 && o.games.g1.b.draftkings;
  check('sync 1: DraftKings stored from PropLine', dk && dk.s === 'propline' && dk.full.sp.h === -5 && dk.full.tot.p === 154, dk);
  check('sync 1: PropLine was called', world.calls.pl >= 1, world.calls);
  await sync();
  o = await stored(); dk = o.games.g1.b.draftkings;
  check('sync 2 (nothing changed): no false move from ESPN/PropLine alternation', !dk.pv, dk.pv);
  await page.click('#tabs button.mvtab'); await page.waitForTimeout(500);
  check('Moves tab says nothing moved', /No lines have moved yet/.test(await page.textContent('#games')));

  world.pl = { sp: -6, tot: 156 };
  await sync();
  o = await stored(); dk = o.games.g1.b.draftkings;
  check('sync 3: real PropLine move recorded against the PREVIOUS PropLine line', dk.pv && dk.pv.full && dk.pv.full.p.sp.h === -5 && dk.pv.full.p.tot.p === 154 && dk.full.sp.h === -6, dk.pv);
  const t = (await page.textContent('#games')).replace(/\s+/g, ' ');
  console.log('--- ' + t.slice(0, 500));
  check('Moves shows NYK −5 → NYK −6 (1 pt) and 154 → 156 (▲ 2 pts)', /NYK −5\s*→\s*NYK −6/.test(t) && /1 pt/.test(t) && /154\s*→\s*156/.test(t) && /2 pts/.test(t), t.slice(0, 400));
  check('book tag shown for non-Pinnacle book', /DraftKings/.test(t));
  console.log(fails ? fails + ' FAILURE(S)' : 'ALL PASSED');
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
