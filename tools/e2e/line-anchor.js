/* Which team a SAVED line is for.
   A  parseEspnOdds: ESPN's embedded line is keyed to the provider's home team, which can be the other team from ESPN's own
      "home". The favourite named in `details`, the favourite flag, the sign of the spread, the cheaper money line and the team ids
      are read together (price-style details in hockey / baseball, pick'em games, ids only, conflicting fields ...).
   B  stamped lines: stampHome / partFor / sameSideAs / orientEntry never touch what they were given, copy only when a line
      really has to be turned, and leave lines with no stamp (older builds) alone.
   C  mirrorEntry (observed re-label): only lines with no stamp are turned, and they get stamped.
   D  upgrade from a build that did not stamp: its saved lines still show next to the right team across re-labels, back and forth. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
function pad(n) { return (n < 10 ? '0' : '') + n; }
function ymd(d) { return '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()); }
let fails = 0;
function check(n, ok, x) { console.log((ok ? 'PASS ' : 'FAIL ') + n + (!ok && x !== undefined ? '  -> ' + JSON.stringify(x) : '')); if (!ok) fails++; }

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 411, height: 900 } });

  /* ---------- A, B, C: the functions called directly (the app is one closure: serve a copy with them exposed) ---------- */
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'src', 'main', 'assets', 'index.html'), 'utf8');
  const tail = '\n})();\n</script>';
  const cut = html.lastIndexOf(tail);
  check('0 the page script ends where this test expects (so its internals can be exposed)', cut > 0);
  const unitPage = await ctx.newPage();
  unitPage.on('pageerror', e => { console.log('PAGE ERROR (unit)', e.message); fails++; });
  await unitPage.route('**/*', route => {
    if (/^http:\/\/localhost:8765\/index\.html/.test(route.request().url())) {
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html.slice(0, cut) + '\nwindow.__t = { parseEspnOdds: parseEspnOdds, stampHome: stampHome, partFor: partFor, sameSideAs: sameSideAs, orientEntry: orientEntry, mirrorEntry: mirrorEntry, flipPart: flipPart };' + html.slice(cut) });
    }
    return route.fulfill({ status: 404, body: '{}' });
  });
  await unitPage.goto('http://localhost:8765/index.html?v=99');
  await unitPage.waitForTimeout(500);
  const R = await unitPage.evaluate(() => {
    const t = window.__t, out = {};
    /* ESPN's odds object, keyed to the PROVIDER's home. o: details, ps (home line), pa (away line), mh / ma (money lines), hf / af (favorite flags), hid / aid */
    function mk(o) {
      const side = (id, fav) => (id == null ? undefined : { favorite: fav, underdog: !fav, team: { id: id } });
      const x = { provider: { name: 'DraftKings' }, details: o.details,
        pointSpread: o.ps == null ? undefined : { home: { close: { line: o.ps, odds: '-110' } }, away: { close: { line: o.pa, odds: '-105' } } },
        moneyline: o.mh == null ? undefined : { home: { close: { odds: o.mh } }, away: { close: { odds: o.ma } } },
        total: { over: { close: { line: 'o5.5', odds: '-110' } }, under: { close: { line: 'u5.5', odds: '-110' } } } };
      if (o.hid != null) { x.homeTeamOdds = side(o.hid, o.hf); x.awayTeamOdds = side(o.aid, o.af); }
      else if (o.hf != null) { x.homeTeamOdds = { favorite: o.hf }; x.awayTeamOdds = { favorite: o.af }; }
      return x;
    }
    /* ESPN's home is AAA (id 1), away BBB (id 2); the answer is read as ESPN's home team sees it */
    function run(name, o) { const r = t.parseEspnOdds([mk(o)], 'AAA', 'BBB', '1', '2'); out[name] = r && r.full; }
    run('spreadOk', { details: 'AAA -3.5', ps: '-3.5', pa: '+3.5', mh: '-170', ma: '+150' });
    run('spreadReversed', { details: 'AAA -3.5', ps: '+3.5', pa: '-3.5', mh: '+150', ma: '-170' });
    run('spreadUnicodeMinus', { details: 'AAA −3.5', ps: '+3.5', pa: '-3.5', mh: '+150', ma: '-170' });
    run('priceOk', { details: 'AAA -142', ps: '-1.5', pa: '+1.5', mh: '-142', ma: '+120', hf: true, af: false });
    run('priceReversed', { details: 'AAA -142', ps: '+1.5', pa: '-1.5', mh: '+120', ma: '-142', hf: false, af: true });
    run('priceReversedNoFlags', { details: 'AAA -142', ps: '+1.5', pa: '-1.5', mh: '+120', ma: '-142' });
    run('priceAwayFav', { details: 'BBB -150', ps: '+1.5', pa: '-1.5', mh: '+130', ma: '-150', hf: false, af: true });
    run('priceAwayFavReversed', { details: 'BBB -150', ps: '-1.5', pa: '+1.5', mh: '-150', ma: '+130', hf: true, af: false });
    run('moneylineOnlyReversed', { details: 'AAA -150', mh: '+130', ma: '-150', hf: false, af: true });
    run('pickemIdsOk', { details: 'EVEN', ps: '0', pa: '0', mh: '-105', ma: '-115', hid: '1', aid: '2' });
    run('pickemIdsReversed', { details: 'EVEN', ps: '0', pa: '0', mh: '-105', ma: '-115', hid: '2', aid: '1' });
    run('pickemNoIds', { details: 'EVEN', ps: '0', pa: '0', mh: '-105', ma: '-115' });
    run('nothingSays', { details: 'OFF', ps: '-3.5', pa: '+3.5', mh: '-170', ma: '+150' });
    run('tieNoIds', { details: 'AAA -142', ps: '-1.5', pa: '+1.5', mh: '+120', ma: '-142' });   /* spread says home fav, money line says home dog: no way to know */
    run('tieIdsReversed', { details: 'AAA -142', ps: '-1.5', pa: '+1.5', mh: '+120', ma: '-142', hid: '2', aid: '1' });
    run('unknownAbbrIdsReversed', { details: 'ZZZ -142', ps: '-1.5', pa: '+1.5', mh: '-142', ma: '+120', hid: '2', aid: '1' });
    run('conflictFieldsWin', { details: 'AAA -142', ps: '-1.5', pa: '+1.5', mh: '-142', ma: '+120', hf: true, af: false, hid: '2', aid: '1' });   /* ids disagree with everything else: the favourite fields win */
    run('idsOfOtherTeams', { details: 'EVEN', ps: '0', pa: '0', mh: '-105', ma: '-115', hid: '8', aid: '9' });
    out.noLines = t.parseEspnOdds([{ provider: { name: 'DraftKings' }, details: 'AAA -3' }], 'AAA', 'BBB', '1', '2');
    out.noList = t.parseEspnOdds(null, 'AAA', 'BBB', '1', '2');
    out.noIdsArgs = (function () { const r = t.parseEspnOdds([mk({ details: 'AAA -3.5', ps: '+3.5', pa: '-3.5', mh: '+150', ma: '-170' })], 'AAA', 'BBB'); return r && r.full; })();

    /* B: stamped lines */
    const g = { home: { abbr: 'HOM' }, away: { abbr: 'AWY' } };
    const part = ho => ({ sp: { h: -3.5, hp: -110, ap: -105 }, tot: { p: 140.5, o: -108, u: -112 }, ml: { h: -170, a: 150 }, ho: ho });
    const copy = JSON.stringify(part('AWY'));
    const stamped = t.stampHome({ sp: { h: -3.5, hp: -110, ap: -105 }, tot: null, ml: null }, g);
    out.stamp = { ho: stamped.ho, sp: stamped.sp.h, nullStays: t.stampHome(null, g) === null };
    const same = part('HOM'), p1 = t.partFor(same, g);
    out.partSame = p1 === same;
    const away = part('AWY'), p2 = t.partFor(away, g);
    out.partTurned = { h: p2.sp.h, hp: p2.sp.hp, ap: p2.sp.ap, mlh: p2.ml.h, mla: p2.ml.a, total: p2.tot.p, over: p2.tot.o, ho: p2.ho, originalUntouched: JSON.stringify(away) === copy, newObject: p2 !== away };
    const old = { sp: { h: -3.5, hp: -110, ap: -105 }, tot: null, ml: null }, p3 = t.partFor(old, g);
    out.partLegacy = p3 === old;
    const other = part('ZZZ'); out.partOther = t.partFor(other, g) === other;
    out.partNull = t.partFor(null, g) === null && t.partFor(undefined, g) === undefined;
    const s1 = t.sameSideAs(part('AWY'), part('HOM')), s2 = part('HOM');
    out.sameSide = { turned: s1.sp.h === 3.5 && s1.ho === 'HOM', sameKept: t.sameSideAs(s2, part('HOM')) === s2, legacyKept: t.sameSideAs(old, part('HOM')) === old };
    /* orientEntry */
    const e0 = { b: { pinnacle: { n: 'Pinnacle', full: part('HOM'), seg: part('HOM') }, draftkings: { n: 'DK', full: part('HOM') } } };
    out.entryNoCopy = t.orientEntry(e0, g) === e0;
    const e1 = { b: { pinnacle: { n: 'Pinnacle', ft: 5, full: part('AWY'), seg: part('HOM'), pv: { full: { p: part('AWY'), at: 9 }, seg: { p: part('HOM'), at: 8 } } }, draftkings: { n: 'DK', full: part('HOM') } } };
    const e1copy = JSON.stringify(e1), o1 = t.orientEntry(e1, g);
    out.entryTurned = {
      newEntry: o1 !== e1, fullTurned: o1.b.pinnacle.full.sp.h === 3.5 && o1.b.pinnacle.full.ho === 'HOM', segKept: o1.b.pinnacle.seg === e1.b.pinnacle.seg,
      pvFullTurned: o1.b.pinnacle.pv.full.p.sp.h === 3.5 && o1.b.pinnacle.pv.full.at === 9, pvSegKept: o1.b.pinnacle.pv.seg === e1.b.pinnacle.pv.seg,
      otherBookKept: o1.b.draftkings === e1.b.draftkings, plainFieldsKept: o1.b.pinnacle.ft === 5 && o1.b.pinnacle.n === 'Pinnacle', originalUntouched: JSON.stringify(e1) === e1copy
    };
    /* C: mirrorEntry only turns lines with no stamp, and stamps them */
    const e2 = { b: { pinnacle: { n: 'Pinnacle', full: part('AWY'), seg: { sp: { h: -1.5, hp: -110, ap: -110 }, tot: null, ml: null }, pv: { full: { p: { sp: { h: -3, hp: -110, ap: -110 }, tot: null, ml: null }, at: 7 }, seg: { p: part('AWY'), at: 6 } } } } };
    const m = t.mirrorEntry(e2, 'NEW').b.pinnacle;
    out.mirror = {
      stampedKept: m.full === e2.b.pinnacle.full, unstampedTurned: m.seg.sp.h === 1.5 && m.seg.ho === 'NEW',
      pvUnstampedTurned: m.pv.full.p.sp.h === 3 && m.pv.full.p.ho === 'NEW' && m.pv.full.at === 7, pvStampedKept: m.pv.seg === e2.b.pinnacle.pv.seg
    };
    return out;
  });
  const sp = k => R[k] && R[k].sp && R[k].sp.h, ml = k => R[k] && R[k].ml && R[k].ml.h;
  check('A1 spread-style details, fields agree: left as they are (AAA -3.5)', sp('spreadOk') === -3.5 && ml('spreadOk') === -170, R.spreadOk);
  check('A2 spread-style details, "home" fields are the other team\'s: turned (AAA -3.5, AAA money line -170)', sp('spreadReversed') === -3.5 && ml('spreadReversed') === -170 && R.spreadReversed.sp.hp === -105, R.spreadReversed);
  check('A3 ... with the real minus sign (U+2212) in details', sp('spreadUnicodeMinus') === -3.5, R.spreadUnicodeMinus);
  check('A4 price-style details (hockey / baseball), fields agree: left as they are', sp('priceOk') === -1.5 && ml('priceOk') === -142, R.priceOk);
  check('A5 price-style details, fields keyed to the other team: turned (AAA -1.5, AAA -142)', sp('priceReversed') === -1.5 && ml('priceReversed') === -142 && R.priceReversed.sp.hp === -105 && R.priceReversed.ml.a === 120, R.priceReversed);
  check('A6 ... also without the favourite flags (spread sign + cheaper money line)', sp('priceReversedNoFlags') === -1.5 && ml('priceReversedNoFlags') === -142, R.priceReversedNoFlags);
  check('A7 favourite is the AWAY team, fields agree: left as they are (home +1.5, +130)', sp('priceAwayFav') === 1.5 && ml('priceAwayFav') === 130, R.priceAwayFav);
  check('A8 favourite is the AWAY team, fields keyed to the other team: turned (home +1.5, +130)', sp('priceAwayFavReversed') === 1.5 && ml('priceAwayFavReversed') === 130, R.priceAwayFavReversed);
  check('A9 money line only (no spread), keyed to the other team: turned', ml('moneylineOnlyReversed') === -150 && R.moneylineOnlyReversed.ml.a === 130, R.moneylineOnlyReversed);
  check('A10 pick\'em, team ids agree with ESPN\'s labels: left as they are', ml('pickemIdsOk') === -105, R.pickemIdsOk);
  check('A11 pick\'em, team ids say the "home" side is the other team: turned', ml('pickemIdsReversed') === -115 && R.pickemIdsReversed.ml.a === -105, R.pickemIdsReversed);
  check('A12 pick\'em with nothing to go on: left as it is', ml('pickemNoIds') === -105, R.pickemNoIds);
  check('A13 no favourite named (OFF): left as it is', sp('nothingSays') === -3.5, R.nothingSays);
  check('A14 fields that disagree with each other and no ids: left as they are', sp('tieNoIds') === -1.5 && ml('tieNoIds') === 120, R.tieNoIds);
  check('A15 fields that disagree with each other: the team ids decide', sp('tieIdsReversed') === 1.5 && ml('tieIdsReversed') === -142, R.tieIdsReversed);
  check('A16 details names a team that is not in the game: the team ids decide', sp('unknownAbbrIdsReversed') === 1.5, R.unknownAbbrIdsReversed);
  check('A17 ids contradict every other field: the favourite fields win (left as they are)', sp('conflictFieldsWin') === -1.5 && ml('conflictFieldsWin') === -142, R.conflictFieldsWin);
  check('A18 ids of two other teams: ignored', ml('idsOfOtherTeams') === -105, R.idsOfOtherTeams);
  check('A19 no usable line -> null; no list -> null', R.noLines === null && R.noList === null, [R.noLines, R.noList]);
  check('A20 callers that pass no team ids (the old signature) still get the details-text rule', R.noIdsArgs && R.noIdsArgs.sp.h === -3.5, R.noIdsArgs);

  check('B1 stampHome records the home team and keeps the numbers (null stays null)', R.stamp.ho === 'HOM' && R.stamp.sp === -3.5 && R.stamp.nullStays, R.stamp);
  check('B2 partFor: a line already for the home team is returned as it is', R.partSame === true);
  check('B3 partFor: a line for the AWAY team is turned (spread, prices, money line, stamp), total kept, the original untouched', R.partTurned.h === 3.5 && R.partTurned.hp === -105 && R.partTurned.ap === -110 && R.partTurned.mlh === 150 && R.partTurned.mla === -170 && R.partTurned.total === 140.5 && R.partTurned.over === -108 && R.partTurned.ho === 'HOM' && R.partTurned.originalUntouched && R.partTurned.newObject, R.partTurned);
  check('B4 partFor: a line with no stamp (older build), or for a third team, or nothing, is returned as it is', R.partLegacy && R.partOther && R.partNull, [R.partLegacy, R.partOther, R.partNull]);
  check('B5 sameSideAs: turns a line to another line\'s team; same side / no stamp returned as it is', R.sameSide.turned && R.sameSide.sameKept && R.sameSide.legacyKept, R.sameSide);
  check('B6 orientEntry: nothing to turn -> the very same entry back (no copy on the hot path)', R.entryNoCopy === true);
  check('B7 orientEntry: turns only the lines that need it (full + previous full), shares the rest, never touches the original', R.entryTurned.newEntry && R.entryTurned.fullTurned && R.entryTurned.segKept && R.entryTurned.pvFullTurned && R.entryTurned.pvSegKept && R.entryTurned.otherBookKept && R.entryTurned.plainFieldsKept && R.entryTurned.originalUntouched, R.entryTurned);
  check('C1 mirrorEntry: stamped lines are left alone, unstamped lines (and previous lines) are turned and stamped', R.mirror.stampedKept && R.mirror.unstampedTurned && R.mirror.pvUnstampedTurned && R.mirror.pvStampedKept, R.mirror);

  /* ---------- D: data saved by a build that did not stamp, then ESPN re-labels (non-neutral) back and forth ---------- */
  const TODAY = new Date(), DAY = ymd(TODAY);
  const START = (() => { const d = new Date(TODAY); d.setHours(23, 30, 0, 0); return d.toISOString(); })();
  const NYK = ['NYK', 'New York Knicks', 'New York', 'Knicks'], BOC = ['BOC', 'Boston Celtics', 'Boston', 'Celtics'];
  const world = { homeBoc: false };
  const team = (t, ha) => ({ homeAway: ha, score: '0', linescores: [], records: [], team: { abbreviation: t[0], displayName: t[1], location: t[2], shortDisplayName: t[3], color: '123456' } });
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith('http://localhost:8765/')) return route.continue();
    const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (url.startsWith('https://site.api.espn.com/')) {
      const m = /sports\/([^?]+)\/scoreboard\?dates=(\d{8})/.exec(url);
      const h = world.homeBoc ? BOC : NYK, a = world.homeBoc ? NYK : BOC;
      const ev = { id: 'g1', date: START, status: { type: { state: 'pre', completed: false, shortDetail: '7:30 PM', detail: '7:30 PM', name: 'STATUS_SCHEDULED', description: 'Scheduled' }, period: 0 }, competitions: [{ timeValid: true, competitors: [team(h, 'home'), team(a, 'away')] }] };
      return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ events: (m && m[1] === 'basketball/nba' && m[2] === DAY) ? [ev] : [] }) });
    }
    return route.fulfill({ status: 404, headers: cors, body: '[]' });
  });
  const settle = ms => page.waitForTimeout(ms || 700);
  async function sync() { await page.click('#syncBtn'); await page.waitForFunction(() => !document.querySelector('#syncBtn').disabled, null, { timeout: 15000 }); await settle(1100); }
  const okey = 'sbx2:o-nba:' + DAY;
  const board = () => page.evaluate(() => Array.prototype.map.call(document.querySelectorAll('#games .card .trow'), r => r.textContent.replace(/\s+/g, ' ').trim()));
  const rowOf = (rows, abbr) => rows.filter(r => r.indexOf(abbr) === 0)[0] || '';
  const nykBoc = rows => /^NYK.*−8.*−114/.test(rowOf(rows, 'NYK')) && /^BOC.*\+8.*−102/.test(rowOf(rows, 'BOC'));   /* each team's OWN row: NYK -8 at -114, BOC +8 at -102 */
  const raw = () => page.evaluate(k => { const r = localStorage.getItem(k); const o = r ? JSON.parse(r) : null; return o && o.games.g1 && o.games.g1.b.pinnacle; }, okey);
  await page.goto('http://localhost:8765/index.html?v=99');
  await settle(800);
  await page.click('#oddsBtn'); await settle(300);
  await page.click('#optBtn'); await settle(300); await page.click('#orfBtn'); await settle(300); await page.click('#optBtn'); await settle(300);   /* Odds refresh OFF: only the schedule is downloaded, saved lines are shown as they are */
  /* what the previous build saved: NYK (the home team then) -8, no stamp */
  await page.evaluate(([k, now]) => {
    localStorage.setItem(k, JSON.stringify({ t: now, st: { pinnacle: now }, games: { g1: { b: { pinnacle: { n: 'Pinnacle', s: 'pinnacle', ft: now,
      full: { sp: { h: -8, hp: -114, ap: -102 }, tot: { p: 144.5, o: -117, u: -103 }, ml: null } } } } } }));
  }, [okey, Date.now()]);
  await sync();
  let b = await board();
  check('D1 saved by the old build, NYK home: NYK row -8 at -114, BOC row +8 at -102', nykBoc(b), b);
  world.homeBoc = true; await sync();
  b = await board();
  check('D2 ESPN corrects the host (BOC home, now the bottom row): each team still has its own line (NYK -8 at -114, BOC +8 at -102)', nykBoc(b) && /^NYK/.test(b[0]) && /^BOC/.test(b[1]), b);
  let p = await raw();
  check('D3 the old line was turned to the new home team and is now stamped (home BOC +8)', p && p.full.ho === 'BOC' && p.full.sp.h === 8 && p.full.sp.hp === -102 && p.full.sp.ap === -114, p && p.full);
  world.homeBoc = false; await sync();
  b = await board();
  p = await raw();
  check('D4 corrected back (NYK home): the stamped line is read from the other side, each team still has its own line', nykBoc(b) && /^BOC/.test(b[0]) && /^NYK/.test(b[1]), b);
  check('D5 ...and the stored line is not rewritten (still stamped BOC)', p && p.full.ho === 'BOC' && p.full.sp.h === 8, p && p.full);
  world.homeBoc = true; await sync();
  b = await board();
  check('D6 corrected once more (BOC home): same lines next to the same teams', nykBoc(b) && /^NYK/.test(b[0]) && /^BOC/.test(b[1]), b);

  console.log(fails ? fails + ' FAILURE(S)' : 'ALL PASSED');
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
