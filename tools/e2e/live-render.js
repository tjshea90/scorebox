/* Rendering + live-sync efficiency, in Chromium with ESPN mocked (server for app/src/main/assets on :8765, or E2E_PORT).
   A  game start times are exactly what the platform's own formatter prints (4 locales / time zones), and follow a
      time-zone change made while the app is open (the formatter is reused, not rebuilt per card)
   B  a re-draw of the same list swaps only the cards that changed: untouched cards keep their DOM, the scroll offset
      stays, an open line score stays open; a different set of games is a full redraw
   C  Live sync skips a league / day that cannot change right now (all finished, or nothing due within 30 minutes, and
      looked at in the last 2 h) and keeps polling anything live, delayed or about to start
   D  the pull-to-refresh touchmove listener never cancels the swipe (a blocking listener delays every scroll start) */
const { chromium } = require('playwright');
const PORT = process.env.E2E_PORT || 8765;

function pad(n) { return (n < 10 ? '0' : '') + n; }
function ymd(d) { return '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
const NOW = new Date();

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
/* spec: { id, start (ISO), state, a, h } */
function ev(s) {
  const ls = s.state === 'pre' ? [] : [24, 26, 22, 28].slice(0, s.state === 'in' ? 3 : 4);
  return { id: s.id, date: s.start, status: ST[s.state],
    competitions: [{ timeValid: true, competitors: [side('H' + s.id.toUpperCase(), 'home', s.state === 'pre' ? 0 : s.h, ls), side('A' + s.id.toUpperCase(), 'away', s.state === 'pre' ? 0 : s.a, ls)] }] };
}
function longList(prefix, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(NOW); d.setHours(1 + (i % 20), (i * 7) % 60, 0, 0);
    out.push({ id: prefix + i, start: d.toISOString(), state: i === 20 ? 'in' : (i >= n - 3 ? 'pre' : 'post'), a: 90 + i, h: 100 + i });
  }
  return out;
}

const world = {};      // espn path -> [spec] for TODAY (every other day is empty)
const log = [];        // espn scoreboard requests: "path|ds"
let anyDay = false;    // section A: the same slate for whatever date the page asks for (its "today" depends on the time zone)

let fails = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''));
  if (!ok) fails++;
}
async function routeWorld(page) {
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith('http://localhost:' + PORT + '/')) return route.continue();
    const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    const m = /sports\/([^?]+)\/scoreboard\?dates=(\d{8})/.exec(url);
    if (m) {
      log.push(m[1] + '|' + m[2]);
      const specs = (anyDay || m[2] === ymd(NOW)) ? (world[m[1]] || []) : [];
      return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ events: specs.map(ev) }) });
    }
    return route.fulfill({ status: 200, headers: cors, body: '[]' });
  });
}
async function waitIdle(page) {
  await page.waitForFunction(() => !document.querySelector('#syncBtn').disabled, null, { timeout: 15000 });
  await page.waitForTimeout(500);
}

(async () => {
  const browser = await chromium.launch();
  const open = async (opts) => {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 411, height: 860 }, hasTouch: true, deviceScaleFactor: 2 }, opts || {}));
    const page = await ctx.newPage();
    page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
    await routeWorld(page);
    return { ctx, page };
  };

  /* ===== A. start times = the platform formatter, in several locales / zones, and after a zone change ===== */
  anyDay = true;
  world['basketball/nba'] = [];
  for (let i = 0; i < 8; i++) { const d = new Date(NOW); d.setHours(9 + i * 2, i % 2 ? 30 : 5, 0, 0); world['basketball/nba'].push({ id: 't' + i, start: d.toISOString(), state: 'pre', a: 0, h: 0 }); }
  /* en-US keeps the machine's own zone: its context is given a time-zone override mid-session below (a second override on the same context is refused) */
  const combos = [['en-US', null], ['de-DE', 'Europe/Berlin'], ['ja-JP', 'Asia/Tokyo'], ['en-IN', 'Asia/Kolkata']];
  for (const [locale, tz] of combos) {
    const { ctx, page } = await open(tz ? { locale, timezoneId: tz } : { locale });
    await page.goto('http://localhost:' + PORT + '/index.html?v=99');
    await page.click('#syncBtn'); await waitIdle(page);
    const r = await page.evaluate(() => Array.from(document.querySelectorAll('#games .card')).map(c => c.querySelector('.stime').textContent));
    const exp = await page.evaluate(specs => specs.map(s => new Date(s).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })), world['basketball/nba'].map(s => s.start));
    check('A1 ' + locale + ' / ' + (tz || 'machine zone') + ': 8 start times match toLocaleTimeString exactly (' + r[0] + ' ... ' + r[7] + ')', JSON.stringify(r) === JSON.stringify(exp), { r, exp });
    if (locale === 'en-US') {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Tokyo' });
      await page.click('#syncBtn'); await waitIdle(page);          // the date rolled over with the zone: sync it like a user would
      const r2 = await page.evaluate(() => Array.from(document.querySelectorAll('#games .card')).map(c => c.querySelector('.stime').textContent));
      const e2 = await page.evaluate(specs => specs.map(s => new Date(s).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })), world['basketball/nba'].map(s => s.start));
      check('A2 time zone changed to Tokyo while open: labels follow it (' + r2[0] + ' vs ' + r[0] + ' before)', JSON.stringify(r2) === JSON.stringify(e2) && r2[0] !== r[0], { r2, e2 });
    }
    await ctx.close();
  }

  /* ===== B. only changed cards are swapped ===== */
  anyDay = false;
  {
    world['basketball/nba'] = longList('n', 30);
    const { ctx, page } = await open();
    await page.goto('http://localhost:' + PORT + '/index.html?v=99');
    await page.click('#syncBtn'); await waitIdle(page);
    await page.evaluate(() => {
      document.querySelectorAll('#games .card').forEach(c => { c.__keep = 1; });
      document.querySelector('#tabs button').__keep = 1;
      document.querySelector('#games .card[data-id="n3"] details').open = true;
      window.scrollTo(0, 900);
    });
    await page.waitForTimeout(200);
    world['basketball/nba'][5].h = 555;                                  // one game's score changes
    await page.click('#syncBtn'); await waitIdle(page);
    let s = await page.evaluate(() => ({
      kept: Array.from(document.querySelectorAll('#games .card')).filter(c => c.__keep).length,
      cards: document.querySelectorAll('#games .card').length,
      n5: document.querySelector('#games .card[data-id="n5"]').textContent.indexOf('555') >= 0,
      n5fresh: !document.querySelector('#games .card[data-id="n5"]').__keep,
      open: document.querySelector('#games .card[data-id="n3"] details').open,
      y: Math.round(window.pageYOffset), tab: !!document.querySelector('#tabs button').__keep }));
    check('B1 one score changed: that card shows it and is a NEW node, the other 29 are the same nodes', s.n5 && s.n5fresh && s.kept === 29 && s.cards === 30, s);
    check('B2 ...the scroll offset (900), the open line score and the tab strip are untouched', s.y === 900 && s.open && s.tab, s);

    /* the card that changed had its line score opened by the user: the panel stays open on the NEW card */
    await page.evaluate(() => { document.querySelector('#games .card[data-id="n5"] details').open = true; });
    world['basketball/nba'][5].h = 556;
    await page.click('#syncBtn'); await waitIdle(page);
    s = await page.evaluate(() => ({ open: document.querySelector('#games .card[data-id="n5"] details').open, n5: document.querySelector('#games .card[data-id="n5"]').textContent.indexOf('556') >= 0 }));
    check('B3 an opened line score stays open on the replaced card', s.open && s.n5, s);

    world['basketball/nba'] = longList('n', 30).slice(0, 29);             // a game disappears: different list => full redraw
    await page.click('#syncBtn'); await waitIdle(page);
    s = await page.evaluate(() => ({ kept: Array.from(document.querySelectorAll('#games .card')).filter(c => c.__keep).length, cards: document.querySelectorAll('#games .card').length, y: Math.round(window.pageYOffset) }));
    check('B4 a different set of games is a full redraw (no old nodes), still 900', s.kept === 0 && s.cards === 29 && s.y === 900, s);

    /* nothing changed on a re-render: the very same nodes */
    await page.evaluate(() => { document.querySelectorAll('#games .card').forEach(c => { c.__k2 = 1; }); document.querySelector('#tabs button').__k2 = 1; });
    await page.evaluate(() => { const b = document.querySelector('#optBtn'); b.click(); b.click(); });   // two re-renders (settings panel opened and closed): no card changes
    await page.waitForTimeout(300);
    s = await page.evaluate(() => ({ kept: Array.from(document.querySelectorAll('#games .card')).filter(c => c.__k2).length, cards: document.querySelectorAll('#games .card').length, tab: !!document.querySelector('#tabs button').__k2, y: Math.round(window.pageYOffset) }));
    check('B5 a re-render with nothing changed leaves every card and the tab strip as the same nodes', s.kept === 29 && s.cards === 29 && s.tab && s.y === 900, s);

    /* D. the pull-to-refresh swipe is never cancelled */
    await page.evaluate(() => window.scrollTo(0, 0));
    const cancelled = await page.evaluate(() => {
      function t(type, y) {
        const touch = new Touch({ identifier: 1, target: document.body, clientX: 150, clientY: y });
        const e = new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [touch], changedTouches: [touch] });
        document.dispatchEvent(e); return e.defaultPrevented;
      }
      const r = [t('touchstart', 20), t('touchmove', 120), t('touchmove', 300)]; t('touchend', 300); return r;
    });
    check('D1 touchmove during a pull is not default-prevented (passive listener)', cancelled.every(x => x === false), cancelled);
    await waitIdle(page);
    await ctx.close();
  }

  /* ===== C. Live sync only polls what can change ===== */
  {
    const min = m => new Date(NOW.getTime() + m * 60000).toISOString();
    world['basketball/nba'] = [{ id: 'a1', start: min(-300), state: 'post', a: 90, h: 99 }, { id: 'a2', start: min(-240), state: 'post', a: 80, h: 70 }];
    world['basketball/wnba'] = [{ id: 'b1', start: min(-200), state: 'post', a: 70, h: 77 }, { id: 'b2', start: min(10), state: 'pre', a: 0, h: 0 }];
    world['hockey/nhl'] = [{ id: 'c1', start: min(180), state: 'pre', a: 0, h: 0 }, { id: 'c2', start: min(200), state: 'pre', a: 0, h: 0 }];
    world['football/nfl'] = [{ id: 'd1', start: min(-60), state: 'in', a: 7, h: 10 }];
    const { ctx, page } = await open();
    await page.clock.install({ time: NOW });
    await page.goto('http://localhost:' + PORT + '/index.html?v=99');
    await page.click('#syncBtn'); await waitIdle(page);
    const todayLeagues = () => Array.from(new Set(log.filter(x => x.endsWith('|' + ymd(NOW))).map(x => x.split('|')[0]))).sort();
    log.length = 0;
    await page.click('#liveBtn'); await page.waitForTimeout(1200);
    check('C1 switching Live on fetches today for every league once (not lean)', todayLeagues().length === 7, todayLeagues());
    log.length = 0;
    await page.clock.runFor(10500); await page.waitForTimeout(1200);
    const L1 = todayLeagues();
    check('C2 first live tick polls only the live NFL game and the WNBA game due in 10 min', JSON.stringify(L1) === JSON.stringify(['basketball/wnba', 'football/nfl']), L1);
    check('C3 ...not the finished NBA slate, and not the NHL games 3 hours away', L1.indexOf('basketball/nba') < 0 && L1.indexOf('hockey/nhl') < 0, L1);
    /* a quiet day is still looked at again every 2 h (a start time can move after the day was saved): 125 min on, the NHL
       games are 55 min away -- not due yet -- but the saved copy is older than 2 h, so they are fetched once ... */
    log.length = 0;
    await page.clock.fastForward(125 * 60000);
    await page.clock.runFor(10500); await page.waitForTimeout(1200);
    const L2 = todayLeagues();
    check('C4 a quiet league is re-checked once its saved copy is over 2 h old (' + L2.join(', ') + ')', L2.indexOf('hockey/nhl') >= 0 && L2.indexOf('basketball/nba') < 0, L2);
    /* ... and not again at the next tick, since that fetch refreshed it */
    log.length = 0;
    await page.clock.runFor(10500); await page.waitForTimeout(1200);
    const L3 = todayLeagues();
    check('C5 ...then left alone again at the next tick (' + L3.join(', ') + ')', L3.indexOf('hockey/nhl') < 0 && L3.indexOf('basketball/nba') < 0, L3);
    /* 30 min later the NHL games are within 30 minutes of starting: polled every tick from here on */
    log.length = 0;
    await page.clock.fastForward(30 * 60000);
    await page.clock.runFor(10500); await page.waitForTimeout(1200);
    const L4 = todayLeagues();
    check('C6 once the NHL games are within 30 minutes the live loop polls them (' + L4.join(', ') + ')', L4.indexOf('hockey/nhl') >= 0 && L4.indexOf('basketball/nba') < 0, L4);
    await ctx.close();
  }

  console.log(fails ? '\n' + fails + ' check(s) FAILED' : '\nall live-render checks passed');
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
