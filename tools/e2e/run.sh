#!/usr/bin/env bash
# Chromium end-to-end checks for app/src/main/assets/index.html with ESPN + the odds services MOCKED
# (nothing real is contacted). Needs node + the pre-installed Playwright (`require('playwright')`).
#
#   bash tools/e2e/run.sh            # all three
#   E2E_OUT=/some/dir bash ...       # where screenshots go (default: the OS temp dir)
#
# network-rules   opening the app / changing days / toggles / reload use NO network; Sync + pull-down fetch
#                 schedules (yesterday..+2, all 7 leagues) and, only with Odds + Odds refresh on, the odds;
#                 Odds refresh off or Odds off => zero odds calls; Live sync never touches odds; time changes,
#                 postponements and "Rescheduled" are picked up; Moves tab ordering; header fits 360 / 320px.
# moves-variants  money line, price-only, halftime / F5, favourite flip.
# moves-sources   two sources writing one book (ESPN's DraftKings + PropLine) must not look like a move.
set -uo pipefail
D="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PORT=8765
(cd "$D/app/src/main/assets" && exec python3 -m http.server "$PORT" >/dev/null 2>&1) &
SRV=$!
trap 'kill $SRV 2>/dev/null || true' EXIT
sleep 1
rc=0
for t in network-rules moves-variants moves-sources; do
  echo "=== $t"
  node "$D/tools/e2e/$t.js" || rc=1
done
exit $rc
