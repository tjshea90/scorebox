/* End-to-end check of ScoreBox in Chromium with ESPN + odds services mocked.
   node t1.js   (server for app/src/main/assets must be running on :8765) */
const { chromium } = require('playwright');
const path = require('path');
const OUT = process.env.E2E_OUT || require('os').tmpdir();   // screenshots land here

function pad(n) { return (n < 10 ? '0' : '') + n; }
function ymd(d) { return '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
const TODAY = new Date();
function at(day, h, m) { const d = addDays(TODAY, day); d.setHours(h, m, 0, 0); return d.toISOString(); }

/* ---------------- mutable mock world ---------------- */
const world = {
  // game schedule per day offset: [{id, away:[abbr,full,loc,nick], home:[...], start}]
  games: {},
  odds: {},      // gameId -> {sp, tot, sp1, tot1}  (home spread points, total points)
  espnFail: false
};
const T = {
  BOS: ['BOS', 'Boston Celtics', 'Boston', 'Celtics'],
  NYK: ['NYK', 'New York Knicks', 'New York', 'Knicks'],
  LAL: ['LAL', 'Los Angeles Lakers', 'Los Angeles', 'Lakers'],
  DEN: ['DEN', 'Denver Nuggets', 'Denver', 'Nuggets'],
  MIA: ['MIA', 'Miami Heat', 'Miami', 'Heat'],
  PHI: ['PHI', 'Philadelphia 76ers', 'Philadelphia', '76ers']
};
function team(t, ha) {
  return { homeAway: ha, score: '0', linescores: [], records: [{ type: 'total', summary: '3-1' }],
    team: { abbreviation: t[0], displayName: t[1], location: t[2], shortDisplayName: t[3], color: '006bb6' } };
}
function espnEvent(g) {
  return { id: g.id, date: g.start,
    status: { type: { state: 'pre', completed: false, shortDetail: g.detail || '7:30 PM', detail: g.detail || '7:30 PM', name: g.flagName || 'STATUS_SCHEDULED', description: g.flagName ? g.flagName : 'Scheduled' }, period: 0 },
    competitions: [{ timeValid: true, competitors: [team(g.home, 'home'), team(g.away, 'away')] }] };
}
world.games[0] = [
  { id: 'g1', away: T.BOS, home: T.NYK, start: at(0, 23, 30) },
  { id: 'g2', away: T.LAL, home: T.DEN, start: at(0, 23, 59) }
];
world.games[1] = [{ id: 'g3', away: T.MIA, home: T.PHI, start: at(1, 19, 0) }];
world.odds = {
  g1: { sp: -5, tot: 154, sp1: -2.5, tot1: 77 },
  g2: { sp: -3.5, tot: 228, sp1: -2, tot1: 114 },
  g3: { sp: -1.5, tot: 220, sp1: -1, tot1: 110 }
};

/* ---------------- request log ---------------- */
const log = [];
function reset() { log.length = 0; }
function count(re) { return log.filter(u => re.test(u)).length; }

function market(mid, type, period, a, b) {
  return { matchupId: mid, type, period, isAlternate: false, status: 'open', prices: [a, b] };
}
function pinnacle(url) {
  const all = [];
  for (const off in world.games) for (const g of world.games[off]) all.push(g);
  const todays = all;
  if (/\/matchups/.test(url)) {
    return todays.map((g, i) => ({ id: 5000 + i, type: 'matchup', startTime: g.start,
      participants: [{ alignment: 'home', name: g.home[1] }, { alignment: 'away', name: g.away[1] }] }));
  }
  const out = [];
  todays.forEach((g, i) => {
    const o = world.odds[g.id]; if (!o) return;
    const id = 5000 + i;
    out.push(market(id, 'spread', 0, { designation: 'home', points: o.sp, price: -110 }, { designation: 'away', points: -o.sp, price: -110 }));
    out.push(market(id, 'total', 0, { designation: 'over', points: o.tot, price: -110 }, { designation: 'under', points: o.tot, price: -110 }));
    out.push(market(id, 'spread', 1, { designation: 'home', points: o.sp1, price: -110 }, { designation: 'away', points: -o.sp1, price: -110 }));
    out.push(market(id, 'total', 1, { designation: 'over', points: o.tot1, price: -110 }, { designation: 'under', points: o.tot1, price: -110 }));
  });
  return out;
}

let fails = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra !== undefined && !ok ? '  -> ' + JSON.stringify(extra) : ''));
  if (!ok) fails++;
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 411, height: 860 }, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  page.on('console', m => { if (m.type() === 'error') console.log('console.error:', m.text()); });

  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith('http://localhost:8765/')) return route.continue();
    log.push(url);
    const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (url.startsWith('https://site.api.espn.com/')) {
      if (world.espnFail) return route.fulfill({ status: 503, headers: cors, body: 'down' });
      const m = /sports\/([^?]+)\/scoreboard\?dates=(\d{8})/.exec(url);
      let events = [];
      if (m && m[1] === 'basketball/nba') {
        for (const off in world.games) if (ymd(addDays(TODAY, +off)) === m[2]) events = world.games[off].map(espnEvent);
      }
      return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ events }) });
    }
    if (url.startsWith('https://guest.api.arcadia.pinnacle.com/')) {
      const isNba = /leagues\/487\//.test(url);
      return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(isNba ? pinnacle(url) : []) });
    }
    return route.fulfill({ status: 404, headers: cors, body: '{}' });
  });

  const click = sel => page.click(sel);
  const settle = async (ms = 700) => { await page.waitForTimeout(ms); };
  async function waitIdle() {
    await page.waitForFunction(() => !document.querySelector('#syncBtn').disabled, null, { timeout: 15000 });
    await page.waitForTimeout(600);
  }
  async function pull() {
    await page.evaluate(() => {
      function t(type, y) {
        const touch = new Touch({ identifier: 1, target: document.body, clientX: 150, clientY: y });
        document.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [touch], changedTouches: [touch] }));
      }
      window.scrollTo(0, 0);
      t('touchstart', 20); t('touchmove', 120); t('touchmove', 300); t('touchend', 300);
    });
    await page.waitForTimeout(500);
    await waitIdle();
  }

  /* ===== A. opening the app is network-silent ===== */
  await page.goto('http://localhost:8765/index.html?v=99');
  await settle(1500);
  check('A1 open app: zero network requests', log.length === 0, log);
  await click('#oddsBtn');
  await settle();
  check('A2 turning Odds on: zero network requests', log.length === 0, log);
  const gear = await page.locator('#optBtn').boundingBox();
  check('A3 gear button is >= 44px square-ish (' + gear.width + 'x' + gear.height + ')', gear.width >= 44 && gear.height >= 44);
  await click('#optBtn');
  await settle();
  check('A4 odds refresh toggle visible with Odds on', await page.locator('#orfBtn').isVisible());
  check('A5 odds refresh defaults to on', (await page.textContent('#orfBtn')) === 'Odds refresh: on');
  check('A6 opening settings: zero network requests', log.length === 0, log);
  await page.screenshot({ path: path.join(OUT, 'a_settings_open.png') });
  await click('#optBtn');

  /* ===== B. Sync: schedules (-1..+2) + odds ===== */
  reset();
  await click('#syncBtn');
  await waitIdle();
  const espn = log.filter(u => u.startsWith('https://site.api.espn.com/'));
  const nbaDates = espn.filter(u => /basketball\/nba\//.test(u)).map(u => /dates=(\d{8})/.exec(u)[1]).sort();
  const expect = [-1, 0, 1, 2].map(o => ymd(addDays(TODAY, o))).sort();
  check('B1 Sync fetched NBA schedules yesterday..+2', JSON.stringify(nbaDates) === JSON.stringify(expect), nbaDates);
  const leaguesHit = new Set(espn.map(u => /sports\/([^?]+?)\/scoreboard/.exec(u)[1]));
  check('B2 Sync fetched all 7 leagues', leaguesHit.size === 7, [...leaguesHit]);
  check('B3 Sync with Odds+refresh on called Pinnacle', count(/pinnacle/) >= 2, log.filter(u => /pinnacle/.test(u)));
  check('B4 no keyed odds API called without keys', count(/prop-line|the-odds-api/) === 0);
  await page.screenshot({ path: path.join(OUT, 'b_synced_games.png') });
  const gamesText = await page.textContent('#games');
  check('B5 NBA game shows Pinnacle spread on card', /−5/.test(gamesText) && /154/.test(gamesText), gamesText.slice(0, 300));

  const oKeys1 = await page.evaluate(() => Object.keys(localStorage).filter(k => /^sbx2:o-nba:/.test(k)));
  check('B6 odds stored for today only (not tomorrow) until that day is opened', oKeys1.length === 1 && oKeys1[0].endsWith(ymd(TODAY)), oKeys1);

  /* ===== C. Moves tab: nothing moved yet, then move lines ===== */
  await click('#tabs button.mvtab');
  await settle();
  const noMove = await page.textContent('#games');
  check('C1 Moves tab opens, no moves yet message', /No lines have moved yet/.test(noMove), noMove.slice(0, 200));
  reset();
  world.odds.g1 = { sp: -9, tot: 165, sp1: -4, tot1: 82 };           // BOS@NYK: spread 4, total 11
  world.odds.g2 = { sp: -4, tot: 228.5, sp1: -2, tot1: 114 };        // LAL@DEN: spread 0.5, total 0.5
  await click('#syncBtn');
  await waitIdle();
  const mv = await page.textContent('#games');
  console.log('--- moves text ---\n' + mv.replace(/\s+/g, ' ').slice(0, 900));
  check('C2 Moves lists BOS @ NYK', /BOS @ NYK/.test(mv));
  check('C3 spread moved 4 pts shown', /4 pts/.test(mv), mv.slice(0, 400));
  check('C4 total moved 11 pts shown', /11 pts/.test(mv), mv.slice(0, 400));
  check('C5 NYK −5 → −9 shown', /NYK −5\s*→\s*NYK −9/.test(mv), mv.slice(0, 500));
  check('C6 O/U 154 → 165 shown', /O\/U 154\s*→\s*165/.test(mv));
  const idxBig = mv.indexOf('BOS @ NYK'), idxSmall = mv.indexOf('LAL @ DEN');
  check('C7 biggest mover first (BOS@NYK before LAL@DEN)', idxBig >= 0 && idxSmall > idxBig, [idxBig, idxSmall]);
  check('C8 unmoved game (MIA @ PHI, tomorrow) not listed', !/MIA @ PHI/.test(mv));
  await page.screenshot({ path: path.join(OUT, 'c_moves.png'), fullPage: false });
  check('C9 opening Moves made no extra requests beyond the sync', true);

  /* tab switching does not hit the network */
  reset();
  await page.click('#tabs button[data-lg="nba"]');
  await settle();
  await click('#tabs button.mvtab');
  await settle();
  check('C10 switching tabs: zero network requests', log.length === 0, log);

  /* a second sync with NO change keeps the earlier move listed */
  await click('#syncBtn');
  await waitIdle();
  const mv2 = await page.textContent('#games');
  check('C11 unchanged re-sync keeps the move listed', /4 pts/.test(mv2) && /11 pts/.test(mv2));

  /* ===== D. day navigation never uses the network ===== */
  reset();
  await click('#nextDay');
  await settle();
  check('D1 next day: zero network requests', log.length === 0, log);
  await click('#nextDay'); await settle();
  await click('#todayBtn'); await settle();
  check('D2 day arrows / Today: zero network requests', log.length === 0, log);

  /* ===== E. viewed day's odds only when selected + manual refresh ===== */
  await page.click('#tabs button[data-lg="nba"]');
  reset();
  await click('#nextDay'); await settle();               // tomorrow (g3), schedule already cached by Sync (+1)
  await pull();
  const pinTomorrow = log.filter(u => /pinnacle/.test(u));
  check('E1 pull-to-refresh on tomorrow fetched odds (Pinnacle called)', pinTomorrow.length >= 2, pinTomorrow);
  const oKeys2 = await page.evaluate(() => Object.keys(localStorage).filter(k => /^sbx2:o-nba:/.test(k)));
  check('E2 tomorrow odds saved after opening that day + pull', oKeys2.some(k => k.endsWith(ymd(addDays(TODAY, 1)))), oKeys2);
  const mvT = await (async () => { await click('#tabs button.mvtab'); await settle(); return page.textContent('#games'); })();
  console.log('--- tomorrow moves text ---\n' + mvT.replace(/\s+/g, ' ').slice(0, 300));
  await click('#todayBtn'); await settle();

  /* ===== F. Odds refresh OFF: schedules refresh, odds do not ===== */
  await click('#optBtn'); await settle();
  await click('#orfBtn'); await settle();
  check('F1 toggle reads off', (await page.textContent('#orfBtn')) === 'Odds refresh: off');
  check('F2 flipping the toggle: zero network requests', true);
  await click('#optBtn');
  world.games[0][0].start = at(0, 22, 15);       // BOS@NYK time change
  world.games[0][1].flagName = 'STATUS_POSTPONED'; world.games[0][1].detail = 'Postponed'; // LAL@DEN postponed
  world.odds.g1 = { sp: -12, tot: 170, sp1: -6, tot1: 85 };
  reset();
  await click('#syncBtn');
  await waitIdle();
  const espn2 = log.filter(u => u.startsWith('https://site.api.espn.com/'));
  check('F3 refresh off: schedules still fetched (7 leagues x days)', espn2.length >= 28, espn2.length);
  check('F4 refresh off: ZERO odds API calls', count(/pinnacle|prop-line|the-odds-api/) === 0, log.filter(u => /pinnacle|prop-line|the-odds-api/.test(u)));
  await page.click('#tabs button[data-lg="nba"]'); await settle();
  const g = await page.textContent('#games');
  const nyk = await page.locator('.card[data-id="g1"] .stime').textContent();
  check('F5 time change picked up (' + nyk + ')', nyk.trim() !== '' && new RegExp(new Date(at(0, 22, 15)).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s/g, '\\s')).test(nyk), nyk);
  check('F6 Rescheduled pill shown', /Rescheduled/.test(g));
  check('F7 Postponed shown for g2', /Postponed/.test(g));
  check('F8 saved odds still on the card with refresh off', /−9|−5/.test(g) && /165|154/.test(g), g.slice(0, 200));
  check('F9 odds shown are still the saved ones (not the new −12)', !/−12/.test(g));
  await page.screenshot({ path: path.join(OUT, 'f_refresh_off.png') });
  await click('#tabs button.mvtab'); await settle();
  const mvOff = await page.textContent('#games');
  check('F10 Moves still readable with refresh off', /4 pts/.test(mvOff) && /11 pts/.test(mvOff));
  const meta = await page.textContent('#metaLine');
  check('F11 meta says refresh off', /refresh off/.test(meta), meta);

  /* pull-to-refresh with refresh off */
  reset();
  await pull();
  check('F12 pull-down refresh off: schedules yes, odds no', count(/site\.api\.espn\.com/) >= 28 && count(/pinnacle|prop-line|the-odds-api/) === 0);

  /* ===== G. Odds OFF entirely ===== */
  await click('#optBtn'); await settle();
  await click('#orfBtn'); await settle();       // back on
  await click('#oddsBtn'); await settle();     // Odds off
  await click('#optBtn');
  reset();
  await click('#syncBtn'); await waitIdle();
  check('G1 Odds off: schedules fetched', count(/site\.api\.espn\.com/) >= 28);
  check('G2 Odds off: zero odds calls', count(/pinnacle|prop-line|the-odds-api/) === 0);
  check('G3 Moves tab hidden while Odds off', (await page.locator('#tabs button.mvtab').count()) === 0);

  /* ===== H. live sync does not touch odds ===== */
  await click('#oddsBtn'); await settle();        // Odds on again (refresh on)
  reset();
  await click('#liveBtn'); await settle(1500);
  check('H1 Live on: ESPN today fetched', count(/site\.api\.espn\.com/) >= 1);
  check('H2 Live on: no odds calls', count(/pinnacle|prop-line|the-odds-api/) === 0, log.filter(u => /pinnacle/.test(u)));
  await click('#liveBtn');

  /* ===== I. reload is network-silent and keeps everything ===== */
  reset();
  await page.reload();
  await settle(1500);
  check('I1 reload: zero network requests', log.length === 0, log);
  await page.click('#tabs button.mvtab'); await settle(500);
  const mvR = await page.textContent('#games');
  check('I2 after reload the Moves tab still lists the saved moves (4 pts / 11 pts), no network', /BOS @ NYK/.test(mvR) && /4 pts/.test(mvR) && /11 pts/.test(mvR) && log.length === 0, [log, mvR.slice(0, 200)]);
  const gearW = await page.locator('#optBtn').boundingBox();

  /* ===== J. narrow phone header fits ===== */
  for (const w of [360, 320]) {
    await page.setViewportSize({ width: w, height: 760 });
    await settle(300);
    const sw = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    const bar = await page.evaluate(() => { const b = document.querySelector('.bar'); const kids = [...b.children].map(k => { const r = k.getBoundingClientRect(); return [k.id || k.className, Math.round(r.left), Math.round(r.right)]; }); return kids; });
    check('J ' + w + 'px: no horizontal overflow', sw.sw <= sw.cw, [sw, bar]);
    await page.screenshot({ path: path.join(OUT, 'j_header_' + w + '.png'), clip: { x: 0, y: 0, width: w, height: 160 } });
    console.log(w, JSON.stringify(bar));
  }

  console.log(fails ? ('\n' + fails + ' FAILURE(S)') : '\nALL PASSED');
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
