/* Which team is on top (neutral-site games).
   User report: a college basketball game first shows in the schedule with a team on the bottom row (home); once the
   scores come in, the same team jumps to the top row like an away team. On a neutral court there is no real home team,
   ESPN's home/away labels are arbitrary and change between the schedule and the live feed -- and every other ESPN
   endpoint only ever returns the CURRENT labels, so the app has to remember the order the schedule had.
   Rule: ESPN says neutral site -> keep the order the schedule had (scores, winner, halftime, the ball, ESPN's embedded
   line all follow the TEAM). Not neutral -> ESPN's re-label is a genuine correction (the schedule had the host wrong) and
   is followed, as before.
   A  neutral site: the order survives live + final + a re-label back + a reload; scores / winner / halftime follow the team
   B  not a neutral site: ESPN's re-label is followed (true correction)
   C  the flag is read at the time of the re-label: appears with it -> keep, disappears with it -> follow
   D  ESPN's embedded line stays on the right team (card keeps its favourite, no fake price move)
   E  football: the ball stays with the right team
   F  mergeGames / flipSides called directly: every orientation-bearing field, both directions, sparse games */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
function pad(n) { return (n < 10 ? '0' : '') + n; }
function ymd(d) { return '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()); }
const TODAY = new Date();
const DAY = ymd(TODAY);
const START = (() => { const d = new Date(TODAY); d.setHours(23, 30, 0, 0); return d.toISOString(); })();
const TEAMS = {
  WYO: { id: '2751', abbr: 'WYO', display: 'Wyoming Cowboys', loc: 'Wyoming', short: 'Wyoming' },
  KENT: { id: '2309', abbr: 'KENT', display: 'Kent State Golden Flashes', loc: 'Kent State', short: 'Kent State' }
};
const other = k => (k === 'WYO' ? 'KENT' : 'WYO');
const BASKETBALL = 'basketball/mens-college-basketball', FOOTBALL = 'football/college-football';
const world = {
  slug: BASKETBALL,
  home: 'KENT',                       // the team ESPN calls "home" right now (the other one is "away")
  neutral: true,
  state: 'pre',                       // pre | in | post
  score: { WYO: 0, KENT: 0 },
  ls: { WYO: [], KENT: [] },          // half-by-half points (CBB) / quarter-by-quarter (CFB)
  eo: null,                           // ESPN's embedded odds object
  ball: null                          // football: the team that has the ball
};
let fails = 0;
function check(n, ok, x) { console.log((ok ? 'PASS ' : 'FAIL ') + n + (!ok && x !== undefined ? '  -> ' + JSON.stringify(x) : '')); if (!ok) fails++; }
function competitor(key, ha) {
  const T = TEAMS[key], live = world.state !== 'pre';
  const c = {
    id: T.id, homeAway: ha, score: live ? String(world.score[key]) : '0',
    linescores: world.ls[key].map(v => ({ value: v })), records: [],
    team: { id: T.id, abbreviation: T.abbr, displayName: T.display, location: T.loc, shortDisplayName: T.short, color: '123456', conferenceId: '9' }
  };
  if (world.state === 'post') c.winner = world.score[key] > world.score[other(key)];
  return c;
}
const STATUS = {
  pre: { state: 'pre', completed: false, shortDetail: '7:30 PM', detail: '7:30 PM', name: 'STATUS_SCHEDULED', description: 'Scheduled' },
  in: { state: 'in', completed: false, shortDetail: '8:41 - 2nd Half', detail: '8:41 - 2nd Half', name: 'STATUS_IN_PROGRESS', description: 'In Progress' },
  post: { state: 'post', completed: true, shortDetail: 'Final', detail: 'Final', name: 'STATUS_FINAL', description: 'Final' }
};
function espnEvent() {
  const h = world.home, a = other(h);
  const c = { timeValid: true, neutralSite: world.neutral, competitors: [competitor(h, 'home'), competitor(a, 'away')] };
  if (world.eo) c.odds = [world.eo];
  if (world.slug === FOOTBALL && world.ball && world.state === 'in') {
    c.situation = { shortDownDistanceText: '2nd & 7', possessionText: world.ball + ' 32', possession: TEAMS[world.ball].id, isRedZone: false };
  }
  return { id: 'g1', date: START, status: { type: STATUS[world.state], period: world.state === 'pre' ? 0 : (world.slug === FOOTBALL ? 3 : 2) }, competitions: [c] };
}
/* ESPN's embedded DraftKings line. homeLine / awayLine / prices are keyed to ESPN's CURRENT home team. */
function espnOdds(details, homeLine, awayLine, homePrice, awayPrice) {
  return { provider: { name: 'DraftKings' }, details, overUnder: 141.5,
    pointSpread: { home: { close: { line: homeLine, odds: homePrice } }, away: { close: { line: awayLine, odds: awayPrice } } },
    moneyline: { home: { close: { odds: '+100' } }, away: { close: { odds: '-120' } } },
    total: { over: { close: { line: 'o141.5', odds: '-110' } }, under: { close: { line: 'u141.5', odds: '-110' } } } };
}
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 411, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith('http://localhost:8765/')) return route.continue();
    const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (url.startsWith('https://site.api.espn.com/')) {
      const m = /sports\/([^?]+)\/scoreboard\?dates=(\d{8})/.exec(url);
      return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ events: (m && m[1] === world.slug && m[2] === DAY) ? [espnEvent()] : [] }) });
    }
    if (url.startsWith('https://guest.api.arcadia.pinnacle.com/')) return route.fulfill({ status: 200, headers: cors, body: '[]' });
    return route.fulfill({ status: 404, headers: cors, body: '{}' });
  });
  const settle = ms => page.waitForTimeout(ms || 700);
  async function sync() { await page.click('#syncBtn'); await page.waitForFunction(() => !document.querySelector('#syncBtn').disabled, null, { timeout: 15000 }); await settle(1100); }
  async function reset() {
    await page.evaluate(() => { Object.keys(localStorage).forEach(k => { if (/^sbx2:/.test(k)) localStorage.removeItem(k); }); });
    await page.reload(); await settle(800);
  }
  const lgKey = () => (world.slug === FOOTBALL ? 'cfb' : 'cbb');
  async function tab() { await page.click('#tabs button[data-lg="' + lgKey() + '"]'); await settle(500); }
  /* the first card's team rows, top to bottom, as the screen draws them */
  const rows = () => page.evaluate(() => {
    const card = document.querySelector('#games .card');
    if (!card) return null;
    return Array.prototype.map.call(card.querySelectorAll('.trow'), e => ({
      name: (() => { const n = e.querySelector('.tname .n'); if (!n) return ''; const c = n.cloneNode(true), b = c.querySelector('.fbicon'); if (b) b.remove(); return c.textContent.replace(/\s+/g, ' ').trim(); })(),
      text: e.textContent.replace(/\s+/g, ' ').trim(),
      score: (e.querySelector('.score') || { textContent: '' }).textContent.trim(),
      loser: e.classList.contains('loser'),
      ball: !!e.querySelector('.fbicon')
    }));
  });
  const names = async () => { const r = await rows(); return r ? r.map(x => x.name).join(' / ') : 'NO CARD'; };
  const savedGame = () => page.evaluate(k => { const r = localStorage.getItem(k); const o = r ? JSON.parse(r) : null; return o && o.games && o.games[0]; }, 'sbx2:' + lgKey() + ':' + DAY);
  const oddsBook = () => page.evaluate(k => { const r = localStorage.getItem(k); const o = r ? JSON.parse(r) : null; return o && o.games && o.games.g1 && o.games.g1.b.draftkings; }, 'sbx2:o-' + lgKey() + ':' + DAY);
  const TOP = 'Wyoming / Kent State', FLIPPED = 'Kent State / Wyoming';

  await page.goto('http://localhost:8765/index.html?v=99');
  await settle(800);

  /* ===== A. neutral site: the schedule's order survives the live feed, the final, a re-label back and a reload ===== */
  world.neutral = true; world.home = 'KENT'; world.state = 'pre';
  await sync(); await tab();
  check('A1 schedule: Wyoming on top, Kent State (home) below', (await names()) === TOP, await names());
  let g = await savedGame();
  check('A2 the saved game remembers it is a neutral-site game', g && g.ns === 1 && g.home.abbr === 'KENT' && g.away.abbr === 'WYO', g && { ns: g.ns, h: g.home.abbr, a: g.away.abbr });

  world.home = 'WYO'; world.state = 'in';          // scores come in; ESPN now calls Wyoming "home"
  world.score = { WYO: 41, KENT: 35 }; world.ls = { WYO: [20, 21], KENT: [18, 17] };
  await sync(); await tab();
  let r = await rows();
  check('A3 live, ESPN re-labelled: Wyoming is STILL on top, Kent State below', (await names()) === TOP, await names());
  check('A4 scores stay with their team (WYO 41, KENT 35)', r && r[0].score === '41' && r[1].score === '35', r && r.map(x => x.score));
  g = await savedGame();
  check('A5 saved: KENT home / WYO away, away 41 - home 35', g && g.home.abbr === 'KENT' && g.away.abbr === 'WYO' && g.away.score === '41' && g.home.score === '35', g && { h: g.home.abbr, a: g.away.abbr, as: g.away.score, hs: g.home.score });
  check('A6 halftime follows the team (WYO 20 / KENT 18)', g && g.ht && g.ht.a === 20 && g.ht.h === 18 && g.ht.fin === true, g && g.ht);
  check('A7 line scores follow the team', g && g.away.ls.join() === '20,21' && g.home.ls.join() === '18,17', g && [g.away.ls, g.home.ls]);

  world.state = 'post'; world.score = { WYO: 80, KENT: 71 }; world.ls = { WYO: [38, 42], KENT: [35, 36] };
  await sync(); await tab();
  r = await rows();
  check('A8 final: same order', (await names()) === TOP, await names());
  check('A9 final: Wyoming won (not a loser), Kent State is the loser row', r && r[0].score === '80' && !r[0].loser && r[1].score === '71' && r[1].loser, r);

  world.home = 'KENT';                              // ESPN flips the labels back: nothing to undo
  await sync(); await tab();
  check('A10 ESPN labels back to the schedule\'s: still the same order', (await names()) === TOP, await names());
  world.home = 'WYO';
  await sync(); await tab();
  check('A11 ...and again re-labelled: still the same order (stable over repeated syncs)', (await names()) === TOP, await names());

  await page.reload(); await settle(900); await tab();
  r = await rows();
  check('A12 after a reload the card is the same (Wyoming 80 / Kent State 71)', (await names()) === TOP && r[0].score === '80' && r[1].score === '71', r);

  /* ===== B. not a neutral site: ESPN's re-label is a true correction and is followed ===== */
  await reset();
  world.neutral = false; world.home = 'KENT'; world.state = 'pre'; world.score = { WYO: 0, KENT: 0 }; world.ls = { WYO: [], KENT: [] };
  await sync(); await tab();
  check('B1 schedule (not neutral): Wyoming on top, Kent State below', (await names()) === TOP, await names());
  g = await savedGame();
  check('B2 a normal game carries no neutral flag', g && g.ns === undefined, g && g.ns);
  world.home = 'WYO'; world.state = 'in'; world.score = { WYO: 12, KENT: 9 }; world.ls = { WYO: [12], KENT: [9] };
  await sync(); await tab();
  r = await rows();
  check('B3 ESPN corrects the host (Wyoming is the real home team): the card follows', (await names()) === FLIPPED, await names());
  check('B4 scores still with their team (KENT 9 on top, WYO 12 below)', r && r[0].score === '9' && r[1].score === '12', r && r.map(x => x.score));

  /* ===== C. the neutral flag is read at the time of the re-label ===== */
  await reset();
  world.neutral = false; world.home = 'KENT'; world.state = 'pre'; world.score = { WYO: 0, KENT: 0 }; world.ls = { WYO: [], KENT: [] };
  await sync(); await tab();
  world.neutral = true; world.home = 'WYO'; world.state = 'in'; world.score = { WYO: 10, KENT: 8 };
  await sync(); await tab();
  check('C1 flag appears together with the re-label: the schedule\'s order is kept', (await names()) === TOP, await names());
  await reset();
  world.neutral = true; world.home = 'KENT'; world.state = 'pre'; world.score = { WYO: 0, KENT: 0 };
  await sync(); await tab();
  world.neutral = false; world.home = 'WYO'; world.state = 'in'; world.score = { WYO: 10, KENT: 8 };
  await sync(); await tab();
  check('C2 flag disappears together with the re-label (it IS a home game): ESPN is followed', (await names()) === FLIPPED, await names());

  /* ===== D. ESPN's embedded line stays on the right team ===== */
  await reset();
  await page.click('#oddsBtn'); await settle(400);
  world.neutral = true; world.home = 'KENT'; world.state = 'pre'; world.score = { WYO: 0, KENT: 0 }; world.ls = { WYO: [], KENT: [] };
  world.eo = espnOdds('WYO -4.5', '+4.5', '-4.5', '-112', '-108');      // home = KENT (+4.5, -112), away = WYO (-4.5, -108)
  await sync(); await tab();
  let dk = await oddsBook();
  check('D1 schedule: DraftKings WYO -4.5 saved as KENT(home) +4.5, KENT -112 / WYO -108', dk && dk.full.sp && dk.full.sp.h === 4.5 && dk.full.sp.hp === -112 && dk.full.sp.ap === -108, dk && dk.full);
  r = await rows();
  check('D2 board: Wyoming -4.5 on top, Kent State +4.5 below', r && /Wyoming.*[−-]4\.5/.test(r[0].text) && /Kent State.*\+4\.5/.test(r[1].text), r && r.map(x => x.text));
  world.home = 'WYO';                                                   // re-labelled: the same line, now keyed to WYO as home
  world.eo = espnOdds('WYO -4.5', '-4.5', '+4.5', '-108', '-112');
  await sync(); await tab();
  dk = await oddsBook();
  check('D3 re-labelled: still KENT(home) +4.5 at -112 / WYO -108, and no "move" recorded', dk && dk.full.sp && dk.full.sp.h === 4.5 && dk.full.sp.hp === -112 && dk.full.sp.ap === -108 && !dk.pv, dk);
  r = await rows();
  check('D4 board: Wyoming is still the -4.5 favourite on the top row', (await names()) === TOP && r && /Wyoming.*[−-]4\.5/.test(r[0].text) && /Kent State.*\+4\.5/.test(r[1].text), r && r.map(x => x.text));
  g = await savedGame();
  check('D5 the saved ESPN line is kept in the kept orientation (home KENT +4.5)', g && g.eo && g.eo.full.sp.h === 4.5 && g.eo.full.sp.hp === -112 && g.eo.full.sp.ap === -108, g && g.eo);
  world.eo = null;

  /* ===== E. football: the ball stays with the right team ===== */
  await reset();
  world.slug = FOOTBALL; world.neutral = true; world.home = 'KENT'; world.state = 'pre'; world.ball = null;
  await sync(); await tab();
  check('E1 schedule: Wyoming on top, Kent State below', (await names()) === TOP, await names());
  world.home = 'WYO'; world.state = 'in'; world.score = { WYO: 14, KENT: 7 }; world.ls = { WYO: [7, 7, 0], KENT: [0, 7, 0] }; world.ball = 'WYO';
  await sync(); await tab();
  r = await rows(); g = await savedGame();
  check('E2 live, re-labelled: same order, scores with their team', (await names()) === TOP && r && r[0].score === '14' && r[1].score === '7', r && r.map(x => x.score));
  check('E3 the ball (Wyoming\'s) is on the Wyoming row', r && r[0].ball === true && r[1].ball === false, r && r.map(x => x.ball));
  check('E4 saved possession is "away" (Wyoming is the kept away team), ball spot text unchanged', g && g.fb && g.fb.possess === 'away' && g.fb.spot === 'WYO 32', g && g.fb);
  world.ball = 'KENT';
  await sync(); await tab();
  r = await rows();
  check('E5 ball changes hands: it moves to the Kent State row', r && r[0].ball === false && r[1].ball === true, r && r.map(x => x.ball));
  world.slug = BASKETBALL; world.ball = null;

  /* ===== F. mergeGames / flipSides directly =====
     The whole app is one closure, so serve a copy of index.html (to a second page) with the two functions exposed. */
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'src', 'main', 'assets', 'index.html'), 'utf8');
  const tail = '\n})();\n</script>';
  const cut = html.lastIndexOf(tail);
  check('F0 the page script ends where this test expects (so its internals can be exposed)', cut > 0);
  const page2 = await ctx.newPage();
  page2.on('pageerror', e => { console.log('PAGE ERROR (F)', e.message); fails++; });
  await page2.route('**/*', route => {
    if (/^http:\/\/localhost:8765\/index\.html/.test(route.request().url())) {
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html.slice(0, cut) + '\nwindow.__t = { flipSides: flipSides, mergeGames: mergeGames };' + html.slice(cut) });
    }
    return route.fulfill({ status: 404, body: '{}' });
  });
  await page2.goto('http://localhost:8765/index.html?v=99');
  await page2.waitForTimeout(500);
  const unit = await page2.evaluate(() => {
    const flipSides = window.__t.flipSides, mergeGames = window.__t.mergeGames;
    function team(abbr, extra) { const t = { abbr: abbr, name: abbr, full: abbr, loc: abbr, color: null, score: '', ls: [], rec: '', so: null, win: false }; for (const k in (extra || {})) t[k] = extra[k]; return t; }
    function game(h, a, extra) { const g = { id: 'x', start: '2026-11-27T23:30Z', state: 'in', completed: false, detail: '', period: 2, tbd: false, flag: null, home: team(h, { score: '10', ls: [4, 6] }), away: team(a, { score: '20', ls: [9, 11] }) }; for (const k in (extra || {})) g[k] = extra[k]; return g; }
    const out = {};
    /* flipSides: everything that means "home" / "away" turns around, nothing else changes */
    const full = game('H', 'A', {
      ht: { a: 9, h: 4, fin: true }, f5: { a: 3, h: 1, fin: false }, fb: { down: '1st & 10', spot: 'A 25', possess: 'home', redzone: true },
      eo: { b: 'DraftKings', k: 'draftkings', full: { sp: { h: -3, hp: -105, ap: -115 }, tot: { p: 140.5, o: -110, u: -110 }, ml: { h: -150, a: 130 } } }, ns: 1, id: 'keep-me'
    });
    flipSides(full);
    out.flip = JSON.parse(JSON.stringify(full));
    flipSides(full);
    out.twice = JSON.parse(JSON.stringify(full));
    const bare = game('H', 'A');                                 // no ht / f5 / fb / eo at all
    let threw = false; try { flipSides(bare); } catch (e) { threw = String(e); }
    out.bare = { threw: threw, home: bare.home.abbr, away: bare.away.abbr };
    const nofb = game('H', 'A', { fb: { down: '', spot: '', possess: null, redzone: false } });
    flipSides(nofb); out.nopossess = nofb.fb.possess;
    /* mergeGames: neutral -> kept, nothing queued for odds mirroring; not neutral -> followed, queued */
    const prev = { games: [game('H', 'A', { state: 'pre', id: 'n1' }), game('H', 'A', { state: 'pre', id: 'n2', ht: { a: 9, h: 4, fin: true } })] };
    prev.games[0].home.score = prev.games[0].away.score = '';
    const nowN = game('A', 'H', { id: 'n1', ns: 1, eo: { b: 'DK', k: 'dk', full: { sp: { h: -2, hp: -110, ap: -110 }, tot: null, ml: null } } });
    const nowC = game('A', 'H', { id: 'n2' });
    nowC.ht = { a: 1, h: 2, fin: false };                         // not final yet: the saved halftime snapshot is carried over
    const queued = [];
    const merged = mergeGames(prev, [nowN, nowC], queued);
    out.merge = {
      neutral: { home: merged[0].home.abbr, away: merged[0].away.abbr, as: merged[0].away.score, hs: merged[0].home.score, eoH: merged[0].eo.full.sp.h },
      correct: { home: merged[1].home.abbr, away: merged[1].away.abbr, ht: merged[1].ht },
      queued: queued
    };
    return out;
  });
  const F = unit;
  check('F1 flipSides swaps the teams (scores / line scores travel with them)', F.flip.home.abbr === 'A' && F.flip.away.abbr === 'H' && F.flip.home.score === '20' && F.flip.away.score === '10' && F.flip.home.ls.join() === '9,11', F.flip);
  check('F2 ...halftime / first-5 sums swap sides, fin untouched', F.flip.ht.a === 4 && F.flip.ht.h === 9 && F.flip.ht.fin === true && F.flip.f5.a === 1 && F.flip.f5.h === 3 && F.flip.f5.fin === false, [F.flip.ht, F.flip.f5]);
  check('F3 ...possession turns around, spot text and red-zone untouched', F.flip.fb.possess === 'away' && F.flip.fb.spot === 'A 25' && F.flip.fb.redzone === true, F.flip.fb);
  check('F4 ...ESPN\'s line is seen from the other side (-3 home -> +3, prices swap, total same, money line swaps)', F.flip.eo.full.sp.h === 3 && F.flip.eo.full.sp.hp === -115 && F.flip.eo.full.sp.ap === -105 && F.flip.eo.full.tot.p === 140.5 && F.flip.eo.full.ml.h === 130 && F.flip.eo.full.ml.a === -150, F.flip.eo);
  check('F5 id / neutral flag are not touched', F.flip.id === 'keep-me' && F.flip.ns === 1, [F.flip.id, F.flip.ns]);
  check('F6 flipping twice gives the original back', JSON.stringify(F.twice.home) === JSON.stringify({ abbr: 'H', name: 'H', full: 'H', loc: 'H', color: null, score: '10', ls: [4, 6], rec: '', so: null, win: false }) && F.twice.ht.a === 9 && F.twice.fb.possess === 'home' && F.twice.eo.full.sp.h === -3, F.twice);
  check('F7 a game with no halftime / ball / line flips without error', F.bare.threw === false && F.bare.home === 'A' && F.bare.away === 'H', F.bare);
  check('F8 no possession stays no possession', F.nopossess === null, F.nopossess);
  check('F9 mergeGames, neutral: order kept, scores with their team, ESPN line turned to match (-2 -> +2), nothing queued for odds mirroring',
    F.merge.neutral.home === 'H' && F.merge.neutral.away === 'A' && F.merge.neutral.as === '10' && F.merge.neutral.hs === '20' && F.merge.neutral.eoH === 2 && F.merge.queued.indexOf('n1') === -1, F.merge);
  check('F10 mergeGames, not neutral: ESPN followed, queued for odds mirroring, carried-over halftime turned around with it',
    F.merge.correct.home === 'A' && F.merge.correct.away === 'H' && F.merge.queued.indexOf('n2') !== -1 && F.merge.correct.ht.a === 4 && F.merge.correct.ht.h === 9, F.merge);

  console.log(fails ? fails + ' FAILURE(S)' : 'ALL PASSED');
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
