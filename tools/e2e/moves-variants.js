/* Moves tab variants: money line, price-only, halftime/F5, favourite flip, books picker */
const { chromium } = require('playwright');
const path = require('path');
const OUT = process.env.E2E_OUT || require('os').tmpdir();   // screenshots land here
function pad(n) { return (n < 10 ? '0' : '') + n; }
function ymd(d) { return '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
const TODAY = new Date();
function at(day, h, m) { const d = addDays(TODAY, day); d.setHours(h, m, 0, 0); return d.toISOString(); }
const T = {
  NYY: ['NYY', 'New York Yankees', 'New York', 'Yankees'], BOS: ['BOS', 'Boston Red Sox', 'Boston', 'Red Sox'],
  NYK: ['NYK', 'New York Knicks', 'New York', 'Knicks'], BOC: ['BOC', 'Boston Celtics', 'Boston', 'Celtics']
};
function team(t, ha) { return { homeAway: ha, score: '0', linescores: [], records: [], team: { abbreviation: t[0], displayName: t[1], location: t[2], shortDisplayName: t[3], color: '1a2b3c' } }; }
function ev(g) { return { id: g.id, date: g.start, status: { type: { state: 'pre', completed: false, shortDetail: '7:05 PM', detail: '7:05 PM', name: 'STATUS_SCHEDULED', description: 'Scheduled' }, period: 0 }, competitions: [{ timeValid: true, competitors: [team(g.home, 'home'), team(g.away, 'away')] }] }; }
const world = {
  games: { 'baseball/mlb': [{ id: 'm1', away: T.NYY, home: T.BOS, start: at(0, 23, 5) }], 'basketball/nba': [{ id: 'n1', away: T.BOC, home: T.NYK, start: at(0, 23, 30) }] },
  pin: {
    246: { m1: { ml: [-150, 130], ml1: [-140, 120], sp: [1.5, -105, -115], tot: [8.5, -110, -110], sp1: [0.5, -120, 100], tot1: [4.5, -115, -105] } },
    487: { n1: { sp: -1, tot: 220, sp1: -0.5, tot1: 110 } }
  }
};
function mk(mid, type, period, a, b) { return { matchupId: mid, type, period, isAlternate: false, status: 'open', prices: [a, b] }; }
function pinnacle(url, lg) {
  const games = lg === 246 ? world.games['baseball/mlb'] : world.games['basketball/nba'];
  if (/\/matchups/.test(url)) return games.map((g, i) => ({ id: 7000 + i, type: 'matchup', startTime: g.start, participants: [{ alignment: 'home', name: g.home[1] }, { alignment: 'away', name: g.away[1] }] }));
  const out = [];
  games.forEach((g, i) => {
    const o = world.pin[lg][g.id]; const id = 7000 + i;
    if (lg === 246) {
      out.push(mk(id, 'moneyline', 0, { designation: 'home', price: o.ml[0] }, { designation: 'away', price: o.ml[1] }));
      out.push(mk(id, 'spread', 0, { designation: 'home', points: -o.sp[0], price: o.sp[1] }, { designation: 'away', points: o.sp[0], price: o.sp[2] }));
      out.push(mk(id, 'total', 0, { designation: 'over', points: o.tot[0], price: o.tot[1] }, { designation: 'under', points: o.tot[0], price: o.tot[2] }));
      out.push(mk(id, 'moneyline', 1, { designation: 'home', price: o.ml1[0] }, { designation: 'away', price: o.ml1[1] }));
      out.push(mk(id, 'spread', 1, { designation: 'home', points: -o.sp1[0], price: o.sp1[1] }, { designation: 'away', points: o.sp1[0], price: o.sp1[2] }));
      out.push(mk(id, 'total', 1, { designation: 'over', points: o.tot1[0], price: o.tot1[1] }, { designation: 'under', points: o.tot1[0], price: o.tot1[2] }));
    } else {
      out.push(mk(id, 'spread', 0, { designation: 'home', points: o.sp, price: -110 }, { designation: 'away', points: -o.sp, price: -110 }));
      out.push(mk(id, 'total', 0, { designation: 'over', points: o.tot, price: -110 }, { designation: 'under', points: o.tot, price: -110 }));
      out.push(mk(id, 'spread', 1, { designation: 'home', points: o.sp1, price: -110 }, { designation: 'away', points: -o.sp1, price: -110 }));
      out.push(mk(id, 'total', 1, { designation: 'over', points: o.tot1, price: -110 }, { designation: 'under', points: o.tot1, price: -110 }));
    }
  });
  return out;
}
let fails = 0;
function check(name, ok, extra) { console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); if (!ok) fails++; }

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 411, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith('http://localhost:8765/')) return route.continue();
    const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (url.startsWith('https://site.api.espn.com/')) {
      const m = /sports\/([^?]+)\/scoreboard\?dates=(\d{8})/.exec(url);
      const events = (m && m[2] === ymd(TODAY) && world.games[m[1]]) ? world.games[m[1]].map(ev) : [];
      return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ events }) });
    }
    if (url.startsWith('https://guest.api.arcadia.pinnacle.com/')) {
      const lg = /leagues\/(\d+)\//.exec(url)[1] | 0;
      return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(lg === 246 || lg === 487 ? pinnacle(url, lg) : []) });
    }
    return route.fulfill({ status: 404, headers: cors, body: '{}' });
  });
  const settle = ms => page.waitForTimeout(ms || 600);
  async function sync() { await page.click('#syncBtn'); await page.waitForFunction(() => !document.querySelector('#syncBtn').disabled, null, { timeout: 15000 }); await settle(900); }

  await page.goto('http://localhost:8765/index.html?v=98');
  await settle(800);
  await page.click('#oddsBtn');
  await page.click('#optBtn');
  await page.click('#perSeg button[data-v="oSeg"]');      // halftime / F5 odds on too
  await page.click('#optBtn');
  await sync();                                           // first download: nothing to compare yet
  await page.click('#tabs button.mvtab'); await settle();
  check('first sync: no moves yet', /No lines have moved yet/.test(await page.textContent('#games')));

  world.pin[246].m1 = { ml: [-170, 145], ml1: [-150, 128], sp: [1.5, -110, -110], tot: [8.5, -120, 100], sp1: [0.5, -120, 100], tot1: [5, -115, -105] };
  world.pin[487].n1 = { sp: 1.5, tot: 222, sp1: 0.5, tot1: 110 };            // favourite flips: NYK -1 -> BOC -1.5
  await sync();
  const t = (await page.textContent('#games')).replace(/\s+/g, ' ');
  console.log('--- ' + t);
  check('MLB card listed', /NYY @ BOS/.test(t));
  check('money line −150 → −170 (20¢)', /BOS −150\s*→\s*−170/.test(t) || /−150\s*→\s*−170/.test(t));
  check('money line chip 20¢', /20¢/.test(t));
  check('price-only total shows ¢ chip + juice line', /O\/U 8\.5/.test(t) && /O −110\s*→\s*−120/.test(t));
  check('F5 total 4.5 → 5 shown as 0.5 pts', /F5 Total/.test(t) && /4\.5\s*→\s*5/.test(t) && /0\.5 pts/.test(t));
  check('F5 money line listed', /F5 Money/.test(t));
  check('NBA favourite flip: 2.5 pts', /NYK −1\s*→\s*BOC −1\.5/.test(t) && /2\.5 pts/.test(t), t.slice(0, 600));
  check('1H spread move listed with 1H label', /1H Spread/.test(t));
  const iNba = t.indexOf('BOC @ NYK'), iMlb = t.indexOf('NYY @ BOS');
  check('order: NBA (2.5 pts) above MLB (money line 2.0 equiv.)', iNba >= 0 && iMlb > iNba, [iNba, iMlb]);
  await page.screenshot({ path: path.join(OUT, 'm_moves_variants.png'), fullPage: true });
  console.log(fails ? fails + ' FAILURE(S)' : 'ALL PASSED');
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
