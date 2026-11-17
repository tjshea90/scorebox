---
date: 2026-11-17T20:20:40.490Z
project: scorebox
session: 6faf9330
schema_version: 1
next_steps_count: 4
has_blockers: true
keywords: scorebox, scroll memory, per tab scroll, android 10 go, mt8168, performance audit, index.html, tools/perf, e2e tests, es5 guard, moves tab, odds refresh
headline: Goal: ScoreBox (Android single-WebView sports score app, vanilla ES5 index.html) remembers scroll position per tab (new 
---

# Session Handoff Snapshot
> **Generated:** 11/17/2026, 8:20:40 PM

## 🎯 High-Level Objective
* **Goal:** Goal: ScoreBox (Android single-WebView sports score app, vanilla ES5 index.html) remembers scroll position per tab (new tab starts at top; leaving and returning restores) + full audit for owner's Android 10 Go MT8168 2 GB phone. Core intent: fast, crash-free on weak hardware; keep network rules (no net on open; Sync/pull-down/live only) intact.

## 📌 Current State & Next Steps
* **Status:** Done + validated: scroll memory; perf fixes; robustness (renderer-gone, quota); ES5 guard; 3 new e2e scripts; README + CLAUDE.md + CHECKPOINT 51; review fixes. Remaining: push HEAD:main (CLAUDE.md standing rule: landing on main is what builds the release), wait CI Build and release APK, give user direct .apk link; then user feedback from real phone (nothing verified on device, only Chromium + CPU throttle).
* **Blocker:** None. Not verified on a real device (only Chromium with 6x CPU throttle + javac type-check); real Gradle build happens in CI after landing on main.
* **Next Action:** Verify landing: git fetch origin main; git log origin/main -3 must show session's final commit; else git log HEAD..origin/main must be empty, then git push origin HEAD:main

### Remaining Queue
- [ ] After push: poll workflow Build and release APK (build-release.yml, branch main) every 30-60 s until completed; get_latest_release / get_release_by_tag v3.0.<run_number>; send user direct .apk browser_download_url; if run fails say so plainly + failing step (CLAUDE.md standing rule)
- [ ] Collect user feedback from phone: scroll restore on tab return; any league stale under Live sync (lean polling skips all-final / far-off slates, re-check every 2 h); blank screen after long background (WebView rebuild path; logcat tag ScoreBoxRelay 'WebView renderer gone')
- [ ] Only if user asks: skip re-fetch of finished yesterday (product rule today: every Sync re-verifies yesterday+today); stop live-dot pulse animation (battery); lazy line-score tables for closed cards (fewer DOM nodes on 140-game CBB days)

## 🛠️ Modified Files Delta
* app/src/main/assets/index.html: scroll memory (viewKey/stashScroll/setGames/detOpen); patchCards + [{id,h}] list render; per-render memo (memoGet/loadFresh/loadOddsFresh); shared Intl formatter (timeLabel/zoneSig); needsLive + lean syncToday; renderTabs lastTabs skip; store mem fallback + evict; prune 60 s throttle; esc w/o alloc; passive touchmove; tie-safe sorts; footer note
* app/src/main/java/com/scorebox/app/MainActivity.java: makeWebView() split out of onCreate; onRenderProcessGone rebuild + 10 s loop guard; removed setDatabaseEnabled
* tools/e2e/scroll-memory.js (new, 22 checks), live-render.js (new, 15), storage-quota.js (new, 7); tools/e2e/run.sh registers 6 scripts
* tools/test_syntax.sh + tools/es5-check.js (new): ES5-only parse guard
* tools/perf/{fetch-fixtures.py,profile.js,prof-cpu.js,micro.js,tabs.js} (new): real ESPN payload profiling under CPU throttle; fixtures gitignored (.gitignore)
* README.md: sections Scroll position per tab, Low-end phones; Live sync bullet; project layout; CLAUDE.md: Low-end device rules; CHECKPOINT.md: rewritten as checkpoint 51

## 🚫 Failed Approaches (DO NOT RETRY)
* Approach: content-visibility:auto on .card → Result: style+layout 32 to 3 ms (6x, 55 cards) but intrinsic-size guesses break pixel scroll restore on freshly built DOM; only WebView>=85 → Lesson: rejected; do not retry for scroll-restoring lists
* Approach: contain: layout style on .card → Result: layout 32 to 60 ms, slower → Lesson: do not add containment here
* Approach: compare builds with single-shot in-page timings → Result: noisy, contradicted CPU profile (JIT warm-up) → Lesson: use tools/perf/tabs.js (median of N after warm-up) and prof-cpu.js for breakdown
* Approach: Playwright context with timezoneId + later CDP Emulation.setTimezoneOverride → Result: 'Timezone override is already in effect' → Lesson: leave machine zone on the context that gets a mid-session override
* Approach: locale/zone tests with mock slate keyed to Node's UTC 'today' → Result: empty slate in Tokyo/Kolkata (app local date differs) → Lesson: serve same slate for any requested date in zone tests
* Approach: applyBooks putPart recording previous line on every write (prior session) → Result: false moves when two sources write the same book in one sync → Lesson: compare whole refresh rounds (snapshot/markMoves), covered by tools/e2e/moves-sources.js
* Approach: first gear enlargement to 48px (prior session) → Result: header overflowed at 360/320px → Lesson: test header at 320/360/411px (media queries now)
* Approach: tools/ckpt.sh + tools/push.sh for mid-task saves → Result: every checkpoint fast-forwards main = release per checkpoint, hooks installed → Lesson: plain git commit+push to session branch until validated
* Approach: foreground 'sleep N' in Bash → Result: blocked by harness → Lesson: run_in_background / Monitor for waits

## 🔑 Crucial Context & Implicit Rules
* Stack: vanilla ES5 single-file app (app/src/main/assets/index.html) in Android WebView; data from ESPN scoreboard + Pinnacle site API (free), PropLine / The Odds API (user keys), all relayed by MainActivity
* Owner device: Android 10 Go, MediaTek MT8168 (4x A53), 2 GB RAM, possibly old frozen System WebView; targetSdk 29 minSdk 21; page must stay ES5 (tools/test_syntax.sh fails on =>, let/const, template strings, ?., ..., async); new flex-gap rows need .nogap margin fallback
* localStorage ~5 MB; prefix sbx2:; schedules sbx2:<league>:<yyyymmdd>; odds sbx2:o-<league>:<yyyymmdd>; API keys sbx2:okeys; prefs sbx2:prefs
* Repo rules (CLAUDE.md): main = single source of truth; git fetch origin main and git log HEAD..origin/main must be empty before work; git push origin HEAD:main (explicitly authorised by CLAUDE.md) triggers Build and release APK; tag v<versionName>.<run_number>; after EVERY app change wait for the run and give user the direct .apk link unprompted
* Validate before landing: bash tools/test_syntax.sh && bash tools/e2e/run.sh (6 scripts, 111 PASS lines; assets served on :8765; Playwright preinstalled; page.clock for fake timers). Perf: python3 tools/perf/fetch-fixtures.py then node tools/perf/tabs.js 6 [odds]; 6x CPU throttle approximates the phone
* Java check without Gradle (AGP 8.1.4 / SDK 34 not available offline): stub BuildConfig + javac -source 8 against /opt/android-sdk/platforms/android-36/android.jar
* Mid-task checkpoints: plain git add/commit/push origin HEAD (session branch ccr-9a324f66-09lfk4); tools/ckpt.sh and tools/push.sh fast-forward main each time (release per checkpoint) and install session hooks; CHECKPOINT.md is the cold-resume file
* User prefs: frequent GitHub checkpoints + handoff protocol so usage cutoffs lose nothing; longer sessions and more usage fine if product better; their other apps target Android 16

## Key Decisions
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

## 🙋 User Contribution (human-authored)
Specified the exact scroll behavior wanted (every sport tab defaults to top of list; scroll kept only after scrolling down, switching tabs, coming back) and named the audit target hardware (Android 10 Go, MT8168, 2 GB RAM).

## 🙋 User Decisions (made by the human)
- **Every sport tab defaults to the top of its list; a scrolled position is kept only when the user leaves a tab and comes back to it**
  - Reason: Second sport tab inherited the first tab's scrolled-down position
  - Rejected: not stated
- **Audit target = Android 10 Go, MediaTek MT8168, 2 GB RAM**
  - Reason: The phone the app actually runs on
  - Rejected: not stated

## Summary
Session 2026-11-17. User asked (1) per-tab scroll memory, default top, keep position on return; (2) overall audit for Android 10 Go MT8168 2 GB. Done: per-view scroll memory + persisted open line-score panels; real-data profiling harness tools/perf (real ESPN payloads, 6x CPU throttle) drove fixes: shared Intl formatter, per-render parse memo, changed-card-only DOM patch, lean Live sync, passive touchmove, prune throttle, tie-safe sorts, esc alloc. Robustness: MainActivity onRenderProcessGone + loop guard; localStorage quota eviction, no silent data loss. ES5 parse guard in test_syntax.sh. Measured: 55-card CBB tab switch median 75 to 56 ms (184 to 136 ms odds on). Tests: 6 e2e scripts / 111 checks green (new: scroll-memory, live-render, storage-quota; old build fails 15/22, 8/15, 2/7). MainActivity javac-checked vs android-36. Independent code-review (medium): 8 findings; 5 acted on, 3 answered with evidence. Not run on a real device. Last step: land on main + APK link to user.

---
*A short hint surfaces on session start; full context loads only if your next prompt matches a keyword above, or via manual `/handoff-resume`. The same record is available as a sibling `.json` file for external tools.*