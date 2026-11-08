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
