# CHECKPOINT 43 — read me first, then TASKS.md

**Written:** 2026-11-08T16:45:42Z · **tests:** all 1 fast checks green (gradle suite: see ship.sh)
**Branch:** `ccr-bfc07519-v7jydl` · **builds on:** `f45e56e` (this checkpoint is the commit after it)

## Just done
Saved session handoff (.handoff/handoff.md+json, archive, CLAUDE.md/AGENTS.md learnings block). All five requests (gear, Odds refresh toggle, schedule refresh, per-day odds rule, Moves tab) shipped as v3.0.42 on main

## Do this next
Wait for user feedback on v3.0.42 from a real phone; follow-ups only if asked (see .handoff/handoff.md Remaining Queue). Any app change: fetch origin/main, run tools/e2e/run.sh, push main, wait for build, give APK link

*(resuming? CLAUDE.md's "FIRST ACTION OF EVERY SESSION" comes before "Starting a session" — do that one first, or autosave stays off all session.)*

## Uncommitted right now
     M .gitignore
     M CHECKPOINT.md
     M CLAUDE.md
    ?? .handoff/
    ?? AGENTS.md

## Last ten checkpoints
```
  f45e56e ckpt 42: Added tools/test_syntax.sh (ckpt runs it: blank-app guard) and tools/e2e/ (Chro
  deb40db ckpt 41: Bigger gear (48x44, header fits 320-411px); Odds refresh toggle (saved odds sta
  ee89a9e ckpt 40: Gear enlarged; Odds refresh toggle (oRef) gating oddsSync; odds only via Sync/p
  bca1a78 ckpt 38: Layout verified in Chromium (411px + 800px): dual boards mid-card, per-book hal
  5d09a98 ckpt 37: oddsParts rewritten: dual boards in mid-card, per-book halftime, NHL fullOnly f
  920aa3f ckpt 36: Started: odds board to middle of card, dual full+halftime boards, per-book half
```
