/* A scoreboard answer with a bad BODY must not surface as "Unexpected end of JSON input"
   (server for app/src/main/assets on :8765, or E2E_PORT). The native relay streams the upstream body straight
   through, so a dropped connection / an empty 200 reaches the page as a 200 with nothing (or half a JSON) in it.
   1  empty 200 once, good the second time     -> retried once, no banner, the game shows
   2  half a JSON once, good the second time    -> same
   3  empty 200 every time                      -> exactly 2 attempts (no hammering), a readable banner (not the raw
                                                   parser message), and Sync is usable again afterwards
   4  HTTP 500                                  -> NOT retried (a retry would only add load to a failing server) */
const { chromium } = require('playwright');
const PORT = process.env.E2E_PORT || 8765;

function pad(n) { return (n < 10 ? '0' : '') + n; }
function ymd(d) { return '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()); }
const TODAY = new Date();
const TARGET = 'hockey/nhl/scoreboard?dates=' + ymd(TODAY);

function side(abbr, ha) {
  return { homeAway: ha, score: '0', linescores: [], winner: false, records: [{ type: 'total', summary: '1-0' }],
    team: { abbreviation: abbr, displayName: abbr + ' City', location: abbr, shortDisplayName: abbr, color: '1d428a' } };
}
function nhlBody() {
  const d = new Date(TODAY); d.setHours(23, 30, 0, 0);
  return JSON.stringify({ events: [{ id: 'h1', date: d.toISOString(),
    status: { type: { state: 'pre', completed: false, shortDetail: '7:30 PM', detail: '7:30 PM', name: 'STATUS_SCHEDULED', description: 'Scheduled' }, period: 0 },
    competitions: [{ timeValid: true, competitors: [side('VGK', 'home'), side('EDM', 'away')] }] }] });
}

let fails = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''));
  if (!ok) fails++;
}

/* answer(n) -> {status, body} for the n-th request (1-based) to today's NHL scoreboard; everything else is a valid empty day */
async function scenario(browser, answer) {
  const ctx = await browser.newContext({ viewport: { width: 411, height: 860 }, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => { errs.push(e.message); });
  let attempts = 0;
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith('http://localhost:' + PORT + '/')) return route.continue();
    const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (url.indexOf(TARGET) >= 0) {
      const a = answer(++attempts);
      return route.fulfill({ status: a.status, headers: cors, body: a.body });
    }
    return route.fulfill({ status: 200, headers: cors, body: /scoreboard/.test(url) ? '{"events":[]}' : '[]' });
  });
  await page.goto('http://localhost:' + PORT + '/index.html?v=99');
  await page.waitForTimeout(500);
  await page.click('#syncBtn');
  await page.waitForFunction(() => !document.querySelector('#syncBtn').disabled, null, { timeout: 15000 });
  await page.waitForTimeout(900);
  const s = await page.evaluate(() => ({
    cards: document.querySelectorAll('#games .card').length,
    banner: document.querySelector('#banner').className.indexOf('show') >= 0 ? document.querySelector('#banner').textContent : '',
    syncEnabled: !document.querySelector('#syncBtn').disabled
  }));
  s.attempts = attempts;
  await ctx.close();
  return { s, errs };
}

(async () => {
  const browser = await chromium.launch();
  const good = () => ({ status: 200, body: nhlBody() });
  let r;

  r = await scenario(browser, n => n === 1 ? { status: 200, body: '' } : good());
  check('1a empty 200 then good: the game shows', r.s.cards === 1, r.s);
  check('1b ...no error banner', r.s.banner === '', r.s);
  check('1c ...exactly one retry (2 attempts)', r.s.attempts === 2, r.s);
  check('1d no script errors', r.errs.length === 0, r.errs);

  r = await scenario(browser, n => n === 1 ? { status: 200, body: nhlBody().slice(0, 60) } : good());
  check('2a half a JSON then good: the game shows', r.s.cards === 1, r.s);
  check('2b ...no error banner', r.s.banner === '', r.s);
  check('2c ...exactly one retry (2 attempts)', r.s.attempts === 2, r.s);

  r = await scenario(browser, () => ({ status: 200, body: '' }));
  check('3a empty 200 every time: gives up after exactly 2 attempts', r.s.attempts === 2, r.s);
  check('3b ...says NHL could not refresh', /NHL/.test(r.s.banner), r.s);
  check('3c ...in plain words, not the raw parser message', r.s.banner !== '' && !/Unexpected end of JSON/i.test(r.s.banner) && /empty/i.test(r.s.banner), r.s);
  check('3d ...and Sync is usable again', r.s.syncEnabled === true, r.s);

  r = await scenario(browser, () => ({ status: 500, body: 'oops' }));
  check('4a HTTP 500 is not retried (1 attempt)', r.s.attempts === 1, r.s);
  check('4b ...still reported with its status', /HTTP 500/.test(r.s.banner), r.s);

  console.log(fails ? '\n' + fails + ' check(s) FAILED' : '\nall bad-body checks passed');
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
