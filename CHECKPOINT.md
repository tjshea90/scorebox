# CHECKPOINT 44 — IN PROGRESS: read me first

**Written:** 2026-11-17T18:53:04Z · **tests:** not run yet (no app code changed so far)
**Branch:** `ccr-9a324f66-09lfk4` (WIP, NOT on main) · **builds on:** `ff75b04` (= main = release v3.0.42)

## The request (user, 2026-11-17)
1. **Scroll memory per tab.** Today the window is the scroller and `#games` is re-rendered in place, so scrolling down in one league tab leaves the next tab scrolled down too. Wanted: every tab starts at the TOP; if you scroll a tab, leave, and come back, it is where you left it.
2. **Overall app audit** for the user's device: **Android 10 Go, MediaTek MT8168, 2 GB RAM** (old/slow WebView possible: keep ES5 + the `.nogap` CSS fallback; 4x A53 cores ~ 5-6x slower than a desktop core).

## Do this next (ordered; tick when done and push the branch after each)
- [x] P1 DONE (tools/e2e/scroll-memory.js, 22 checks; old build fails 15 of them) -- scroll memory in index.html: `viewKey()` = `ymd(date)|(mv?'mv':league)` or `'track'`; `scrollMem` map (in memory only, cap 60); capture in `setGames` when the key changes (and BEFORE the body.tracking class flip in `setTrack`); restore with `scrollTo(0, saved||0)`; same-view re-renders keep their pixel y exactly as before. Also persist `<details>` open state across views (`detOpen` map, captured on every DOM swap, skip `.track` cards) so a revisited tab has the same heights. Test: new `tools/e2e/scroll-memory.js` (add to tools/e2e/run.sh).
- [x] P2 DONE -- cheap perf: reuse ONE `Intl.DateTimeFormat` in `timeLabel` (rebuild if `getTimezoneOffset()` changed) -- measured 21% of render time; per-render parse memo for `load()/loadOdds()` (render() wraps renderNow() with a throwaway memo; never hand shared objects to writers); run `prune()` once per sync round not per save; sort comparators must return 0 on ties; `touchmove` listener passive + no preventDefault (non-passive document touchmove blocks scroll start on a slow main thread).
- [x] P3 DONE (tools/e2e/live-render.js, 15 checks; 8 fail on old build) -- keyed per-card DOM patch in the list view (`setCards`): same view + same id sequence => replace only cards whose html changed (keeps scroll/fling, no blink, ~2ms vs ~40ms@6x); anything else => full rebuild. Live sync leanness: `syncToday(silent, lean)` should also skip a (league, day) whose games are ALL finished, or all 'pre' with no flag and first start > 30 min away.
- [ ] P4 robustness: MainActivity `onRenderProcessGone` (API 26+; recreate the WebView instead of crashing the app when Android reaps the renderer on a 2 GB device); drop unused `setDatabaseEnabled`; `store.get` must consult the in-memory fallback when a `setItem` hit quota.
- [ ] P5 guards + docs: ES5-only parse guard in tools/test_syntax.sh (`node --expose-internals` -> internal acorn, ecmaVersion 5, skip gracefully if unavailable); README + footer note; CLAUDE.md/AGENTS.md learnings; .handoff refresh.
- [ ] LAND: bash tools/test_syntax.sh && bash tools/e2e/run.sh green -> `git fetch origin main` (HEAD..origin/main must be empty) -> `git push origin HEAD:main` -> wait for "Build and release APK" run -> give the user the direct .apk link (CLAUDE.md standing rule).

## Measured baseline (tools/perf, real ESPN payloads, 6x CPU throttle, 411px)
CBB tab (55 cards) switch 110-270 ms; per-render: setGames 54%, timeLabel 21%, store.get(JSON.parse) 10%, renderTabs 7%. Odds ON: setGames 72%. Parse of card HTML only 8 ms, style+layout 32 ms; `content-visibility:auto` cuts layout 10x BUT breaks deterministic scroll restore on fresh DOM -> rejected; `contain:layout style` is WORSE (60 ms) -> rejected. Live tick ~216 ms main thread (mostly 1.2 MB CBB JSON parse). localStorage after a full sync: 36 keys / 167k chars (quota is NOT a risk). DOM ~23 elements/card, heap 11.6 MB.
Re-run: `python3 tools/perf/fetch-fixtures.py; bash tools/e2e/run.sh`-style server on :8765, then `node tools/perf/profile.js 6`, `node tools/perf/prof-cpu.js 6 [odds]`, `node tools/perf/micro.js 6`.

## Resume protocol (cold start)
1. `git fetch origin`; check out this branch (`ccr-9a324f66-09lfk4`) if it exists on origin, else main. Read this file, then `git log --oneline -8`.
2. CLAUDE.md rules: `git log --oneline HEAD..origin/main` must print nothing before editing; land on main only when validated; every landing needs the APK link for the user.
3. Do NOT run `tools/ckpt.sh` mid-task: it installs session hooks and its push.sh fast-forwards main after EVERY checkpoint (= a release build of half-done work). Checkpoint with plain `git add -A && git commit && git push origin HEAD` (session branch only) until the work is validated.

## Uncommitted right now
    (see git status)
