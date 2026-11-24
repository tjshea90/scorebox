# CHECKPOINT 53 — Moves "16 pts" glitch fixed (validate + land): read me first

**Branch:** `ccr-ccfaca82-9jrtmw` (session branch; `main` is the source of truth — see CLAUDE.md) · **builds on:** `da8691a` (= main, ckpt 52 bad-body retry, build 45).
**State:** fix written + new test `tools/e2e/moves-orient.js` (21 checks) passes; full suite run was in progress when this was written → re-run `bash tools/test_syntax.sh && bash tools/e2e/run.sh` before landing if unsure.

## The request (user, 2026-11-24, screenshot of build 45)
Moves tab, top card `CBB · KENT @ WYO · LIVE · moved 1h ago`: `SPREAD KENT −8 → WYO −8 · 16 pts` (prices `KENT −114 → +101 · WYO −102 → −117`) and total 144.5 → 143.5. "Sometimes the odds glitch like the top result."

## Diagnosis (evidence, not guesses)
- The game is a **neutral-site** CBB game (ESPN `neutralSite: true`; live Pinnacle lines now WYO −6.5, tied game). The real pre-game line was **WYO −8** the whole time.
- Mirror the "before" half (WYO −8, WYO −114, KENT −102) and the move is a normal ~3¢ drift (WYO −114 → −117, KENT −102 → +101) + total −1. Prices followed the *team*, so the earlier saved copy was oriented to the other team.
- Stored odds are `sp.h` = "home team's points", with no record of which team was home. ESPN re-labels home/away on neutral-site games → saved line pointed at the wrong team (card showed the wrong favourite) and the next odds round wrote a fake move. Reproduced exactly in Chromium (`moves-orient.js` A/B failed on the old code with the same card shape).
- Second, separate orientation bug found on real data (177 ESPN games, 2026-11-24..29): ESPN's embedded DraftKings `pointSpread.home` / `moneyline.home` are keyed to the book's home on neutral sites (DUQ@HPU: `details "HPU -10.5"` but `pointSpread.home +10.5`, home ML +410; Pinnacle HPU −10 agreed with `details`; UTEP@COFC same). 2 conflicts, both neutral-site, 0 elsewhere.

## Fix (index.html only)
1. `save()` → `mergeGames(prev, games, swapped)` + `sidesSwapped` + `mirrorOdds`/`mirrorEntry`: when a game's home/away abbrs swap between two saves, that day's saved lines for the game (every book full/seg and `pv.p`, plus a carried-over `g.eo`) are mirrored with `flipPart`. Happens at schedule save, so it works with Odds refresh off, and the next odds round sees consistent orientation (no fake move).
2. `partMoves` → `isMirror(from, to)`: a previous line that is the exact mirror image of the current one (spread ≥ 4 pts apart, sum ≤ 1 pt, prices carried over ≤ 40¢; or ML ≥ 80¢ apart yet ≤ 20¢ from mirrored) is compared mirrored → Moves shows the real drift. Cleans glitches ALREADY saved on the phone. A real favourite switch (BOC −3 → NYK −8) is still shown as 11 pts (check C3).
3. `parseEspnOdds(list, homeAbbr, awayAbbr)` + `detailsHomeLine`: `details` text decides which team the ESPN numbers belong to; contradiction → `flipPart(out)`. EVEN/PK/unmatched → untouched.
- Rejected on purpose: an `ho` (home id) anchor on every odds entry and a cross-book favourite check in `applyBooks` (see CLAUDE.md "Rejected").

## Do this next
1. `git fetch origin main && git log --oneline HEAD..origin/main` must print nothing; if the suite is green: `git push origin HEAD:main` (CLAUDE.md authorises it; triggers "Build and release APK").
2. Standing rule: wait for the run (`actions_list` list_workflow_runs build-release.yml on main, match `head_sha`), get the release (`v3.0.<run_number>`), message the user the direct `.apk` link.
3. Ask the user (real phone only): after updating, does the top Moves card read `WYO −8 · 3¢` / total `▼ 1 pt` instead of 16 pts? Does a Sync still show real moves?
- Limits to tell them: the fix cannot prove ESPN's earlier labels (nothing recorded them); a flipped line saved BEFORE this build is only repaired in Moves (display), not on the card, until the next odds Sync (a finished/live game's card is not re-fetched).
- Still open from ckpt 51 (need the user's say): re-fetch only-yesterday-if-changeable; stop the live-dot `pulse`; lazy line-score tables on closed cards.

## Resume protocol (cold start)
1. `git fetch origin`; use `origin/main` (or this branch if main lacks it). Read this file, then `git log --oneline -8`.
2. CLAUDE.md rules: `git log --oneline HEAD..origin/main` must be empty before editing; land on main only when `test_syntax.sh` + `e2e/run.sh` are green; every landing needs the APK link for the user.
3. Mid-task checkpoints: plain `git add -A && git commit && git push origin HEAD` — NOT `tools/ckpt.sh` (it fast-forwards main after every checkpoint = a release build of half-done work).
4. Real-data audit scripts used this session live only in the session scratchpad (they patch a copy of index.html to expose `LEAGUES/parseScoreboard/pinPerGame`); recreate if needed: fetch Pinnacle `…/leagues/493/matchups` + `/markets/straight` (header `x-api-key` as in `MainActivity.java`) and ESPN scoreboard for the day, run the app's `pinPerGame` and compare with `parseEspnOdds`.

## Uncommitted right now
    (nothing once this checkpoint is committed)
