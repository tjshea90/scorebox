# CHECKPOINT 55 — every team keeps its own score and its own odds: read me first

**Branch:** `claude/beautiful-edison-thivek` (session branch; `main` is the source of truth — see CLAUDE.md) · **builds on:** `2e548a0` (= main when this task started: ckpt 54, release v3.0.47 = neutral-site games keep their schedule order).
**State:** fix written, guarded, validated — `bash tools/test_syntax.sh && bash tools/e2e/run.sh` → 11 scripts, **225 PASS, 0 FAIL**; real-data audit clean. Code checkpoint `7a1f724` is on the session branch.
**Remaining:** land on `main` → wait for "Build and release APK" → send the user the `.apk` link. (If `git log --oneline origin/main` already shows the "ckpt 55" commit, only the APK link is left.)

## The request (user, 2026-11-27, second message)
"Ensure that no matter the order of the home or away team, each team in all leagues is perfectly matched with its score and its odds. There can be no flipped score [...] The odds must also match 100% to the actual team it is next to, regardless of home/away designations."

## What was found (evidence, not guesses)
- **Scores / line scores / winner**: attached to the team object itself (`parseTeam`), so they cannot cross rows; derived halftime / first-5 sums, the ball and the embedded line move with `flipSides`. Verified on real data (below).
- **Pinnacle**: `matchEvents` name matching never depends on label order — real data, every league, labels swapped: 0 favourite changes.
- **Hole 1 — ESPN's embedded line, hockey / baseball (also price-style `details` seen in CBB/CFB):** the old rule compared the details TEXT with the spread size. Hockey / baseball quote the money-line PRICE ("TB -142"), so it never fired and the spread + money line landed next to the wrong team whenever ESPN's labels and the provider's keying disagreed. Real data: NHL 24 of 24 flipped when labels were swapped; `team-match` V1/V2/V4 (MLB + NHL, 8 wrong rows).
- **Hole 2 — a download that started before a re-label lands after it:** `setLive` / `trackTick` save the schedule guarded only by `state.syncing`, NOT `OD.busy`. A line matched to the OLD labels was written after the re-label; a FINISHED game is never re-downloaded, so its closing line stayed next to the wrong team ("KES covered" when LAK was the favourite) in every league (`team-match` R, reproduced before the fix).
- Perf: rendered HTML is byte-identical old vs new on real data; the new functions do not show in the CPU profile; an apparent +10-17% in `tabs.js` was run-order noise (reversed order: 3 rounds, no consistent difference).

## Fix (index.html only)
1. `oddsHomeSide` / `detailsFavourite` / `parseEspnOdds(list, homeAbbr, awayAbbr, homeId, awayId)`: which ESPN team do the embedded line's "home" numbers belong to — (1) favourite in `details` + sign of the spread when the text's number matches it; else (2) that favourite + a vote of `homeTeamOdds.favorite` / sign of `pointSpread.home` / cheaper money line; else (3) `homeTeamOdds.team.id` / `awayTeamOdds.team.id` vs the competitors' ids; else labels. Favourite fields beat the ids when they disagree.
2. **Stamped lines**: `applyBooks` stamps every part it writes with `ho` (abbr of the team its "home" numbers belong to, `stampHome`); `orientEntry` / `orientBook` / `partFor` turn a part whose `ho` is the card's AWAY team, in `oddsParts` and `movesForDay` (stored data never mutated; same object back when nothing needs turning). `markMoves` uses `sameSideAs` so a re-label is not recorded as a move. Parts WITHOUT `ho` (saved by builds <= 47) are read as they are; `mirrorOdds`/`mirrorEntry` (observed non-neutral swap) now turn + stamp only UNSTAMPED parts.
3. `tools/e2e/moves-orient.js` A4 / B2 now read the stored line through its stamp (`seen`) instead of expecting the old physical rewrite; every behavioural check in it is unchanged.
4. `partMoves` applies the `isMirror` guess only when a line has no stamp: on stamped lines a real same-size favourite switch (NYK -4.5 -> BOC -4.5) was hidden as "no move" (new check moves-orient C4; mutation-checked).

## Guards added
- `tools/e2e/team-match.js` — 7 leagues x 6 games x 5 label scenarios + the late-download race; ESPN's embedded line, Pinnacle, PropLine, The Odds API; full-game AND halftime / first-5 boards; live / final result lines; oracle keyed by TEAM. Mutation-checked (removing a half-line flip fails V1-V4 + R).
- `tools/e2e/line-anchor.js` — 34 checks: orientation rules (price-style details, pick'em, ids only, conflicts), stamp helpers (immutability, no copy on the hot path), upgrade from unstamped data across re-labels back and forth. Mutation-checked.
- `tools/audit/` (on demand, ~5 min): `python3 tools/perf/fetch-fixtures.py && python3 tools/audit/fetch-pinnacle.py && node tools/audit/real-render.js` — real ESPN + Pinnacle through the real app, as labelled and with EVERY game swapped, every row vs the raw payloads. 2026-11-27: 473 cards, 946 rows, 256 scores, 246 line scores, 292 ESPN-line rows, 234 Pinnacle rows → 0 problems in all 4 modes. Run against 2e548a0 (`ASSETS=<dir with the old index.html> MODES=Eswap`) it reports 96 wrong-team NHL rows.
- Scratch scripts of this session (cross-source favourite agreement ESPN vs Pinnacle: 125/125 games agree) lived only in the scratchpad; the idea: parse real payloads with the app's `parseScoreboard` + `pinPerGame` on a copy of index.html that exposes them, compare which TEAM each source favours.

## Do this next
1. `git fetch origin main && git log --oneline HEAD..origin/main` must print nothing; then `git push origin HEAD:main` (CLAUDE.md authorises it; triggers "Build and release APK").
2. Standing rule: wait for the run (`actions_list` list_workflow_runs build-release.yml on main, match `head_sha`), get the release (`v3.0.<run_number>`), message the user the direct `.apk` link.
3. Tell the user the limits: lines saved by builds <= 47 carry no stamp, so only NEW writes are self-correcting (an old unstamped line is still turned on an observed swap, as before); PropLine / The Odds API can only be tested with mocks (no keys here) — an outcome whose team name does not match is skipped, never mis-assigned; HawkScan hook not run (no hawk CLI / API key / config / server).
4. Ask the user (real phone only): after updating, open a neutral-site or hockey card with odds on — does every team have its own spread / money line, and does the finished-game "covered" badge name the right team?
- Still open from earlier checkpoints (need the user's say): re-fetch only-yesterday-if-changeable; stop the live-dot `pulse`; lazy line-score tables on closed cards.

## Resume protocol (cold start)
1. `git fetch origin`; use `origin/main` (or this branch if main lacks it). Read this file, then `git log --oneline -8`.
2. CLAUDE.md rules: `git log --oneline HEAD..origin/main` must be empty before editing; land on main only when `test_syntax.sh` + `e2e/run.sh` are green; every landing needs the APK link for the user.
3. Mid-task checkpoints: plain `git add -A && git commit && git push origin HEAD` — NOT `tools/ckpt.sh` (it fast-forwards main after every checkpoint = a release build of half-done work).
4. One e2e script alone: `(cd app/src/main/assets && python3 -m http.server 8765 &)` then `node tools/e2e/team-match.js` (takes ~2 min); `pkill -f "http.server 8765"` afterwards. The app is one closure: tests that need internals serve a copy of index.html with them exposed on `window.__t` (see line-anchor.js / neutral-keep.js).

## Uncommitted right now
    (nothing once this checkpoint is committed)
