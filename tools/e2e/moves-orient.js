/* Which team a line belongs to (neutral-site games).
   Saved odds are "the HOME team's points", so they only mean something relative to who ESPN calls home.
   User bug (build 45): Moves showed  KENT -8 -> WYO -8  "16 pts"  on a game nobody had moved.
   A  ESPN re-labels home / away between two syncs -> saved lines must follow the TEAM, not the label:
      the card keeps naming the same favourite (even with Odds refresh off), and the next refresh records no move.
   B  the same re-label plus a real 3-cent drift -> Moves lists the drift, not a 16 pt "move".
   C  a line ALREADY saved mirrored (written by an older build) is shown as the drift it really was.
   D  ESPN's embedded DraftKings line on a neutral site can arrive keyed to the book's "home" (DUQ@HPU, 2026-11-24:
      details "HPU -10.5" but pointSpread.home +10.5): its own details text names the favourite, so use it. */
const { chromium } = require('playwright');
function pad(n) { return (n < 10 ? '0' : '') + n; }
function ymd(d) { return '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()); }
const TODAY = new Date();
const START = (() => { const d = new Date(TODAY); d.setHours(23, 30, 0, 0); return d.toISOString(); })();
const NYK = ['NYK', 'New York Knicks', 'New York', 'Knicks'], BOC = ['BOC', 'Boston Celtics', 'Boston', 'Celtics'];
const world = {
  flip: false,                                   // ESPN lists BOC as "home" (NYK "away") when true
  pinOn: true,
  pin: { sp: -8, hp: -114, ap: -102, tot: 144.5, o: -117, u: -103 },   // Pinnacle: NYK (its home) -8, always the same team
  eo: null                                       // ESPN embedded odds object (D)
};
let fails = 0;
function check(n, ok, x) { console.log((ok ? 'PASS ' : 'FAIL ') + n + (!ok && x !== undefined ? '  -> ' + JSON.stringify(x) : '')); if (!ok) fails++; }
function team(t, ha) { return { homeAway: ha, score: '0', linescores: [], records: [], team: { abbreviation: t[0], displayName: t[1], location: t[2], shortDisplayName: t[3], color: '123456' } }; }
function espnEvent() {
  const h = world.flip ? BOC : NYK, a = world.flip ? NYK : BOC;
  const c = { timeValid: true, competitors: [team(h, 'home'), team(a, 'away')] };
  if (world.eo) c.odds = [world.eo];
  return { id: 'g1', date: START, status: { type: { state: 'pre', completed: false, shortDetail: '7:30 PM', detail: '7:30 PM', name: 'STATUS_SCHEDULED', description: 'Scheduled' }, period: 0 }, competitions: [c] };
}
function mk(type, a, b) { return { matchupId: 9001, type, period: 0, isAlternate: false, status: 'open', prices: [a, b] }; }
function pinnacle(url) {
  if (!world.pinOn) return [];
  if (/\/matchups/.test(url)) return [{ id: 9001, type: 'matchup', startTime: START, participants: [{ alignment: 'home', name: NYK[1] }, { alignment: 'away', name: BOC[1] }] }];
  const p = world.pin;
  return [mk('spread', { designation: 'home', points: p.sp, price: p.hp }, { designation: 'away', points: -p.sp, price: p.ap }),
    mk('total', { designation: 'over', points: p.tot, price: p.o }, { designation: 'under', points: p.tot, price: p.u })];
}
function espnOdds(details, homeLine, awayLine, homeMl, awayMl) {
  return { provider: { name: 'DraftKings' }, details, overUnder: 141.5,
    pointSpread: { home: { close: { line: homeLine, odds: '-112' } }, away: { close: { line: awayLine, odds: '-108' } } },
    moneyline: { home: { close: { odds: homeMl } }, away: { close: { odds: awayMl } } },
    total: { over: { close: { line: 'o141.5', odds: '-110' } }, under: { close: { line: 'u141.5', odds: '-110' } } } };
}
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 411, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  let pinCalls = 0;
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith('http://localhost:8765/')) return route.continue();
    const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (url.startsWith('https://site.api.espn.com/')) {
      const m = /sports\/([^?]+)\/scoreboard\?dates=(\d{8})/.exec(url);
      return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ events: (m && m[1] === 'basketball/nba' && m[2] === ymd(TODAY)) ? [espnEvent()] : [] }) });
    }
    if (url.startsWith('https://guest.api.arcadia.pinnacle.com/')) { pinCalls++; return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(/leagues\/487\//.test(url) ? pinnacle(url) : []) }); }
    return route.fulfill({ status: 404, headers: cors, body: '{}' });
  });
  const settle = ms => page.waitForTimeout(ms || 700);
  async function sync() { await page.click('#syncBtn'); await page.waitForFunction(() => !document.querySelector('#syncBtn').disabled, null, { timeout: 15000 }); await settle(1100); }
  const okey = 'sbx2:o-nba:' + ymd(TODAY);
  const stored = () => page.evaluate(k => { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; }, okey);
  const pinBook = async () => { const o = await stored(); return o && o.games.g1 && o.games.g1.b.pinnacle; };
  /* a saved line says which team its "home" numbers belong to (ho); this is how it reads from `home`'s side (what the card shows) */
  const seen = (p, home) => (p && p.ho && p.ho !== home && p.sp) ? { sp: { h: -p.sp.h, hp: p.sp.ap, ap: p.sp.hp } } : p;
  const text = async sel => (await page.textContent(sel)).replace(/\s+/g, ' ');
  async function moves() { await page.click('#tabs button.mvtab'); await settle(600); return text('#games'); }
  async function toggleRefresh() { await page.click('#optBtn'); await settle(300); await page.click('#orfBtn'); await settle(300); await page.click('#optBtn'); await settle(300); }
  async function listTab() { await page.click('#tabs button[data-lg="nba"]'); await settle(500); }

  await page.goto('http://localhost:8765/index.html?v=99');
  await settle(700);
  await page.click('#oddsBtn');

  /* ===== A. ESPN swaps home/away between two syncs; nothing about the line changes ===== */
  await sync();
  let pin = await pinBook();
  check('A1 sync 1 (NYK home): saved as NYK -8, NYK price -114', pin && pin.full.sp.h === -8 && pin.full.sp.hp === -114 && pin.full.sp.ap === -102, pin && pin.full);
  let t = await text('#games');
  check('A2 card board: NYK -8 / BOC +8', /NYKKnicks−8/.test(t) && /BOCCeltics\+8/.test(t), t.slice(0, 300));

  world.flip = true;                              // ESPN now says BOC is home
  await toggleRefresh();                          // Odds refresh OFF: the schedule refreshes, the odds do not
  const before = pinCalls;
  await sync();
  check('A3 Odds refresh off: no Pinnacle call', pinCalls === before, [before, pinCalls]);
  pin = await pinBook();
  check('A4 saved line followed the TEAM: read from BOC (the new home) it is BOC +8 (NYK -8), NYK price still -114', (v => v && v.sp.h === 8 && v.sp.hp === -102 && v.sp.ap === -114)(seen(pin && pin.full, 'BOC')), pin && pin.full);
  t = await text('#games');
  check('A5 card board STILL NYK -8 / BOC +8 (not BOC -8)', /NYKKnicks−8/.test(t) && /BOCCeltics\+8/.test(t) && !/BOCCeltics−8/.test(t), t.slice(0, 300));

  await toggleRefresh();                          // refresh back on; Pinnacle unchanged
  await sync();
  pin = await pinBook();
  check('A6 refresh with unchanged Pinnacle: no move recorded', pin && !pin.pv, pin && pin.pv);
  t = await moves();
  check('A7 Moves tab says nothing moved', /No lines have moved yet/.test(t), t.slice(0, 300));
  await listTab();

  /* ===== B. another re-label + a real 3-cent drift and a 1-point total move ===== */
  world.flip = false;
  world.pin = { sp: -8, hp: -117, ap: 101, tot: 143.5, o: -111, u: -109 };
  await sync();
  pin = await pinBook();
  check('B1 saved: NYK -8 at -117 / BOC +8 at +101', pin && pin.full.sp.h === -8 && pin.full.sp.hp === -117 && pin.full.sp.ap === 101, pin && pin.full);
  check('B2 previous line kept for NYK -8 at -114 (read from NYK, the home team now; not a mirrored copy)', (v => v && v.sp.h === -8 && v.sp.hp === -114)(seen(pin && pin.pv && pin.pv.full && pin.pv.full.p, 'NYK')), pin && pin.pv);
  t = await moves();
  console.log('--- ' + t.slice(0, 420));
  check('B3 Moves lists the 1 pt total drop', /144\.5\s*→\s*143\.5/.test(t) && /1 pt/.test(t));
  check('B4 Moves shows NO 16 pt spread "move"', !/16 pts/.test(t) && !/8 pts/.test(t) && !/BOC −8/.test(t), t.slice(0, 400));
  check('B5 spread listed as the 3 cent drift', /3¢/.test(t), t.slice(0, 400));
  await listTab();

  /* ===== C. a mirrored "previous" line already saved by an older build is shown as the drift it was ===== */
  await page.evaluate(([k, now]) => {
    const o = JSON.parse(localStorage.getItem(k)), b = o.games.g1.b.pinnacle;
    b.pv = { full: { at: now - 3600000, p: { sp: { h: 8, hp: -102, ap: -114 }, tot: { p: 144.5, o: -117, u: -103 }, ml: null } } };   // NYK -8 seen from the wrong side
    localStorage.setItem(k, JSON.stringify(o));
  }, [okey, Date.now()]);
  await page.reload(); await settle(900);
  await page.click('#tabs button.mvtab'); await settle(600);
  t = await text('#games');
  check('C1 stale mirrored previous line: no 16 pts / 8 pts, no BOC -8', !/16 pts/.test(t) && !/8 pts/.test(t) && !/BOC −8/.test(t), t.slice(0, 400));
  check('C2 ...and the real drift is still listed (1 pt total, 3¢ spread)', /1 pt/.test(t) && /3¢/.test(t), t.slice(0, 400));
  /* a genuine favourite switch (not a mirror) must still be reported in full */
  await page.evaluate(([k, now]) => {
    const o = JSON.parse(localStorage.getItem(k)), b = o.games.g1.b.pinnacle;
    b.pv = { full: { at: now - 3600000, p: { sp: { h: 3, hp: -110, ap: -110 }, tot: { p: 143.5, o: -111, u: -109 }, ml: null } } };   // BOC -3 -> NYK -8 : an 11 point swing, not a mirror
    localStorage.setItem(k, JSON.stringify(o));
  }, [okey, Date.now()]);
  await page.reload(); await settle(900);
  await page.click('#tabs button.mvtab'); await settle(600);
  t = await text('#games');
  check('C3 a real favourite switch (BOC -3 -> NYK -8) is still shown as 11 pts', /BOC −3\s*→\s*NYK −8/.test(t) && /11 pts/.test(t), t.slice(0, 400));
  /* lines that say which team they are for need no guessing: a same-size switch of favourite (NYK -4.5 -> BOC -4.5, say a star ruled out) is a REAL 9 point move */
  await page.evaluate(([k, now]) => {
    const o = JSON.parse(localStorage.getItem(k)), b = o.games.g1.b.pinnacle;
    b.full = { sp: { h: 4.5, hp: -110, ap: -110 }, tot: { p: 143.5, o: -111, u: -109 }, ml: null, ho: 'NYK' };
    b.pv = { full: { at: now - 3600000, p: { sp: { h: -4.5, hp: -110, ap: -110 }, tot: { p: 143.5, o: -111, u: -109 }, ml: null, ho: 'NYK' } } };
    localStorage.setItem(k, JSON.stringify(o));
  }, [okey, Date.now()]);
  await page.reload(); await settle(900);
  await page.click('#tabs button.mvtab'); await settle(600);
  t = await text('#games');
  check('C4 stamped lines: a same-size favourite switch (NYK -4.5 -> BOC -4.5) is shown as the 9 pt move it is, not guessed to be a mirrored save', /NYK −4\.5\s*→\s*BOC −4\.5/.test(t) && /9 pts/.test(t), t.slice(0, 400));

  /* ===== D. ESPN's embedded DraftKings line: details names the favourite ===== */
  world.pinOn = false; world.flip = false;
  await page.evaluate(() => { Object.keys(localStorage).forEach(k => { if (/^sbx2:(o-)?nba:/.test(k)) localStorage.removeItem(k); }); });
  await page.reload(); await settle(700);
  world.eo = espnOdds('NYK -10.5', '+10.5', '-10.5', '+410', '-520');        // home = NYK, but the "home" fields describe the underdog
  await sync();
  let o = await stored(), dk = o && o.games.g1 && o.games.g1.b.draftkings;
  check('D1 details "NYK -10.5" beats pointSpread.home "+10.5": saved NYK -10.5', dk && dk.full.sp && dk.full.sp.h === -10.5 && dk.full.sp.hp === -108 && dk.full.sp.ap === -112, dk && dk.full);
  check('D2 total untouched', dk && dk.full.tot && dk.full.tot.p === 141.5, dk && dk.full);
  await page.evaluate(() => { Object.keys(localStorage).forEach(k => { if (/^sbx2:(o-)?nba:/.test(k)) localStorage.removeItem(k); }); });
  await page.reload(); await settle(700);
  world.eo = espnOdds('NYK -10.5', '-10.5', '+10.5', '-520', '+410');        // consistent payload: left alone
  await sync();
  o = await stored(); dk = o && o.games.g1 && o.games.g1.b.draftkings;
  check('D3 consistent ESPN payload is not touched (NYK -10.5)', dk && dk.full.sp && dk.full.sp.h === -10.5 && dk.full.sp.hp === -112, dk && dk.full);
  await page.evaluate(() => { Object.keys(localStorage).forEach(k => { if (/^sbx2:(o-)?nba:/.test(k)) localStorage.removeItem(k); }); });
  await page.reload(); await settle(700);
  world.eo = espnOdds('EVEN', '+0.5', '-0.5', '-105', '-105');                // no favourite named: nothing to go on
  await sync();
  o = await stored(); dk = o && o.games.g1 && o.games.g1.b.draftkings;
  check('D4 pick\'em text ("EVEN") is not used to flip anything', dk && dk.full.sp && dk.full.sp.h === 0.5, dk && dk.full);

  console.log(fails ? fails + ' FAILURE(S)' : 'ALL PASSED');
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
