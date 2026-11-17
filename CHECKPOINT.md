# CHECKPOINT 51 — DONE & VALIDATED, being landed on main: read me first

**Tests:** `bash tools/test_syntax.sh` (syntax + ES5-only guard) green · `bash tools/e2e/run.sh` 6 scripts / 111 checks green · `MainActivity.java` type-checked with `javac` against android-36 `android.jar` (a real Gradle build runs in CI after landing).
**Branch:** `ccr-9a324f66-09lfk4` (session branch; main is the source of truth — see CLAUDE.md) · **builds on:** `ff75b04` (= release v3.0.42).

## The request (user, 2026-11-17) and what shipped
1. **Scroll position remembered per tab, default top.** Every view (day + league tab, the Moves tab, the tracked game) starts at the top the first time and, when you scroll, leave and come back, is exactly where you left it (open line-score panels are remembered too, so heights match). Same-view re-renders (sync, live tick, toggle) never move you. It also fixed day navigation and *Track live → ‹ All games*, which used to lose your place. In memory only (a fresh launch opens at the top). `viewKey` / `stashScroll` / `setGames` in index.html; test `tools/e2e/scroll-memory.js` (22 checks; the old build fails 15).
2. **Audit for Android 10 Go / MT8168 / 2 GB** (measured on real ESPN payloads at 6x CPU throttle, `tools/perf/`): tab switch (55-card CBB) median 75 → 56 ms (184 → 136 ms with odds on). Fixed: `toLocaleTimeString` per card (a fifth of render time), repeated `JSON.parse` of saved days, whole-list rebuild on every live tick (now only changed cards are swapped), tab strip rebuilt every render, `prune()` after every save, non-passive `touchmove` (delays every scroll start), sort comparators without ties, `esc()` allocations; Live sync no longer re-downloads leagues whose games are all finished / hours away (re-checked every 2 h); `MainActivity.onRenderProcessGone` (Android reclaiming the renderer used to kill the whole app; a 2nd loss within 10 s exits cleanly); a full localStorage evicts the oldest past day instead of silently losing the sync (tests: `live-render.js`, `storage-quota.js`). Details + what was rejected after measuring: README "Low-end phones", CLAUDE.md "Low-end device rules".
3. Guard rails added: ES5-only parse check in `tools/test_syntax.sh` (`tools/es5-check.js`), e2e scripts `scroll-memory` / `live-render` / `storage-quota`, profiling harness `tools/perf/`.

## Do this next
- **Confirm it landed**: `git fetch origin main && git log origin/main --oneline | head -3` should show this session's final commit. If not: `git log --oneline HEAD..origin/main` must print nothing, then `git push origin HEAD:main`. Then (CLAUDE.md standing rule) wait for the "Build and release APK" run, take the `.apk` from the release (`get_latest_release`, tag `v3.0.<run number>`) and give the user the direct link.
- **Wait for the user's feedback from the real phone** (nothing here was run on the device — only Chromium with throttling). Worth asking: does returning to a tab land where they left it; does Live sync ever leave a league stale (it now skips all-finished / far-off slates; a Sync always refreshes everything); any blank screen after the app sat in the background (that path now rebuilds the WebView; logcat tag `ScoreBoxRelay`, "WebView renderer gone").
- Ideas NOT done, need the user's say: re-fetch *yesterday* only if it could still change (product rule today: every Sync re-verifies yesterday + today); stop the live-dot `pulse` animation (design choice; keeps the compositor busy); build the line-score tables lazily for closed cards (fewer DOM nodes on 140-game CBB days).

## Resume protocol (cold start)
1. `git fetch origin`; use `origin/main` (or this branch if main lacks it). Read this file, then `git log --oneline -8`.
2. CLAUDE.md rules: `git log --oneline HEAD..origin/main` must be empty before editing; land on main only when `test_syntax.sh` + `e2e/run.sh` are green; every landing needs the APK link for the user.
3. Mid-task checkpoints: plain `git add -A && git commit && git push origin HEAD` — NOT `tools/ckpt.sh` (its push.sh also fast-forwards main after every checkpoint = a release build of half-done work, and it installs session hooks).

## Uncommitted right now
    (nothing once this checkpoint is committed)
