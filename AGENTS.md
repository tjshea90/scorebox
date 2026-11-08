# AGENTS.md

<!-- handoff:learnings:begin -->
## Session Learnings (auto-updated by handoff)

### Implicit Rules
- Stack: vanilla JS single-file app in Android WebView; data from ESPN scoreboard + Pinnacle site API (free), PropLine / The Odds API (user keys), all relayed by MainActivity.
- localStorage prefix sbx2:; schedules sbx2:<league>:<yyyymmdd>; odds sbx2:o-<league>:<yyyymmdd>; API keys sbx2:okeys; prefs sbx2:prefs.
- Repo rules (CLAUDE.md): main = single source of truth; before work git fetch origin main and HEAD..origin/main must be empty; push HEAD:main triggers 'Build and release APK'; tag v<versionName>.<run_number>; after EVERY app change wait for run to complete and give user direct APK link, unprompted.
- tools/ckpt.sh: run after each meaningful edit; commits+pushes, updates CHECKPOINT.md (resume file). Chromium e2e: Playwright preinstalled; bash tools/e2e/run.sh serves assets on port 8765.
- Old-WebView .nogap CSS fallback needs explicit margins for any new flex-gap row.
- User prefs: Android 16 target; frequent GitHub checkpoints + handoff protocol; longer sessions ok if product better.

### Key Decisions
- Decision: state.oRef (pref key orf, default on) separate from state.odds — Reason: hide odds vs stop refreshing independently.
- Decision: oddsSync() returns early unless both on — Reason: single choke point for all odds API calls.
- Decision: odds download only via runSync(pairs, silent, withOdds=true), passed only by syncAll() (Sync button + pull-to-refresh) — Reason: launch, day nav, toggles, source switches, key saves, timers, visibilitychange, online, Live sync, Track live never call odds APIs. Consequence: Live sync no longer refreshes odds (user informed). Turning Odds on does not fetch by itself.
- Decision: odds refresh off keeps saved odds on screen, odds cache untouched (incl. ESPN-embedded line folding), stale label suppressed; Moves tab still reads saved data — Reason: user wants zero odds calls with cached data still usable.
- Decision: odds days = today + viewed day only (oddsDays) — Reason: other days download only when selected.
- Decision: Moves tab = last tab in league strip, shown only with Odds on, reads cache only (no network), shows viewed day — Reason: no network from a view tab.
- Decision: round-based comparison: oddsSync snapshots saved odds for [today, viewed day] before a round, markMoves() diffs after; changed part keeps previous version as book.pv[part] = previous line + timestamp; unchanged later round leaves it so move stays listed (with age) until line moves again — Reason: repeated no-change syncs must not wipe a move the user wants to see.
- Decision: ranking: spread/total points as-is; money line 10 cents = 1 point; price-only change (line unchanged) 20 cents = 1 point; games sorted by biggest move; rows sorted inside card; shown book follows Books picker else Pinnacle-first default — Reason: same book the cards show.
- Decision: gear = 48x44 touch target, 28px glyph; media queries <=400px and <=340px tighten header — Reason: fit 360/320px phones.
- Decision: added tools/e2e (Chromium + mocked services, run: bash tools/e2e/run.sh) and tools/test_syntax.sh (tools/ckpt.sh runs every tools/test_*.sh per checkpoint, must stay fast) — Reason: regression guards for network rules and blank-app syntax errors.
- Decision: README + in-app footer rewritten for new network rules and Moves tab.

<!-- handoff:learnings:end -->
