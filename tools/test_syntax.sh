#!/usr/bin/env bash
# test_syntax.sh — tools/ckpt.sh runs every tools/test_*.sh at each checkpoint, so this has to stay fast.
# A syntax error in index.html's inline script is a blank app, so check it before anything is pushed.
# (The slower Chromium end-to-end suite lives in tools/e2e/run.sh.)
set -euo pipefail
D="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
python3 - "$D/app/src/main/assets/index.html" "$TMP/app.js" <<'PY'
import re, sys
s = open(sys.argv[1], encoding='utf-8').read()
m = re.findall(r'<script>(.*?)</script>', s, re.S)
open(sys.argv[2], 'w', encoding='utf-8').write(max(m, key=len))
PY
node --check "$TMP/app.js"
