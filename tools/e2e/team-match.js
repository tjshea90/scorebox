/* Every team is matched with ITS OWN score and ITS OWN odds -- whichever side anybody calls home.
   The oracle is keyed by TEAM, never by home / away: every number in the mock world (score, line score, spread, price,
   money line) identifies the team it belongs to, so one value sitting next to the wrong team fails a check.
   All seven leagues at once, six games each:
     g0 pre   ESPN's embedded DraftKings line only          g3 pre   The Odds API only
     g1 pre   Pinnacle only                                 g4 LIVE  (saved Pinnacle line from before the game) scores, line score, ball
     g2 pre   PropLine only                                 g5 FINAL (saved Pinnacle line) winner, covered, over/under
   Even games are flagged neutral-site, odd ones are not. Two syncs per scenario: the schedule (all pre), then game time
   (g4 live, g5 final). Who is called "home" is changed between / within them:
     V0  everybody agrees (B home)                         V3  ESPN re-labels at game time to match the sources (A home)
     V1  ESPN re-labels at game time (A home), sources B   V4  sources re-label at game time, ESPN stays
     V2  sources list A as home all along, ESPN says B
   Row order must be: neutral game -> the schedule's order (ESPN's first labels); other games -> ESPN's latest labels. */
const { chromium } = require('playwright');
function pad(n) { return (n < 10 ? '0' : '') + n; }
function ymd(d) { return '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()); }
const TODAY = new Date(), DAY = ymd(TODAY);
const MINUS = '−';
const fmtPts = v => (v === 0 ? 'PK' : (v > 0 ? '+' : MINUS) + Math.abs(v));
const fmtPrice = p => (p > 0 ? '+' + p : MINUS + Math.abs(p));
const other = k => (k === 'A' ? 'B' : 'A');
const startOf = gi => { const d = new Date(TODAY); d.setHours(23, 5 + gi * 5, 0, 0); return d.toISOString(); };

/* key, ESPN path, Pinnacle id, The Odds API / PropLine sport key, line-score shape, does the card show a money line */
const LG = {
  mlb: { slug: 'baseball/mlb', pin: 246, sk: 'baseball_mlb', kind: 'innings', ml: true, pro: true, cut: 5, cutOf: 'F5' },
  nba: { slug: 'basketball/nba', pin: 487, sk: 'basketball_nba', kind: 'quarters', ml: false, pro: true, cut: 2 },
  wnba: { slug: 'basketball/wnba', pin: 578, sk: 'basketball_wnba', kind: 'quarters', ml: false, pro: true, cut: 2 },
  nfl: { slug: 'football/nfl', pin: 889, sk: 'americanfootball_nfl', kind: 'quarters', ml: false, pro: true, cut: 2, football: true },
  cfb: { slug: 'football/college-football', pin: 880, sk: 'americanfootball_ncaaf', kind: 'quarters', ml: false, cut: 2, football: true },
  cbb: { slug: 'basketball/mens-college-basketball', pin: 493, sk: 'basketball_ncaab', kind: 'halves', ml: false, cut: 1 },
  nhl: { slug: 'hockey/nhl', pin: 1456, sk: 'icehockey_nhl', kind: 'periods', ml: true, pro: true, cut: 0 }   /* NHL shows full-game scores only */
};
const KEYS = Object.keys(LG);
const POOL = ['Aurora', 'Boulder', 'Cedar', 'Dakota', 'Elmwood', 'Fairview', 'Granite', 'Harbor', 'Ironwood', 'Juniper', 'Kestrel', 'Lakeside'];
const NICK = ['Hawks', 'Wolves', 'Bears', 'Lions', 'Tigers', 'Eagles', 'Sharks', 'Foxes', 'Owls', 'Stags', 'Rams', 'Herons'];
const BASE_TOTAL = { mlb: 8.5, nba: 220.5, wnba: 160.5, nfl: 44.5, cfb: 55.5, cbb: 140.5, nhl: 5.5 };
const SHAPE = { innings: { live: 6, fin: 9 }, quarters: { live: 3, fin: 4 }, halves: { live: 2, fin: 2 }, periods: { live: 2, fin: 3 } };

/* everything that is true about one game, by TEAM (A = first name, B = second) */
function truth(lk, gi) {
  const li = KEYS.indexOf(lk), L = LG[lk];
  const T = { fav: gi % 2 === 0 ? 'A' : 'B' };
  ['A', 'B'].forEach((k, j) => {
    const ix = gi * 2 + j;
    T[k] = { key: k, abbr: POOL[ix].slice(0, 3).toUpperCase(), full: POOL[ix] + ' ' + NICK[ix], loc: POOL[ix], short: L.pro ? NICK[ix] : POOL[ix], id: String(1000 + li * 100 + ix) };
  });
  const sp = (lk === 'nhl' || lk === 'mlb') ? 1.5 : 1.5 + gi;
  T.A.spread = T.fav === 'A' ? -sp : sp; T.B.spread = -T.A.spread;
  T.A.spPrice = -(110 + gi); T.B.spPrice = -(101 + 2 * gi);
  T.A.ml = T.fav === 'A' ? -(130 + 15 * gi) : 110 + 12 * gi; T.B.ml = T.fav === 'B' ? -(130 + 15 * gi) : 110 + 12 * gi;
  T.total = { line: BASE_TOTAL[lk] + gi * 0.5, over: -(108 + gi), under: -(120 - gi) };
  /* scores: live game (4) after the first segment, final game (5) complete; every team's numbers are its own */
  [['A', 3], ['B', 7]].forEach(p => {
    const k = p[0], tm = T[k];
    [['live', 4], ['fin', 5]].forEach(q => {
      const n = SHAPE[L.kind][q[0]], arr = [];
      for (let i = 0; i < n; i++) { arr.push(((q[1] * 3 + p[1] + i * (k === 'A' ? 2 : 3) + li) % 7) + (k === 'A' ? 1 : 0)); }
      tm[q[0]] = arr;
    });
  });
  /* the final: A must not tie B, and the covering side is worked out from the numbers */
  const sum = a => a.reduce((x, y) => x + y, 0);
  if (sum(T.A.fin) === sum(T.B.fin)) T.A.fin[T.A.fin.length - 1] += 1;
  if (sum(T.A.live) === sum(T.B.live)) T.A.live[T.A.live.length - 1] += 1;
  return T;
}
const sum = a => a.reduce((x, y) => x + y, 0);

/* the scenario variables: who is called home (team key) by ESPN / by the sources, at sync 1 and sync 2 */
const VARIANTS = [
  { n: 'V0 everybody agrees', L1: 'B', L2: 'B', S1: 'B', S2: 'B' },
  { n: 'V1 ESPN re-labels at game time', L1: 'B', L2: 'A', S1: 'B', S2: 'B' },
  { n: 'V2 sources list the other team home', L1: 'B', L2: 'B', S1: 'A', S2: 'A' },
  { n: 'V3 ESPN re-labels to match the sources', L1: 'B', L2: 'A', S1: 'A', S2: 'A' },
  { n: 'V4 sources re-label at game time', L1: 'B', L2: 'B', S1: 'B', S2: 'A' }
];
const world = { sync: 1, V: VARIANTS[0], hold: false, held: 0, gate: null, release: null };
const labelHome = () => (world.sync === 1 ? world.V.L1 : world.V.L2);
const sourceHome = () => (world.sync === 1 ? world.V.S1 : world.V.S2);
const stateOf = gi => (world.sync === 2 && gi === 4 ? 'in' : (world.sync === 2 && gi === 5 ? 'post' : 'pre'));

/* ----- ESPN ----- */
const STATUS = {
  pre: { state: 'pre', completed: false, shortDetail: '7:30 PM', detail: '7:30 PM', name: 'STATUS_SCHEDULED', description: 'Scheduled' },
  in: { state: 'in', completed: false, shortDetail: 'Live', detail: 'Live', name: 'STATUS_IN_PROGRESS', description: 'In Progress' },
  post: { state: 'post', completed: true, shortDetail: 'Final', detail: 'Final', name: 'STATUS_FINAL', description: 'Final' }
};
function espnOdds(lk, T, gi, home) {          /* the provider's line, keyed to ITS home team (not necessarily ESPN's) */
  const H = T[home], W = T[other(home)], L = LG[lk], fav = T.fav;
  const details = (lk === 'nhl' || lk === 'mlb') ? T[fav].abbr + ' ' + T[fav].ml : T[fav].abbr + ' -' + Math.abs(T[fav].spread);
  const num = v => (v > 0 ? '+' : '-') + Math.abs(v);
  const side = (k, flagFav) => ({ favorite: flagFav, underdog: !flagFav, team: { id: T[k].id, abbreviation: T[k].abbr, displayName: T[k].full }, favoriteAtOpen: flagFav });
  return {
    provider: { id: '100', name: 'DraftKings', displayName: 'DraftKings' }, details, overUnder: T.total.line, spread: H.spread,
    awayTeamOdds: side(other(home), other(home) === fav), homeTeamOdds: side(home, home === fav),
    pointSpread: { home: { close: { line: num(H.spread), odds: num(H.spPrice) } }, away: { close: { line: num(W.spread), odds: num(W.spPrice) } } },
    moneyline: { home: { close: { odds: num(H.ml) } }, away: { close: { odds: num(W.ml) } } },
    total: { over: { close: { line: 'o' + T.total.line, odds: num(T.total.over) } }, under: { close: { line: 'u' + T.total.line, odds: num(T.total.under) } } }
  };
}
function competitor(lk, T, gi, k, ha) {
  const t = T[k], st = stateOf(gi), live = st !== 'pre', L = LG[lk];
  const ls = st === 'in' ? t.live : (st === 'post' ? t.fin : []);
  const c = {
    id: t.id, homeAway: ha, score: live ? String(sum(ls)) : '0', linescores: ls.map(v => ({ value: v })), records: [],
    team: { id: t.id, abbreviation: t.abbr, displayName: t.full, location: t.loc, shortDisplayName: t.short, color: '123456', conferenceId: '9' }
  };
  if (st === 'post') { const o = T[other(k)]; c.winner = sum(t.fin) > sum(o.fin); }
  return c;
}
function espnEvent(lk, gi) {
  const T = truth(lk, gi), L = LG[lk], st = stateOf(gi), h = labelHome();
  const comp = { timeValid: true, neutralSite: gi % 2 === 0, competitors: [competitor(lk, T, gi, h, 'home'), competitor(lk, T, gi, other(h), 'away')] };
  if (gi === 0) comp.odds = [espnOdds(lk, T, gi, sourceHome())];
  if (L.football && st === 'in') comp.situation = { shortDownDistanceText: '2nd & 7', possessionText: T.A.abbr + ' 32', possession: T.A.id, isRedZone: false };
  const period = st === 'pre' ? 0 : (st === 'in' ? SHAPE[L.kind].live : SHAPE[L.kind].fin);
  return { id: lk + '-g' + gi, date: startOf(gi), status: { type: STATUS[st], period }, competitions: [comp] };
}
/* ----- Pinnacle ----- */
function pinnacle(lk, url) {
  const out = [];
  [1, 4, 5].forEach(gi => {                       /* g1 (pre), and g4 / g5 while they are still ahead (the sync-1 lines are what get saved) */
    const T = truth(lk, gi), home = sourceHome(), H = T[home], W = T[other(home)], id = 90000 + KEYS.indexOf(lk) * 10 + gi;
    if (/\/matchups/.test(url)) {
      out.push({ id, type: 'matchup', startTime: startOf(gi), participants: [{ alignment: 'home', name: H.loc }, { alignment: 'away', name: W.loc }] });
    } else {
      const mk = (type, prices) => ({ matchupId: id, type, period: 0, isAlternate: false, status: 'open', prices });
      out.push(mk('spread', [{ designation: 'home', points: H.spread, price: H.spPrice }, { designation: 'away', points: W.spread, price: W.spPrice }]));
      out.push(mk('total', [{ designation: 'over', points: T.total.line, price: T.total.over }, { designation: 'under', points: T.total.line, price: T.total.under }]));
      out.push(mk('moneyline', [{ designation: 'home', price: H.ml }, { designation: 'away', price: W.ml }]));
    }
  });
  return out;
}
/* ----- PropLine / The Odds API (the-odds-api's shape): one game each, one book each ----- */
function eaBody(lk, gi, bookKey, title) {
  const T = truth(lk, gi), home = sourceHome(), H = T[home], W = T[other(home)];
  return [{ id: 'ea-' + lk + gi, home_team: H.full, away_team: W.full, commence_time: startOf(gi),
    bookmakers: [{ key: bookKey, title, markets: [
      { key: 'spreads', outcomes: [{ name: H.full, price: H.spPrice, point: H.spread }, { name: W.full, price: W.spPrice, point: W.spread }] },
      { key: 'totals', outcomes: [{ name: 'Over', price: T.total.over, point: T.total.line }, { name: 'Under', price: T.total.under, point: T.total.line }] },
      { key: 'h2h', outcomes: [{ name: H.full, price: H.ml }, { name: W.full, price: W.ml }] }] }] }];
}
let fails = 0;
function check(n, ok, x) { console.log((ok ? 'PASS ' : 'FAIL ') + n + (!ok && x !== undefined ? '  -> ' + JSON.stringify(x) : '')); if (!ok) fails++; }

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 411, height: 900 } });
  await ctx.addInitScript(() => {
    if (!localStorage.getItem('sbx2:okeys')) localStorage.setItem('sbx2:okeys', JSON.stringify({
      propline: [{ k: 'abcdefgh12345678', until: 0, rem: null, bad: false }], oddsapi: [{ k: 'zyxwvuts87654321', until: 0, rem: null, bad: false }] }));
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.route('**/*', async route => {
    const url = route.request().url();
    if (url.startsWith('http://localhost:8765/')) return route.continue();
    const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    const ok = b => route.fulfill({ status: 200, headers: cors, body: JSON.stringify(b) });
    let m;
    if (url.startsWith('https://site.api.espn.com/')) {
      m = /sports\/([^?]+)\/scoreboard\?dates=(\d{8})/.exec(url);
      const lk = m && KEYS.filter(k => LG[k].slug === m[1])[0];
      return ok({ events: (lk && m[2] === DAY) ? [0, 1, 2, 3, 4, 5].map(gi => espnEvent(lk, gi)) : [] });
    }
    if (url.startsWith('https://guest.api.arcadia.pinnacle.com/')) {
      if (world.hold) { world.held++; await world.gate; }          /* the race scenario: the answer is held back until the test lets it through */
      m = /leagues\/(\d+)\//.exec(url);
      const lk = m && KEYS.filter(k => LG[k].pin === Number(m[1]))[0];
      return ok(lk ? pinnacle(lk, url) : []);
    }
    if (url.startsWith('https://api.prop-line.com/')) {
      m = /sports\/([a-z_]+)\/odds/.exec(url);
      const lk = m && KEYS.filter(k => LG[k].sk === m[1])[0];
      return ok(lk && !/period=/.test(url) ? eaBody(lk, 2, 'fanduel', 'FanDuel') : []);
    }
    if (url.startsWith('https://api.the-odds-api.com/')) {
      m = /sports\/([a-z_]+)\/odds/.exec(url);
      const lk = m && KEYS.filter(k => LG[k].sk === m[1])[0];
      if (/\/events\//.test(url)) return ok({});
      return ok(lk ? eaBody(lk, 3, 'betmgm', 'BetMGM') : []);
    }
    return route.fulfill({ status: 404, headers: cors, body: '{}' });
  });
  const settle = ms => page.waitForTimeout(ms || 700);
  const sig = () => page.evaluate(() => { let s = '', k; for (k in localStorage) { if (/^sbx2:/.test(k) && !/prefs|okeys/.test(k)) s += k + localStorage.getItem(k).length; } return s; });
  async function sync() {
    await page.click('#syncBtn');
    await page.waitForFunction(() => !document.querySelector('#syncBtn').disabled, null, { timeout: 20000 });
    let last = '', same = 0;
    for (let i = 0; i < 60 && same < 4; i++) { await settle(400); const s = await sig(); same = (s === last) ? same + 1 : 0; last = s; }   /* the odds rounds land after the schedule */
  }
  async function reset() {
    await page.evaluate(() => { Object.keys(localStorage).forEach(k => { if (/^sbx2:(o-)?[a-z]+:\d{8}$/.test(k)) localStorage.removeItem(k); }); });
    await page.reload(); await settle(800);
  }
  const cardData = id => page.evaluate(id => {
    const card = document.querySelector('.card[data-id="' + id + '"]');
    if (!card) return null;
    const t = e => (e ? e.textContent.replace(/\s+/g, ' ').trim() : null);
    const rows = Array.prototype.map.call(card.querySelectorAll('.trow'), r => {
      const odds = {};
      ['sp', 'tt', 'ml'].forEach(k => { const b = r.querySelector('.ob2.' + k); odds[k] = b ? { top: t(b.querySelector('.obt')), price: t(b.querySelector('.obp')) } : null; });
      return { abbr: t(r.querySelector('.tile')), score: t(r.querySelector('.score')), seg: t(r.querySelector('.f5col')), loser: r.classList.contains('loser'), ball: !!r.querySelector('.fbicon'), odds };
    });
    const ls = Array.prototype.map.call(card.querySelectorAll('table.ls tr'), tr => Array.prototype.map.call(tr.children, c => c.textContent.trim()));
    return { rows, ls, mini: t(card.querySelector('.odds.mini')) };
  }, id);

  await page.goto('http://localhost:8765/index.html?v=99');
  await settle(800);
  await page.click('#oddsBtn'); await settle(400);

  async function verifyAll(V) {
    const bad = {};
    for (const lk of KEYS) {
      const L = LG[lk], problems = [];
      await page.click('#tabs button[data-lg="' + lk + '"]'); await settle(350);
      for (let gi = 0; gi < 6; gi++) {
        const id = lk + '-g' + gi, T = truth(lk, gi), st = stateOf(gi), neutral = gi % 2 === 0;
        const c = await cardData(id), tag = id + ' ' + st + (neutral ? ' neutral' : '');
        if (!c || c.rows.length !== 2) { problems.push(tag + ': card missing / not two rows'); continue; }
        const homeKey = neutral ? V.L1 : V.L2, topKey = other(homeKey), order = [topKey, homeKey];
        if (c.rows[0].abbr !== T[topKey].abbr || c.rows[1].abbr !== T[homeKey].abbr) problems.push(tag + ': row order ' + c.rows.map(r => r.abbr).join('/') + ' expected ' + order.map(k => T[k].abbr).join('/'));
        c.rows.forEach((r, ri) => {
          const k = r.abbr === T.A.abbr ? 'A' : (r.abbr === T.B.abbr ? 'B' : null);
          if (!k) { problems.push(tag + ': unknown team ' + r.abbr); return; }
          const tm = T[k], where = tag + ' ' + tm.abbr + ': ';
          if (st !== 'pre') {
            const ls = st === 'in' ? tm.live : tm.fin;
            if (r.score !== String(sum(ls))) problems.push(where + 'score ' + r.score + ' expected ' + sum(ls));
            if (L.cut && r.seg !== String(sum(ls.slice(0, L.cut)))) problems.push(where + 'first-' + L.cut + ' ' + r.seg + ' expected ' + sum(ls.slice(0, L.cut)));
            if (!L.cut && r.seg) problems.push(where + 'unexpected segment cell ' + r.seg);
            if (st === 'post') { const won = sum(tm.fin) > sum(T[other(k)].fin); if (r.loser === won) problems.push(where + 'loser flag ' + r.loser + ' but ' + (won ? 'won' : 'lost')); }
            if (L.football && st === 'in' && r.ball !== (k === 'A')) problems.push(where + 'ball ' + r.ball);
            if (L.kind !== 'periods') {
              const row = c.ls.filter(x => x[0] === tm.abbr)[0];
              if (!row) problems.push(where + 'no line-score row');
              else {
                const vals = ls.map(String), got = row.slice(1, 1 + vals.length);
                if (got.join() !== vals.join() || row[row.length - 1] !== String(sum(ls))) problems.push(where + 'line score ' + row.join(',') + ' expected ' + vals.join(',') + ' / ' + sum(ls));
              }
            }
          } else {
            const o = r.odds;
            if (!o.sp || o.sp.top !== fmtPts(tm.spread) || o.sp.price !== fmtPrice(tm.spPrice)) problems.push(where + 'spread ' + JSON.stringify(o.sp) + ' expected ' + fmtPts(tm.spread) + ' ' + fmtPrice(tm.spPrice));
            const tt = ri === 0 ? ['O ' + T.total.line, fmtPrice(T.total.over)] : ['U ' + T.total.line, fmtPrice(T.total.under)];
            if (!o.tt || o.tt.top !== tt[0] || o.tt.price !== tt[1]) problems.push(where + 'total ' + JSON.stringify(o.tt) + ' expected ' + tt.join(' '));
            if (L.ml && (!o.ml || o.ml.price !== fmtPrice(tm.ml))) problems.push(where + 'money line ' + JSON.stringify(o.ml) + ' expected ' + fmtPrice(tm.ml));
          }
        });
        if (st !== 'pre') {                      /* the saved pre-game line, read back with the finished / live scores */
          const fav = T[T.fav], mini = c.mini || '', sa = sum(T.A[st === 'in' ? 'live' : 'fin']), sb = sum(T.B[st === 'in' ? 'live' : 'fin']);
          if (mini.indexOf(fav.abbr + ' ' + fmtPts(-Math.abs(fav.spread))) < 0) problems.push(tag + ': saved spread should name ' + fav.abbr + ' ' + fmtPts(-Math.abs(fav.spread)) + ' -> ' + mini.slice(0, 120));
          if (L.ml && mini.indexOf('ML ' + fav.abbr + ' ' + fmtPrice(fav.ml)) < 0) problems.push(tag + ': saved money line should be ' + fav.abbr + ' ' + fmtPrice(fav.ml) + ' -> ' + mini.slice(0, 120));
          if (st === 'post') {
            const dA = sa + T.A.spread - sb, dB = sb + T.B.spread - sa, cover = dA > 0 ? 'A' : (dB > 0 ? 'B' : null);
            const want = cover ? T[cover].abbr + ' covered' : 'Spread push';
            if (mini.indexOf(want) < 0) problems.push(tag + ': expected "' + want + '" -> ' + mini.slice(0, 160));
          }
        }
      }
      if (problems.length) bad[lk] = problems;
    }
    return bad;
  }

  for (const V of VARIANTS) {
    await reset();
    world.V = V;
    world.sync = 1; await sync();                 /* the schedule: every game is still ahead */
    world.sync = 2; await sync();                 /* game time */
    const bad = await verifyAll(V);
    const names = Object.keys(bad);
    check(V.n + ': all 7 leagues, every score / line score / winner / ball / odds sits next to its own team', names.length === 0, names.length ? bad : undefined);
    if (names.length) names.forEach(lk => console.log('   ' + lk.toUpperCase() + ' (' + bad[lk].length + '): ' + bad[lk].slice(0, 4).join(' | ').slice(0, 700)));
  }

  /* ===== R. a download that started BEFORE ESPN re-labelled a game lands AFTER it =====
     Live sync (and the tracked game's timer) save the schedule while an odds download is still in flight, so a line matched to
     the OLD labels can arrive after the schedule has been re-labelled. Each saved line must still end up next to its own team. */
  {
    const R = { n: 'R a download that started before a re-label lands after it', L1: 'B', L2: 'A', S1: 'B', S2: 'B' };
    await reset();
    world.V = R; world.sync = 1; await sync();
    world.hold = true; world.held = 0; world.gate = new Promise(r => { world.release = r; });
    await page.click('#syncBtn');                                    /* schedule saved with the old labels, odds download started ... */
    await page.waitForFunction(() => !document.querySelector('#syncBtn').disabled, null, { timeout: 20000 });
    for (let i = 0; i < 40 && !world.held; i++) await settle(250);
    check('R0 the odds download is in flight (held)', world.held > 0, world.held);
    world.sync = 2;                                                  /* ESPN now has the other team home and the games under way */
    await page.click('#liveBtn');                                    /* ... Live saves the schedule again, re-labelled, while it is pending */
    for (let i = 0; i < 60; i++) {
      const home = await page.evaluate(k => { const r = localStorage.getItem(k); const o = r ? JSON.parse(r) : null; const g = o && o.games && o.games.filter(x => x.id === 'nba-g1')[0]; return g && g.home.abbr; }, 'sbx2:nba:' + DAY);
      if (home === truth('nba', 1).A.abbr) break;
      await settle(250);
    }
    world.hold = false; world.release();                             /* ... and now the old download lands */
    await sync();
    await page.click('#liveBtn'); await settle(300);                 /* Live off again */
    const bad = await verifyAll(R), names = Object.keys(bad);
    check(R.n + ': every line still sits next to its own team', names.length === 0, names.length ? bad : undefined);
    if (names.length) names.forEach(lk => console.log('   ' + lk.toUpperCase() + ' (' + bad[lk].length + '): ' + bad[lk].slice(0, 4).join(' | ').slice(0, 700)));
  }
  console.log(fails ? fails + ' FAILURE(S)' : 'ALL PASSED');
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
