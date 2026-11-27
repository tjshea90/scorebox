# ScoreBox

Single-WebView Android app. The real UI and all logic live in
`app/src/main/assets/index.html` (vanilla HTML/CSS/JS, no build step, no
framework). `MainActivity.java` is just a thin shell: it serves that file
from a local virtual origin and relays `GET`s to `site.api.espn.com`
natively so the page can call ESPN's public scoreboard feed without hitting
CORS. See `README.md` for the full project layout.

## One app branch: `main`

`main` is the single source of truth for the app, and every release is
built from it, so each release contains everything in the previous one.
Earlier releases were built from side branches that had each forked off a
different point, so one release's changes kept going missing from the next
(v3.0.17 lost v3.0.16's sticky tabs). Don't repeat that:

1. Before changing anything, bring your working branch up to date with
   `origin/main` (`git fetch origin main && git merge origin/main`). Your
   session branch may have been cut from a stale commit — check with
   `git log --oneline HEAD..origin/main`; it must print nothing before you
   start.
2. When the change is done and validated, land it on `main` (fast-forward
   when possible: `git push origin HEAD:main`). That push is what builds
   the release.
3. Never publish a release from any other branch. The workflow only runs
   for `main` and `v*` tags, so a manual run on another branch is skipped.

## Low-end device rules (the owner's phone: Android 10 Go, MediaTek MT8168, 2 GB RAM)

- **The page stays ES5.** An old System WebView refuses the whole script on one newer token (blank app).
  `bash tools/test_syntax.sh` fails on `=>`, `let/const`, template strings, `?.`, `...`, `async`
  (tools/es5-check.js, Node's bundled acorn). CSS: no flex `gap` without a `.nogap` fallback line.
- **Measure before optimising**: `python3 tools/perf/fetch-fixtures.py` once, then `node tools/perf/tabs.js 6 [odds]`
  (median tab switch), `prof-cpu.js`, `profile.js` — real ESPN payloads, 6x CPU throttle ≈ that phone.
  Rejected after measuring: `content-visibility` (breaks scroll restore on fresh DOM), `contain: layout style` (slower).
- **Scroll memory**: every view (day + league tab / Moves / tracked game) remembers its scroll; new views start at the
  top (`viewKey` / `stashScroll` / `setGames`). Same-view re-renders keep their place. `setTrack` stashes first.
- **Rendering**: the list is drawn as `[{id, h}]` per card and only changed cards are swapped (`patchCards`).
  `render()` memoises saved-day parses for ONE pass; anything that writes uses `loadFresh` / `loadOddsFresh`.
- Tests that must pass before landing: `bash tools/test_syntax.sh && bash tools/e2e/run.sh` (11 scripts, ~225 checks).
- **Mid-task checkpoints**: `tools/ckpt.sh` / `tools/push.sh` also fast-forward `main` after EVERY checkpoint, i.e. a release
  build of half-finished work (and ckpt.sh installs session hooks). While a change is not validated, checkpoint with
  plain `git add -A && git commit && git push origin HEAD` (session branch only) and land on `main` once, when green.

## Standing instruction: build and deliver an APK after every update

This holds for every session, not just the one that added it.

`.github/workflows/build-release.yml` ("Build and release APK") builds a
**signed release APK** (same persistent key every time, so installing over
an existing ScoreBox install updates it in place) and publishes it as a
GitHub Release with the `.apk` attached. It triggers automatically on push
to `main` (also on a `v*` tag, or a manual `workflow_dispatch` run on
`main`) — so landing a change on `main` is enough to kick off a build; no
manual dispatch needed.

Whenever you finish a change to this app (anything under `app/`, or to the
Gradle/CI config itself) and push it, before ending your turn:

1. Note the commit SHA and branch you just pushed.
2. Find the workflow run it triggered: `actions_list` with
   `method: list_workflow_runs`, `resource_id: build-release.yml`, filtered
   to `main` (match by `head_sha` if more than one run shows up). It
   can take a few seconds to appear after the push.
3. Wait for that run to reach `completed` status — poll `actions_get`
   (`method: get_workflow_run`) every 30-60s; a full build (it provisions
   the Android SDK from scratch every run) typically takes a few minutes.
   Don't busy-poll faster than that.
4. On success (`conclusion: success`), get the release it published. The
   tag is `v<versionName>.<run_number>` (e.g. `v3.0.15`) for an ordinary
   push — `versionName` comes from `app/build.gradle.kts` and
   `run_number` is this workflow's own run count, so it only ever
   increases — or whatever tag was used for a deliberate `v*` tag push /
   manual dispatch with an explicit tag. Look it up with
   `get_release_by_tag` (or `list_releases`/`get_latest_release` if unsure
   of the exact tag) and take the `.apk` asset's `browser_download_url`.
5. Message the user with that direct download link so they can sideload
   it. If the run fails or the release/asset isn't found, say so plainly
   and point at the failing job/step — don't go silent or claim success.

Do this automatically, without being asked, for every app update — it's a
standing requirement, not a one-off for whichever change happened to add
this file.

Before pushing more CI changes: check `origin/main` for newer commits
first. This file was written after discovering a feature branch had drifted
10 commits behind `main` and briefly reintroduced an inferior, already-
superseded version of this same workflow — rebase onto `origin/main` rather
than assuming a long-lived local branch is current.

<!-- handoff:learnings:begin -->
## Session Learnings (auto-updated by handoff)

### Implicit Rules
- Stack: vanilla ES5 single-file app (app/src/main/assets/index.html) in Android WebView; data from ESPN scoreboard + Pinnacle site API (free), PropLine / The Odds API (user keys), all relayed by MainActivity
- Owner device: Android 10 Go, MediaTek MT8168 (4x A53), 2 GB RAM, possibly old frozen System WebView; targetSdk 29 minSdk 21; page must stay ES5 (tools/test_syntax.sh fails on =>, let/const, template strings, ?., ..., async); new flex-gap rows need .nogap margin fallback
- localStorage ~5 MB; prefix sbx2:; schedules sbx2:<league>:<yyyymmdd>; odds sbx2:o-<league>:<yyyymmdd>; API keys sbx2:okeys; prefs sbx2:prefs
- Repo rules (CLAUDE.md): main = single source of truth; git fetch origin main and git log HEAD..origin/main must be empty before work; git push origin HEAD:main (explicitly authorised by CLAUDE.md) triggers Build and release APK; tag v<versionName>.<run_number>; after EVERY app change wait for the run and give user the direct .apk link unprompted
- Validate before landing: bash tools/test_syntax.sh && bash tools/e2e/run.sh (11 scripts, 225 PASS lines; assets served on :8765; Playwright preinstalled; page.clock for fake timers). Perf: python3 tools/perf/fetch-fixtures.py then node tools/perf/tabs.js 6 [odds]; 6x CPU throttle approximates the phone
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
- Decision: fetchJSON reads the body as text and parses it itself; an empty / cut-off / unparseable 200 body is retried ONCE after 700 ms, a second bad body reports "the server sent an empty|unreadable answer (tried twice)"; HTTP errors, timeouts and offline failures are never retried — Reason: the native relay streams the upstream body straight through, so a dropped connection reaches the page as a short "200 OK" and r.json() showed the opaque "Unexpected end of JSON input" banner (NHL, build 44); relay NOT changed to buffer bodies (would put a 1.2 MB CBB download under the page's 20 s timeout; untestable off-device); guard: tools/e2e/bad-body.js
- Decision: saved odds follow the TEAM, not the label: `save()` → `mergeGames(prev, games, swapped)` detects a game whose home/away abbrs swapped between two ESPN saves and `mirrorOdds` turns that day's saved lines around (every book's full/seg + `pv.p`, via `flipPart`), also the carried-over `g.eo`; `partMoves` shows a mirror-image `pv.p` (same size other side ±1 pt, prices carried over; or ML ≥ 80¢ apart yet ≤ 20¢ from mirrored) as the drift it really was — Reason: user screenshot build 45 (KENT @ WYO, neutral site) listed `KENT −8 → WYO −8 · 16 pts` with prices attached to the wrong teams: stored odds are "home team's points" with no record of who was home, ESPN re-labelled home/away between two syncs, so the card named the wrong favourite and the next refresh wrote a fake move (reproduced: tools/e2e/moves-orient.js A/B/C)
- Decision: `parseEspnOdds(list, homeAbbr, awayAbbr)` orients ESPN's embedded DraftKings line by its `details` text ("HPU -10.5" names the favourite): if it contradicts `pointSpread.home` (opposite sign, sizes within 2) the whole part is mirrored with `flipPart`; EVEN/PK/unmatched text changes nothing — Reason: measured 2026-11-24 over 177 real ESPN games: only 2 conflicts, both neutral-site (DUQ@HPU: details HPU −10.5 vs pointSpread.home +10.5 vs home ML +410); Pinnacle agreed with `details`; guard: moves-orient.js D
- Rejected (then DONE in ckpt 55 -- see the `ho` decision at the end): matching saved odds to teams with an `ho` anchor on every entry, and a cross-book favourite check in `applyBooks` — Reason: a swap is only ever observed at schedule save (one choke point, `prev` available); extra read-site changes on the hot render path for a case `mirrorOdds` + `isMirror` already cover. Revisit if a flipped line is seen that NO ESPN label change explains
- Decision: a game ESPN flags `neutralSite` KEEPS the home/away order its schedule had: `parseScoreboard` stores `ns:1`; `mergeGames` turns a neutral game whose abbrs came back swapped back with `flipSides(g)` (teams carry scores/line scores/winner; `ht`/`f5` a<->h via `flipCut`; `fb.possess`; `eo.full` via `flipPart`), so it is never "swapped" and is NOT queued for `mirrorOdds` (saved lines still match); a NOT-neutral swap is a genuine correction -> ESPN followed + `mirrorOdds` as before, and a carried-over halftime snapshot is flipped with it; the flag is read from the NEW payload at the time of the re-label (appears with it -> keep, disappears with it -> follow) — Reason: user report 2026-11-27: on CBB a team on the bottom row (home) in the schedule jumps to the top (away) when scores come in; a neutral court has no home team and ESPN re-labels at game time; scoreboard, event summary, boxscore and team schedule all return only the CURRENT labels (8 finished neutral games checked), so only the saved game remembers the original; guard: tools/e2e/neutral-keep.js; real data (12 days of CBB, every game's labels swapped): 202/202 neutral kept, 348/348 home-site followed
- Rejected: using a sportsbook's home/away (Pinnacle `alignment`, the keying of ESPN's embedded DraftKings line) to recover the original order for a game first seen AFTER the re-label — Reason: Pinnacle disagrees with ESPN's PRE-game labels on 4 of 19 neutral games (0 of 18 home-site), so it would "correct" good labels; in 12 days of payloads only pre-game events carried an embedded line. That case stays unrecoverable by design: tell the user
- Decision: every saved odds PART carries `ho` = the abbr of the team its "home" numbers belong to (`stampHome` in `applyBooks`, also for the folded ESPN line); readers turn a part whose `ho` is the card's AWAY team (`orientEntry` -> `partFor` = `flipPart` + new stamp) in `oddsParts` and `movesForDay`: the stored part is never mutated and nothing is copied when no part needs turning; `markMoves` compares two versions from the same side (`sameSideAs`) so a re-label is never recorded as a move; parts WITHOUT `ho` (saved by builds <= 47) are read as they are, `mirrorOdds` still turns + stamps only UNSTAMPED parts on an observed non-neutral swap, and `partMoves` guesses a mirrored save (`isMirror`) only when a line has no stamp (on stamped lines a real same-size favourite switch, NYK -4.5 -> BOC -4.5, was being hidden: moves-orient C4) — Reason: a line is "the HOME team's points" and "home" is a label ESPN can change; Live sync and the tracked game's timer save the schedule while an odds download is in flight (they are guarded by `state.syncing`, not `OD.busy`), so a download matched to the OLD labels can land after a re-label: reproduced in tools/e2e/team-match.js R, every league's FINISHED game (never re-downloaded) ended with its closing line next to the wrong team ("KES covered" when LAK was the favourite). This reverses the earlier `ho` rejection: the owner asked for a guarantee and a real hole was found
- Decision: `oddsHomeSide` says which ESPN team the embedded line's "home" numbers belong to: (1) the favourite named in `details` + the sign of the spread when the text's number matches it, else (2) that favourite + a vote of homeTeamOdds.favorite / sign of pointSpread.home / cheaper money line, else (3) homeTeamOdds.team.id / awayTeamOdds.team.id against the competitors' team ids, else ESPN's labels; the favourite fields beat the ids when they disagree — Reason: hockey and baseball quote the money-line PRICE in `details` ("TB -142"), so the old text-vs-spread-size rule never fired there and NHL / MLB lines landed next to the wrong team whenever labels and provider disagreed (team-match V1/V2/V4, 8 wrong rows); real data (151 embedded lines, CBB/CFB/NBA/NFL/NHL): the four signals agree with each other and with ESPN's labels today, 125 games with both an ESPN and a Pinnacle line agree on the favourite, Pinnacle's name matching never depends on label order
- Decision: scores need no stamp: score / line score / winner live on the team object itself, and the derived halftime / first-5 sums, the ball and the embedded line move with `flipSides`; guards: tools/e2e/team-match.js (7 leagues x 6 games x 5 label scenarios + the download race, team-keyed oracle) and tools/e2e/line-anchor.js
