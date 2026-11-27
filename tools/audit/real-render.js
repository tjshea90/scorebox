/* REAL DATA, WHOLE PIPELINE: is every team's row next to ITS OWN score and ITS OWN odds?
   Real ESPN scoreboards (every league, several days) and real Pinnacle matchups / markets are served to the real app in Chromium;
   every card's two team rows are then compared with an oracle computed straight from the RAW payloads:
     scores, line scores, loser mark   from each raw competitor (matched by team abbreviation)
     ESPN's embedded line  (mode E)    by the team id ESPN attaches to each side (homeTeamOdds.team.id)
     Pinnacle              (mode P)    by exact team-name match + each participant's own alignment
   Each mode runs twice: labels as ESPN has them, and with EVERY game's home/away swapped (odds objects left alone: the
   neutral-site mismatch). Games the app does not show are accounted for (non-Division-I college games without a line, football
   games filed under another Eastern day); any other missing card is a problem.

     python3 tools/perf/fetch-fixtures.py        # real ESPN payloads  -> tools/perf/fixtures  (git-ignored)
     python3 tools/audit/fetch-pinnacle.py       # real Pinnacle lines -> tools/audit/pinnacle (git-ignored)
     node tools/audit/real-render.js             # ~5 min; exit 1 and the first problems printed if anything is off
   env: ESPN_FIXTURES, PIN_DIR, PORT (default 8766), DAYS (day offsets from today, default -3,-1,0,1,2,5),
        MODES (default E,P,Eswap,Pswap), ASSETS (a folder holding another build's index.html, to audit it instead) */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const FIX = process.env.ESPN_FIXTURES || path.join(ROOT, 'tools', 'perf', 'fixtures');
const PIN = process.env.PIN_DIR || path.join(__dirname, 'pinnacle');
const PORT = Number(process.env.PORT || 8766);
const DAYS = (process.env.DAYS || '-3,-1,0,1,2,5').split(',').map(Number);
const ASSETS = process.env.ASSETS || path.join(ROOT, 'app', 'src', 'main', 'assets');
const MODES = (process.env.MODES || 'E,P,Eswap,Pswap').split(',');
const LG = {
  mlb: { slug: 'baseball/mlb', pin: 246, ml: true }, nba: { slug: 'basketball/nba', pin: 487, ml: false }, wnba: { slug: 'basketball/wnba', pin: 578, ml: false },
  nfl: { slug: 'football/nfl', pin: 889, ml: false, football: true }, cfb: { slug: 'football/college-football', pin: 880, ml: false, football: true },
  cbb: { slug: 'basketball/mens-college-basketball', pin: 493, ml: false, d1: true }, nhl: { slug: 'hockey/nhl', pin: 1456, ml: true }
};
const KEYS = Object.keys(LG);
const MINUS = '−';
const fmtPts = v => (v === 0 ? 'PK' : (v > 0 ? '+' : MINUS) + Math.abs(v));
const fmtPrice = p => (p > 0 ? '+' + p : (p < 0 ? MINUS + Math.abs(p) : 'EVEN'));
const lineNum = v => { const m = /-?\d+(\.\d+)?/.exec(String(v == null ? '' : v)); return m ? Number(m[0]) : null; };
const priceNum = v => { if (v == null) return null; const t = String(v).replace(/\s/g, '').toUpperCase().replace('−', '-'); if (t === 'EVEN' || t === 'EV' || t === 'PK') return 100; const n = parseInt(t, 10); return isNaN(n) ? null : n; };
const closeOf = x => (x ? (x.close || x.current || x.open || null) : null);
const norm = s => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[.'’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const ymd = d => { const p = n => (n < 10 ? '0' : '') + n; return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()); };
const etDay = ms => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).replace(/-/g, '');
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const TODAY = new Date();
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

if (!fs.existsSync(FIX) || !fs.readdirSync(FIX).length) { console.log('no ESPN fixtures in ' + FIX + ' -- run: python3 tools/perf/fetch-fixtures.py'); process.exit(2); }
if (!fs.existsSync(PIN) || !fs.readdirSync(PIN).length) { console.log('no Pinnacle data in ' + PIN + ' -- run: python3 tools/audit/fetch-pinnacle.py'); process.exit(2); }
const raw = {}, pin = {};
KEYS.forEach(lk => {
  raw[lk] = {};
  fs.readdirSync(FIX).filter(f => f.indexOf(lk + '-') === 0).forEach(f => { raw[lk][f.slice(lk.length + 1, -5)] = readJson(path.join(FIX, f)); });
  pin[lk] = { mu: readJson(path.join(PIN, lk + '-matchups.json')) || [], mk: readJson(path.join(PIN, lk + '-markets_straight.json')) || [] };
});
const swapPayload = p => { p = JSON.parse(JSON.stringify(p)); (p.events || []).forEach(ev => ((ev.competitions || [])[0].competitors || []).forEach(c => { c.homeAway = c.homeAway === 'home' ? 'away' : 'home'; })); return p; };
const stripOdds = p => { p = JSON.parse(JSON.stringify(p)); (p.events || []).forEach(ev => { const c = (ev.competitions || [])[0]; if (c) delete c.odds; }); return p; };

function expectedFor(ev) {
  const comp = (ev.competitions || [])[0] || {}, cs = comp.competitors || [];
  const teams = cs.filter(c => c.homeAway === 'home' || c.homeAway === 'away').map(c => ({
    abbr: c.team.abbreviation, id: String(c.team.id), score: c.score != null ? String(c.score) : '', win: c.winner === true, conf: !!c.team.conferenceId,
    ls: (c.linescores || []).map(x => (x ? Number(x.value) : null)), names: [norm(c.team.location), norm(c.team.shortDisplayName), norm(c.team.displayName)]
  }));
  return { id: ev.id, st: ((ev.status || comp.status || {}).type || {}).state, teams, odds: (comp.odds || [])[0] || null, start: new Date(ev.date).getTime(), neutral: comp.neutralSite === true };
}
function espnLine(e, t) {                                   /* by the team id on each side */
  const o = e.odds; if (!o || !o.homeTeamOdds || !o.awayTeamOdds) return null;
  const side = String(o.homeTeamOdds.team.id) === t.id ? 'home' : (String(o.awayTeamOdds.team.id) === t.id ? 'away' : null);
  if (!side) return null;
  const sp = closeOf((o.pointSpread || {})[side]), ml = closeOf((o.moneyline || {})[side]), ov = closeOf((o.total || {}).over), un = closeOf((o.total || {}).under);
  if (!sp || lineNum(sp.line) == null) return null;
  return { sp: [lineNum(sp.line), priceNum(sp.odds)], ml: ml ? priceNum(ml.odds) : null, tot: ov && un ? { line: lineNum(ov.line), over: priceNum(ov.odds), under: priceNum(un.odds) } : null };
}
function pinLine(lk, e, t) {                                /* strict name match, then the participant's OWN alignment */
  const cands = pin[lk].mu.filter(m => m && m.type === 'matchup' && !m.parent && !m.parentId && m.participants && Math.abs(new Date(m.startTime).getTime() - e.start) <= 3.5 * 3600000);
  const hit = cands.filter(m => {
    const pn = m.participants.map(p => norm(p.name));
    return pn.length === 2 && ((e.teams[0].names.indexOf(pn[0]) >= 0 && e.teams[1].names.indexOf(pn[1]) >= 0) || (e.teams[0].names.indexOf(pn[1]) >= 0 && e.teams[1].names.indexOf(pn[0]) >= 0));
  });
  if (hit.length !== 1) return null;
  const m = hit[0], part = m.participants.filter(p => t.names.indexOf(norm(p.name)) >= 0)[0];
  if (!part) return null;
  const list = pin[lk].mk.filter(x => x && x.matchupId === m.id && x.period === 0 && !x.isAlternate && x.status === 'open' && x.prices);
  const pr = (type, who) => { const mk = list.filter(x => x.type === type)[0]; return mk ? mk.prices.filter(p => p.designation === who)[0] : null; };
  const sp = pr('spread', part.alignment), ml = pr('moneyline', part.alignment), ov = pr('total', 'over'), un = pr('total', 'under');
  if (!sp || sp.points == null) return null;
  return { sp: [Number(sp.points), Number(sp.price)], ml: ml ? Number(ml.price) : null, tot: ov && un ? { line: Number(ov.points), over: Number(ov.price), under: Number(un.price) } : null };
}

(async () => {
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', ASSETS], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1200));
  const browser = await chromium.launch();
  const modes = MODES.map(m => [m.charAt(0), /swap/.test(m)]);
  let totalProblems = 0;
  try {
    for (const [mode, swapped] of modes) {
      const ctx = await browser.newContext({ viewport: { width: 411, height: 900 } });
      const page = await ctx.newPage();
      const errs = [];
      page.on('pageerror', e => errs.push(e.message));
      await page.route('**/*', route => {
        const url = route.request().url();
        if (url.startsWith('http://localhost:' + PORT + '/')) return route.continue();
        const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
        let m;
        if (url.startsWith('https://site.api.espn.com/')) {
          m = /sports\/([^?]+)\/scoreboard\?dates=(\d{8})/.exec(url);
          const lk = m && KEYS.filter(k => LG[k].slug === m[1])[0];
          let p = lk && raw[lk][m[2]] ? raw[lk][m[2]] : { events: [] };
          if (swapped) p = swapPayload(p);
          if (mode === 'P') p = stripOdds(p);
          return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(p) });
        }
        if (url.startsWith('https://guest.api.arcadia.pinnacle.com/')) {
          m = /leagues\/(\d+)\/(matchups|markets\/straight)/.exec(url);
          const lk = m && KEYS.filter(k => LG[k].pin === Number(m[1]))[0];
          if (mode === 'E' || !lk) return route.fulfill({ status: 200, headers: cors, body: '[]' });
          return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(m[2] === 'matchups' ? pin[lk].mu : pin[lk].mk) });
        }
        return route.fulfill({ status: 404, headers: cors, body: '{}' });
      });
      const settle = ms => page.waitForTimeout(ms || 700);
      const sig = () => page.evaluate(() => { let s = '', k; for (k in localStorage) { if (/^sbx2:/.test(k) && !/prefs|okeys/.test(k)) s += k + localStorage.getItem(k).length; } return s; });
      const sync = async () => {
        await page.click('#syncBtn');
        await page.waitForFunction(() => !document.querySelector('#syncBtn').disabled, null, { timeout: 90000 });
        let last = '', same = 0;
        for (let i = 0; i < 80 && same < 4; i++) { await settle(400); const s = await sig(); same = (s === last) ? same + 1 : 0; last = s; }
      };
      await page.goto('http://localhost:' + PORT + '/index.html?v=99');
      await settle(800);
      await page.click('#oddsBtn'); await settle(300);
      const st = { cards: 0, rows: 0, scores: 0, lss: 0, odds: 0, absentOk: 0, problems: [] };
      let cur = 0;
      for (const off of DAYS) {
        while (cur < off) { await page.click('#nextDay'); cur++; await settle(150); }
        while (cur > off) { await page.click('#prevDay'); cur--; await settle(150); }
        await sync();
        const day = ymd(addDays(TODAY, off));
        const cards = {};
        const tabs = await page.evaluate(() => Array.prototype.map.call(document.querySelectorAll('#tabs button[data-lg]'), b => b.getAttribute('data-lg')));
        for (const lk of tabs) {
          if (!LG[lk]) continue;
          await page.click('#tabs button[data-lg="' + lk + '"]'); await settle(250);
          cards[lk] = await page.evaluate(() => {
            const t = e => (e ? e.textContent.replace(/\s+/g, ' ').trim() : null), out = {};
            Array.prototype.forEach.call(document.querySelectorAll('#games .card'), card => {
              const rows = Array.prototype.map.call(card.querySelectorAll('.trow'), r => {
                const odds = {};
                ['sp', 'tt', 'ml'].forEach(k => { const b = r.querySelector('.ob2.' + k); odds[k] = b ? { top: t(b.querySelector('.obt')), price: t(b.querySelector('.obp')) } : null; });
                return { abbr: t(r.querySelector('.tile')), score: t(r.querySelector('.score')), loser: r.classList.contains('loser'), odds };
              });
              out[card.getAttribute('data-id')] = { rows, ls: Array.prototype.map.call(card.querySelectorAll('table.ls tr'), tr => Array.prototype.map.call(tr.children, c => c.textContent.trim())) };
            });
            return out;
          });
        }
        for (const lk of KEYS) {
          const events = ((raw[lk][day] && raw[lk][day].events) || []).map(expectedFor);
          for (const e of events) {
            const c = (cards[lk] || {})[e.id], tag = lk + ' ' + day + ' ' + e.id + ' ' + e.teams.map(t => t.abbr).join('/') + ' ' + e.st + (e.neutral ? ' N' : '');
            if (!c) {                                         /* absent: only a deliberate filter may explain it */
              const noD1 = LG[lk].d1 && !(mode === 'E' && e.odds) && !(e.teams.length === 2 && e.teams.every(t => t.conf));
              const otherDay = LG[lk].football && etDay(e.start) !== day;
              if (noD1 || otherDay) st.absentOk++; else st.problems.push(tag + ': the game is missing from the app');
              continue;
            }
            if (c.rows.length !== 2 || e.teams.length !== 2) { st.problems.push(tag + ': ' + c.rows.length + ' rows / ' + e.teams.length + ' teams'); continue; }
            st.cards++;
            c.rows.forEach((r, ri) => {
              const t = e.teams.filter(x => x.abbr === r.abbr)[0];
              st.rows++;
              if (!t) { st.problems.push(tag + ': row ' + r.abbr + ' is not a team in this game'); return; }
              if (e.st === 'in' || e.st === 'post') {
                st.scores++;
                const want = t.score !== '' ? t.score : (e.st === 'in' ? '0' : '–');
                if (r.score !== want) st.problems.push(tag + ' ' + t.abbr + ': score ' + r.score + ' expected ' + want);
                const other = e.teams.filter(x => x !== t)[0];
                if (e.st === 'post' && r.loser !== (!t.win && t.score !== other.score)) st.problems.push(tag + ' ' + t.abbr + ': loser mark ' + r.loser);
                const lsRow = c.ls.filter(x => x[0] === t.abbr)[0];
                if (lsRow && t.ls.length) {
                  st.lss++;
                  const got = lsRow.slice(1, 1 + t.ls.length).join(','), want2 = t.ls.map(v => (v == null ? '·' : String(v))).join(',');
                  if (got !== want2) st.problems.push(tag + ' ' + t.abbr + ': line score ' + got + ' expected ' + want2);
                }
              }
              if (e.st === 'pre') {
                const line = mode === 'E' ? espnLine(e, t) : pinLine(lk, e, t);
                if (!line) return;
                st.odds++;
                const o = r.odds;
                if (!o.sp || o.sp.top !== fmtPts(line.sp[0]) || o.sp.price !== fmtPrice(line.sp[1])) st.problems.push(tag + ' ' + t.abbr + ' [' + mode + ']: spread ' + JSON.stringify(o.sp) + ' expected ' + fmtPts(line.sp[0]) + ' ' + fmtPrice(line.sp[1]));
                if (LG[lk].ml && line.ml != null && (!o.ml || o.ml.price !== fmtPrice(line.ml))) st.problems.push(tag + ' ' + t.abbr + ' [' + mode + ']: money line ' + JSON.stringify(o.ml) + ' expected ' + fmtPrice(line.ml));
                if (line.tot) {
                  const tt = ri === 0 ? ['O ' + line.tot.line, fmtPrice(line.tot.over)] : ['U ' + line.tot.line, fmtPrice(line.tot.under)];
                  if (!o.tt || o.tt.top !== tt[0] || o.tt.price !== tt[1]) st.problems.push(tag + ' ' + t.abbr + ' [' + mode + ']: total ' + JSON.stringify(o.tt) + ' expected ' + tt.join(' '));
                }
              }
            });
          }
        }
      }
      console.log('== mode ' + mode + (mode === 'E' ? ' (ESPN embedded line)' : ' (Pinnacle)') + (swapped ? ', EVERY game\'s home/away SWAPPED' : ', labels as ESPN has them'));
      console.log('   cards compared ' + st.cards + ' | team rows ' + st.rows + ' | scores ' + st.scores + ' | line scores ' + st.lss + ' | odds rows ' + st.odds + ' | absent by design ' + st.absentOk + ' | page errors ' + errs.length);
      console.log('   PROBLEMS: ' + st.problems.length);
      st.problems.slice(0, 12).forEach(p => console.log('     ' + p));
      totalProblems += st.problems.length + errs.length;
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(totalProblems ? 'TOTAL PROBLEMS ' + totalProblems : 'NO PROBLEMS: every team row had its own score, line score, loser mark and odds');
  process.exit(totalProblems ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
