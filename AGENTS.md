# AGENTS.md

<!-- handoff:learnings:begin -->
## Session Learnings (auto-updated by handoff)

### Implicit Rules
- Stack: vanilla ES5 single-file app (app/src/main/assets/index.html) in Android WebView; data from ESPN scoreboard + Pinnacle site API (free), PropLine / The Odds API (user keys), all relayed by MainActivity
- Owner device: Android 10 Go, MediaTek MT8168 (4x A53), 2 GB RAM, possibly old frozen System WebView; targetSdk 29 minSdk 21; page must stay ES5 (tools/test_syntax.sh fails on =>, let/const, template strings, ?., ..., async); new flex-gap rows need .nogap margin fallback
- localStorage ~5 MB; prefix sbx2:; schedules sbx2:<league>:<yyyymmdd>; odds sbx2:o-<league>:<yyyymmdd>; API keys sbx2:okeys; prefs sbx2:prefs
- Repo rules (CLAUDE.md): main = single source of truth; git fetch origin main and git log HEAD..origin/main must be empty before work; git push origin HEAD:main (explicitly authorised by CLAUDE.md) triggers Build and release APK; tag v<versionName>.<run_number>; after EVERY app change wait for the run and give user the direct .apk link unprompted
- Validate before landing: bash tools/test_syntax.sh && bash tools/e2e/run.sh (6 scripts, 111 PASS lines; assets served on :8765; Playwright preinstalled; page.clock for fake timers). Perf: python3 tools/perf/fetch-fixtures.py then node tools/perf/tabs.js 6 [odds]; 6x CPU throttle approximates the phone
- Java check without Gradle (AGP 8.1.4 / SDK 34 not available offline): stub BuildConfig + javac -source 8 against /opt/android-sdk/platforms/android-36/android.jar
- Mid-task checkpoints: plain git add/commit/push origin HEAD (session branch ccr-9a324f66-09lfk4); tools/ckpt.sh and tools/push.sh fast-forward main each time (release per checkpoint) and install session hooks; CHECKPOINT.md is the cold-resume file
- User prefs: frequent GitHub checkpoints + handoff protocol so usage cutoffs lose nothing; longer sessions and more usage fine if product better; their other apps target Android 16

### Key Decisions
- Decision: scroll memory keyed per VIEW = day + league tab, or day + Moves, or 'track'; in memory only, cap 60; new view starts at top, return restores — Reason: sticky-header window scroll was inherited across tabs (user bug); fresh launch at top is the stated default
- Decision: stashScroll() before DOM swap in setGames and at top of setTrack — Reason: setTrack flips body.tracking (hides date bar + tabs) before render; reading offset after can be shifted by scroll anchoring
- Decision: open line-score panels (detOpen by game id, cap 3000) persisted across views — Reason: pixel scroll offset only lands on same card if panels above have same height
- Decision: rejected content-visibility:auto and contain:layout style — Reason: measured on real data: cv cuts layout 32 to 3 ms but estimated heights break scroll restore on fresh DOM (and WebView>=85 only); contain made layout 2x slower
- Decision: list drawn as [{id,h}] per card; same-view redraw swaps only changed cards (patchCards), anything else full innerHTML — Reason: live tick rebuilt 55 cards (~40 ms at 6x), blinked, interrupted flings; skips scrollTo so browser scroll anchoring keeps content steady
- Decision: parse memo only inside render() (render wraps renderNow); writers use loadFresh/loadOddsFresh — Reason: render parsed each saved day 3-4x; markMoves/oddsSync snapshot need distinct before/after objects, shared mutable objects would silently kill Moves
- Decision: timeLabel reuses one Intl.DateTimeFormat, zone signature (now + Jan + Jul offsets) checked once per render pass — Reason: toLocaleTimeString(options) builds an ICU formatter per call = 21% of render at 6x; Jan/Jul catch zones with same offset but different DST
- Decision: lean Live (syncToday lean): skip league/day whose games are all finished/postponed or none due within 30 min, but re-check a quiet day every 2 h (needsLive); first sync after Live on never lean; Sync always full — Reason: 1.2 MB CBB JSON re-parsed every 10 s on slow CPU; start times can move/postpone after save
- Decision: pull-to-refresh touchmove passive, no preventDefault — Reason: non-passive document touchmove makes Chrome wait for main thread before every scroll starts; at scrollTop 0 downward drag has nothing to scroll; !atTop() + finish() guards cover reversed drags
- Decision: MainActivity.onRenderProcessGone rebuilds WebView via makeWebView; second loss within 10 s calls finish() — Reason: targetSdk>=26 unhandled renderer loss kills whole app; 2 GB Go device reclaims renderer in background; crash-on-load must not loop
- Decision: store.get consults mem copy first; setItem quota failure evicts oldest past day (odds before schedule; never yesterday, today, future, viewed day) and retries up to 40x — Reason: old code wrote failed saves to mem that get() never read = silent data loss; yesterday still live after midnight
- Decision: page stays ES5, enforced by tools/es5-check.js (node --expose-internals bundled acorn, ecmaVersion 5) inside tools/test_syntax.sh, skips if Node lacks it — Reason: old frozen Android WebView refuses whole script on one new token = blank app
- Decision: mid-task checkpoints = plain git commit + push to session branch; land on main once when green — Reason: tools/push.sh fast-forwards main after EVERY tools/ckpt.sh checkpoint = release build of half-done work; ckpt.sh also installs session hooks
- Decision: state.oRef (pref key orf, default on) separate from state.odds — Reason: hide odds vs stop refreshing independently
- Decision: oddsSync() returns early unless both odds and oRef on — Reason: single choke point for all odds API calls
- Decision: odds download only via runSync(pairs, silent, withOdds=true), passed only by syncAll() (Sync button + pull-down) — Reason: launch, day nav, toggles, source switches, key saves, timers, visibility, online, Live sync, Track live never call odds APIs; Live sync does not refresh odds; turning Odds on does not fetch by itself
- Decision: odds refresh off keeps saved odds on screen, cache untouched (incl. ESPN-embedded line folding), stale label suppressed; Moves tab still reads saved data — Reason: zero odds calls with cached data usable
- Decision: odds days = today + viewed day only (oddsDays) — Reason: other days download only when selected
- Decision: Moves tab = last tab, only with Odds on, reads cache only, shows viewed day — Reason: no network from a view tab
- Decision: round-based comparison: oddsSync snapshots saved odds for [today, viewed day] before a round, markMoves diffs after; changed part keeps previous version as book.pv[part] (previous line + time); unchanged later round leaves it — Reason: repeated no-change syncs must not wipe a move
- Decision: Moves ranking: spread/total points as-is; money line 10 cents = 1 point; price-only 20 cents = 1 point; games sorted by biggest move; shown book follows Books picker else Pinnacle-first — Reason: same book the cards show
- Decision: gear 48x44 touch target, 28px glyph; media queries <=400px and <=340px tighten header — Reason: fit 360/320px phones
- Decision: tools/e2e (Chromium, mocked services) + tools/test_syntax.sh are the regression guards; ckpt.sh runs every tools/test_*.sh (must stay fast) — Reason: guard network rules and blank-app syntax errors

<!-- handoff:learnings:end -->
