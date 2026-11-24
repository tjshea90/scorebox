# CHECKPOINT 52 — fix validated, landing on main: read me first

**Tests:** `bash tools/test_syntax.sh` (syntax + ES5-only guard) green · `bash tools/e2e/run.sh` 7 scripts / 124 checks green (new: `tools/e2e/bad-body.js`, 13 checks; it failed 8 of them before the fix and reproduced the user's banner verbatim).
**Branch:** `claude/new-session-rgl1vk` (session branch; main is the source of truth — see CLAUDE.md) · **builds on:** `fe1c90e` (= ckpt 51, scroll memory + low-end audit).

## The request (user, 2026-11-24, screenshot of build 44)
NHL tab showed "Couldn't refresh NHL — showing cached data where available. (Unexpected end of JSON input)" while the header sat on "Refreshing…" / "Odds just now (updating…)".

## Diagnosis
- ESPN itself was fine (NHL `dates=20261124` and `20261123` both return valid JSON from this container).
- `MainActivity.relay()` streams the upstream body straight through, so a dropped / empty upstream answer reaches the page as a short `200 OK`. `fetchJSON` then did `r.json()` on it → "Unexpected end of JSON input" (not recognised by `netLike`, so it showed as a banner). Same path serves the Pinnacle odds calls.
- Reproduced exactly in Chromium by mocking an empty 200 (banner text identical to the screenshot, one attempt only).

## Fix (index.html only — `fetchJSON` / `fetchJSONOnce` / `badBody`)
- Body is read as text and parsed in the page. Empty / cut-off / unparseable 200 → retried ONCE after 700 ms; second failure → plain-words message ("the server sent an empty answer (tried twice)") instead of the raw parser text.
- A body-read rejection keeps its original message so `netLike` still files genuine network blips as quiet.
- HTTP errors, timeouts, offline: never retried (no extra load on a struggling server). Timeout semantics unchanged (cleared at headers).
- NOT done on purpose: buffering the whole body in `MainActivity.relay()` (would put a 1.2 MB CBB download under the page's 20 s timeout; cannot be exercised off-device). Revisit only if the phone still shows "empty answer … (tried twice)" — that would mean ESPN/the network is persistently returning nothing for that league, and the new banner text will say which (empty vs "N characters, cut off?").

## Do this next
- **Confirm it landed**: `git fetch origin main && git log origin/main --oneline | head -3`. If not: `git log --oneline HEAD..origin/main` must print nothing, then `git push origin HEAD:main`. Then (CLAUDE.md standing rule) wait for "Build and release APK", take the `.apk` from the release (tag `v3.0.<run number>`) and give the user the direct link.
- **Ask the user** (real phone only; nothing here ran on-device): does the NHL banner stay gone after a Sync? If it now reads "empty answer (tried twice)" or "unreadable answer (N characters…)", that is real data about what the phone receives — act on that text.
- Still open from ckpt 51 (need the user's say): re-fetch only-yesterday-if-changeable; stop the live-dot `pulse`; lazy line-score tables on closed cards.

## Resume protocol (cold start)
1. `git fetch origin`; use `origin/main` (or this branch if main lacks it). Read this file, then `git log --oneline -8`.
2. CLAUDE.md rules: `git log --oneline HEAD..origin/main` must be empty before editing; land on main only when `test_syntax.sh` + `e2e/run.sh` are green; every landing needs the APK link for the user.
3. Mid-task checkpoints: plain `git add -A && git commit && git push origin HEAD` — NOT `tools/ckpt.sh` (it fast-forwards main after every checkpoint = a release build of half-done work).

## Uncommitted right now
    (nothing once this checkpoint is committed)
