/* Scroll memory per tab, in Chromium with ESPN mocked (server for app/src/main/assets on :8765, or E2E_PORT).
   Every view (day + league tab, the Moves tab, the tracked game) starts at the TOP the first time and, when you
   scroll, leave and come back, is exactly where you left it. A re-render of the same view keeps its place. */
const { chromium } = require('playwright');
const PORT = process.env.E2E_PORT || 8765;

function pad(n) { return (n < 10 ? '0' : '') + n; }
function ymd(d) { return '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
const TODAY = new Date();
function at(day, h, m) { const d = addDays(TODAY, day); d.setHours(h, m, 0, 0); return d.toISOString(); }

function side(abbr, ha, score, ls) {
  return { homeAway: ha, score: String(score), linescores: ls.map(v => ({ value: v })), winner: false,
    records: [{ type: 'total', summary: '10-5' }],
    team: { abbreviation: abbr, displayName: abbr + ' City', location: abbr, shortDisplayName: abbr, color: '1d428a' } };
}
const ST = {
  post: { type: { state: 'post', completed: true, shortDetail: 'Final', detail: 'Final', name: 'STATUS_FINAL', description: 'Final' }, period: 4 },
  in: { type: { state: 'in', completed: false, shortDetail: '5:12 - 3rd', detail: '5:12 - 3rd', name: 'STATUS_IN_PROGRESS', description: 'In Progress' }, period: 3 },
  pre: { type: { state: 'pre', completed: false, shortDetail: '7:30 PM', detail: '7:30 PM', name: 'STATUS_SCHEDULED', description: 'Scheduled' }, period: 0 }
};
/* n games: all finished except one live game (index liveAt) and a few still ahead at the end */
function events(prefix, n, day, liveAt) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const state = i === liveAt ? 'in' : (i >= n - 3 ? 'pre' : 'post');
    const ls = state === 'pre' ? [] : [24, 26, 22, 28].slice(0, state === 'in' ? 3 : 4);
    out.push({ id: prefix + i, date: at(day, 1 + (i % 20), (i * 7) % 60), status: ST[state],
      competitions: [{ timeValid: true, competitors: [side('H' + prefix.toUpperCase() + i, 'home', state === 'pre' ? 0 : 100 + i, ls), side('A' + prefix.toUpperCase() + i, 'away', state === 'pre' ? 0 : 90 + i, ls)] }] });
  }
  return out;
}
const WORLD = {   // "<espn path>|<day offset>" -> events
  'basketball/nba|0': events('n', 30, 0, 20),
  'basketball/nba|1': events('m', 3, 1, -1),
  'basketball/wnba|0': events('w', 30, 0, -1),
  'hockey/nhl|0': events('h', 30, 0, -1)
};

let fails = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''));
  if (!ok) fails++;
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 411, height: 860 }, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });

  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith('http://localhost:' + PORT + '/')) return route.continue();
    const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    const m = /sports\/([^?]+)\/scoreboard\?dates=(\d{8})/.exec(url);
    if (m) {
      let evs = [];
      for (let off = -1; off <= 3; off++) if (ymd(addDays(TODAY, off)) === m[2]) evs = WORLD[m[1] + '|' + off] || [];
      return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ events: evs }) });
    }
    return route.fulfill({ status: 200, headers: cors, body: '[]' });
  });

  const y = () => page.evaluate(() => Math.round(window.pageYOffset));
  const scrollTo = v => page.evaluate(n => window.scrollTo(0, n), v);
  const tab = key => page.evaluate(k => document.querySelector('#tabs button[data-lg="' + k + '"]').click(), key);
  const settle = (ms = 250) => page.waitForTimeout(ms);
  const waitIdle = async () => {
    await page.waitForFunction(() => !document.querySelector('#syncBtn').disabled, null, { timeout: 15000 });
    await page.waitForTimeout(500);
  };

  await page.goto('http://localhost:' + PORT + '/index.html?v=99');
  await settle(600);
  await page.click('#syncBtn');
  await waitIdle();

  const tabs = await page.evaluate(() => Array.from(document.querySelectorAll('#tabs button')).map(b => b.getAttribute('data-lg') || 'moves'));
  check('setup: tabs are nba, wnba, nhl', JSON.stringify(tabs) === '["nba","wnba","nhl"]', tabs);
  const tall = await page.evaluate(() => document.documentElement.scrollHeight);
  check('setup: lists are long enough to scroll (' + tall + 'px)', tall > 3500, tall);
  check('A1 first view opens at the top', (await y()) === 0, await y());

  /* ----- the reported bug: scroll one tab, switch, the next tab must start at the top ----- */
  await scrollTo(900);
  check('B0 NBA scrolled to 900', (await y()) === 900, await y());
  await tab('wnba'); await settle();
  check('B1 NBA scrolled 900 -> WNBA starts at the TOP', (await y()) === 0, await y());
  await scrollTo(1500);
  await tab('nhl'); await settle();
  check('B2 WNBA scrolled 1500 -> NHL starts at the TOP', (await y()) === 0, await y());

  /* ----- coming back restores where each was left ----- */
  await tab('nba'); await settle();
  check('C1 back on NBA: 900 again', (await y()) === 900, await y());
  await tab('wnba'); await settle();
  check('C2 back on WNBA: 1500 again', (await y()) === 1500, await y());
  await tab('nhl'); await settle();
  check('C3 NHL (never scrolled): still the top', (await y()) === 0, await y());
  await scrollTo(400);
  await tab('nba'); await settle();
  check('C4 NHL left at 400 -> NBA 900', (await y()) === 900, await y());
  await tab('nhl'); await settle();
  check('C5 NHL back at 400', (await y()) === 400, await y());
  await tab('nba'); await settle();

  /* ----- a re-render of the SAME view keeps its place (as it always did) ----- */
  const rem = () => page.evaluate(() => document.querySelector('#remBtn').click());   // lives in the closed settings panel
  await rem(); await settle(); await rem(); await settle();
  check('D1 same-view re-render (Games left toggled twice) keeps 900', (await y()) === 900, await y());
  await page.click('#syncBtn'); await waitIdle();
  check('D2 Sync while scrolled keeps 900', (await y()) === 900, await y());

  /* ----- line-score panels: opened ones stay open across a tab switch, so the layout (and the scroll) match ----- */
  await scrollTo(0); await settle();
  await page.evaluate(() => { document.querySelector('#games .card[data-id="n3"] details').open = true; });
  await scrollTo(1100); await settle();
  const before = await page.evaluate(() => Math.round(document.querySelector('#games .card[data-id="n8"]').getBoundingClientRect().top));
  await tab('wnba'); await settle();
  await tab('nba'); await settle();
  const after = await page.evaluate(() => ({ y: Math.round(window.pageYOffset), top: Math.round(document.querySelector('#games .card[data-id="n8"]').getBoundingClientRect().top),
    open: document.querySelector('#games .card[data-id="n3"] details').open }));
  check('E1 a line score opened above stays open after a tab round trip', after.open === true, after);
  check('E2 ...so the same card sits in the same place (y 1100, card n8 top ' + before + ' -> ' + after.top + ')', after.y === 1100 && Math.abs(after.top - before) <= 1, { before, after });
  await scrollTo(900); await settle();

  /* ----- days are separate views too ----- */
  await page.click('#nextDay'); await settle();
  check('F1 next day starts at the top', (await y()) === 0, await y());
  await page.click('#prevDay'); await settle();
  check('F2 back to today: NBA is where it was left (900)', (await y()) === 900, await y());

  /* ----- Track live: the list comes back where it was ----- */
  await page.evaluate(() => document.querySelector('#games .trk[data-track="n20"]').click());
  await settle(500);
  const inTrack = await page.evaluate(() => ({ y: Math.round(window.pageYOffset), tracking: document.body.className.indexOf('tracking') >= 0, cards: document.querySelectorAll('#games .card').length }));
  check('G1 tracking one game: single card, at the top', inTrack.tracking && inTrack.cards === 1 && inTrack.y === 0, inTrack);
  await page.click('#backBtn'); await settle(500);
  const back = await page.evaluate(() => ({ y: Math.round(window.pageYOffset), cards: document.querySelectorAll('#games .card').length }));
  check('G2 ‹ All games: the list is back at 900', back.y === 900 && back.cards === 30, back);

  /* ----- Moves tab (Odds on): its own view, and leaving it restores the league tab ----- */
  await page.click('#oddsBtn'); await settle();
  await page.evaluate(() => document.querySelector('#tabs button[data-mv]').click()); await settle();
  check('H1 Moves tab opens at the top', (await y()) === 0, await y());
  await tab('nba'); await settle();
  check('H2 back on NBA from Moves: 900', (await y()) === 900, await y());

  /* ----- a tap on the tab you are already on does not throw you around ----- */
  await tab('nba'); await settle();
  check('I1 tapping the current tab keeps its place', (await y()) === 900, await y());

  console.log(fails ? '\n' + fails + ' check(s) FAILED' : '\nall scroll-memory checks passed');
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
