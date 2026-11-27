# CHECKPOINT 54 — neutral-site games keep their home/away order: read me first

**Branch:** `claude/beautiful-edison-thivek` (session branch; `main` is the source of truth — see CLAUDE.md) · **builds on:** `671d1f2` (= main at session start: ckpt 53 + prewarm.sh).
**State:** fix written, tested and validated — `bash tools/test_syntax.sh && bash tools/e2e/run.sh` → 9 scripts, **182 PASS, 0 FAIL**. Code checkpoint `265e596` is on the session branch.
**Remaining:** land on `main` → wait for "Build and release APK" → send the user the `.apk` link. (If `git log --oneline origin/main` already shows the "ckpt 54" commit, only the APK link is left.)

## The request (user, 2026-11-27)
College basketball: "when i first see the schedule a team is labeled the home team because it is on bottom. But when the scores come in, the same team flips to the top like it is an away team. I think this may be because it is a neutral site. I want the home and away teams to stay how they are from the original schedule, unless it is a true error [...] and it is not a neutral site."

## Diagnosis (evidence, not guesses)
- ESPN flags every event `competitions[0].neutralSite` (boolean): 203 of 643 CBB games 2026-11-20..12-01 were neutral (Thanksgiving tournaments).
- ESPN keeps NO history: for 8 finished neutral games the scoreboard, event-summary header, boxscore and team schedule all return the same CURRENT labels, and `name` / `shortName` / competitor `order` follow them. The original order only exists in what the app saved earlier.
- On a neutral court the labels are arbitrary even between sources: Pinnacle's home/away differs from ESPN's PRE-game labels on 4 of 19 neutral games (0 of 18 home-site). In 12 days of payloads only pre-game events carried ESPN's embedded odds line.
- Before the fix `mergeGames` only *followed* a re-label (mirroring saved odds, ckpt 53) → the card flipped. Reproduced first (red run): `neutral-keep.js` A3 "Kent State / Wyoming" after "Wyoming / Kent State".

## Fix (index.html only)
1. `parseScoreboard`: `if (comp.neutralSite === true) g.ns = 1;`
2. `flipCut(c)` + `flipSides(g)`: swap `home` / `away` (score, line scores, winner travel with the team object), `ht` / `f5` a<->h, `fb.possess` home<->away, `eo.full` via `flipPart`.
3. `mergeGames`: `if (sw && g.ns) { flipSides(g); sw = false; }` → a neutral game keeps the SAVED order and is not queued for `mirrorOdds` (its saved lines still match). Not neutral → ESPN followed (true correction) and queued for `mirrorOdds` as before; the carried-over halftime snapshot is now flipped with it (`g.ht = sw ? flipCut(p.ht) : p.ht`).
- The flag is read from the NEW payload at the time of the re-label (appears with it → keep; disappears with it → follow).
- Rejected: a sportsbook's home/away (Pinnacle / DraftKings keying) to recover the order for a game first seen after the re-label — CLAUDE.md "Rejected".

## Evidence it works
- `tools/e2e/neutral-keep.js` (39 checks): A neutral kept through live / final / re-label back / reload; B non-neutral followed; C flag read at re-label time; D ESPN embedded line stays on its team (no fake move); E football possession; F `flipSides` / `mergeGames` called directly (second page with the two functions exposed — the app is one closure).
- Real data (scratchpad script — recreate if needed: serve a copy of index.html with `parseScoreboard / mergeGames / LEAGUES` exposed, feed 12 days of `…/mens-college-basketball/scoreboard?dates=D&groups=50&limit=400` twice, the second time with EVERY game's `homeAway` swapped, merge): 202/202 neutral games kept (scores, line scores, winner, halftime, embedded spread unchanged), 348/348 home-site games followed + queued for odds mirroring, 0 page errors.
- HawkScan (session hook) was NOT run: no `hawk` CLI, no `HAWK_API_KEY`, no `stackhawk.yml`, no server — the app is a static page in a WebView and the change adds no input, network call or HTML sink.

## Do this next
1. `git fetch origin main && git log --oneline HEAD..origin/main` must print nothing; then `git push origin HEAD:main` (CLAUDE.md authorises it; triggers "Build and release APK").
2. Standing rule: wait for the run (`actions_list` list_workflow_runs build-release.yml on main, match `head_sha`), get the release (`v3.0.<run_number>`), message the user the direct `.apk` link.
3. Tell the user the limits: (a) a game the app FIRST saves after ESPN has re-labelled it shows ESPN's labels (nothing recorded the schedule's order); (b) games already saved flipped before this build stay as saved; (c) a game ESPN does not flag neutral is followed on purpose (true correction).
4. Ask the user (real phone only): does the next neutral-site CBB game keep its order from schedule to final?
- Still open from ckpt 51 (need the user's say): re-fetch only-yesterday-if-changeable; stop the live-dot `pulse`; lazy line-score tables on closed cards. From ckpt 53: does the top Moves card read `WYO −8 · 3¢` / total `▼ 1 pt` after the update?

## Resume protocol (cold start)
1. `git fetch origin`; use `origin/main` (or this branch if main lacks it). Read this file, then `git log --oneline -8`.
2. CLAUDE.md rules: `git log --oneline HEAD..origin/main` must be empty before editing; land on main only when `test_syntax.sh` + `e2e/run.sh` are green; every landing needs the APK link for the user.
3. Mid-task checkpoints: plain `git add -A && git commit && git push origin HEAD` — NOT `tools/ckpt.sh` (it fast-forwards main after every checkpoint = a release build of half-done work).
4. The e2e runner serves `app/src/main/assets` on :8765 itself; to run one script alone: `(cd app/src/main/assets && python3 -m http.server 8765 &)` then `node tools/e2e/neutral-keep.js`.

## Uncommitted right now
    (nothing once this checkpoint is committed)
