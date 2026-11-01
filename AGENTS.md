# AGENTS.md

<!-- handoff:learnings:begin -->
## Session Learnings (auto-updated by handoff)

### Implicit Rules
- Stack: vanilla HTML/CSS/JS in single file, no build step; MainActivity.java thin shell relaying ESPN GETs
- Before work: git fetch origin main && git merge origin/main; HEAD..origin/main must be empty
- Release: push HEAD:main triggers .github/workflows/build-release.yml; tag v<versionName>.<run_number>; always report outcome and send APK file
- Test pattern: expose cardHTML/state/render in a temp copy of index.html (sed on trailing render();) and drive with playwright; cache key sbx2:<league>:<ymd>, odds key sbx2:o-<league>:<ymd>
- Target devices: Galaxy A15 5G (~411 CSS px) and an older tablet (old WebView, .nogap fallback margins needed alongside flex gap)
- Session branch ccr-77cbabda-o1ul8p must also be pushed (stop hook checks)

### Key Decisions
- Decision: land all work on main (git push HEAD:main) — Reason: CLAUDE.md says main is the single release branch; push triggers signed APK build
- Decision: deliver APK via SendUserFile, not release links — Reason: user said download links always fail
- Decision: NHL halftime = 1st period, no NHL halftime odds — Reason: hockey has no half; Pinnacle seg not wired for NHL; user may prefer after 2 periods
- Decision: sSeg default on for all leagues incl CFB/NHL — Reason: user wanted CFB halftime available; toggle turns off
- Decision: remove leagues sheet, sync all leagues — Reason: tabs now automatic by games present
- Decision: odds pre-game board uses full period when oFull on else seg; seg shown as mini line when both — Reason: row width cannot hold two boards

<!-- handoff:learnings:end -->
