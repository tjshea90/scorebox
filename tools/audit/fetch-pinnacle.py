#!/usr/bin/env python3
"""Download Pinnacle's public site-API matchups + straight markets for every league the app uses, into tools/audit/pinnacle/
(git-ignored; override with PIN_DIR), for tools/audit/real-render.js. Same endpoints and headers as MainActivity's relay: the
league ids come from LEAGUES in index.html and the public key from MainActivity.java, so nothing is duplicated here.
    python3 tools/audit/fetch-pinnacle.py"""
import os, re, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.environ.get('PIN_DIR') or os.path.join(HERE, 'pinnacle')
HTML = open(os.path.join(ROOT, 'app', 'src', 'main', 'assets', 'index.html'), encoding='utf-8').read()
JAVA = open(os.path.join(ROOT, 'app', 'src', 'main', 'java', 'com', 'scorebox', 'app', 'MainActivity.java'), encoding='utf-8').read()
HOST = re.search(r'https://guest\.api\.arcadia\.pinnacle\.com/0\.1/', HTML).group(0)
KEY = re.search(r'ODDS_KEY\s*=\s*"([^"]+)"', JAVA).group(1)
LEAGUES = re.findall(r"key: '(\w+)',[^}]*?pin: (\d+)", HTML)       # [(key, pinnacle league id)]
if not LEAGUES:
    sys.exit('could not read the league table from index.html')
os.makedirs(OUT, exist_ok=True)
bad = []
for key, pid in LEAGUES:
    for kind in ('matchups', 'markets/straight'):
        req = urllib.request.Request(HOST + 'leagues/' + pid + '/' + kind, headers={
            'x-api-key': KEY, 'Referer': 'https://www.pinnacle.com/', 'Origin': 'https://www.pinnacle.com', 'User-Agent': 'Mozilla/5.0'})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                body = r.read()
            open(os.path.join(OUT, key + '-' + kind.replace('/', '_') + '.json'), 'wb').write(body)
            print('%-5s %-17s %8d bytes' % (key, kind, len(body)))
        except Exception as e:                       # one league failing must not stop the others
            bad.append((key, kind, str(e)[:60]))
print('saved to %s; failures: %s' % (OUT, bad or 'none'))
