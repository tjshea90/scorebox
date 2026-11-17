#!/usr/bin/env python3
"""Download REAL ESPN scoreboard payloads (same URLs/params the app uses) into tools/perf/fixtures/
(git-ignored, ~15 MB) so tools/perf/*.js can replay them through the app under CPU throttling.
Window = today-3 .. today+8, so Sync's yesterday..+2 + football week are all covered.
    python3 tools/perf/fetch-fixtures.py"""
import json, os, sys, datetime, urllib.request, concurrent.futures as cf
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get('ESPN_FIXTURES') or os.path.join(HERE, 'fixtures')
os.makedirs(OUT, exist_ok=True)
API = 'https://site.api.espn.com/apis/site/v2/sports/'
# (key, path, query) exactly as the app's LEAGUES table
L = [('mlb', 'baseball/mlb', ''), ('nba', 'basketball/nba', ''), ('wnba', 'basketball/wnba', ''),
     ('nfl', 'football/nfl', '&limit=200'), ('cfb', 'football/college-football', '&groups=80&limit=200'),
     ('cbb', 'basketball/mens-college-basketball', '&groups=50&limit=400'), ('nhl', 'hockey/nhl', '')]
today = datetime.date.today()
dates = [(today + datetime.timedelta(days=i)).strftime('%Y%m%d') for i in range(-3, 9)]
def get(job):
    k, p, q, d = job
    out = os.path.join(OUT, '%s-%s.json' % (k, d))
    if os.path.exists(out): return (k, d, os.path.getsize(out), 'cached')
    try:
        req = urllib.request.Request('%s%s/scoreboard?dates=%s%s' % (API, p, d, q), headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=30) as r: b = r.read()
        open(out, 'wb').write(b)
        return (k, d, len(b), 'ok')
    except Exception as e:
        return (k, d, 0, str(e)[:60])
jobs = [(k, p, q, d) for (k, p, q) in L for d in dates]
with cf.ThreadPoolExecutor(6) as ex: res = list(ex.map(get, jobs))
bad = [r for r in res if r[3] not in ('ok', 'cached')]
print('%d files, %.1f MB in %s; failures: %s' % (len(res), sum(r[2] for r in res) / 1e6, OUT, bad or 'none'))
