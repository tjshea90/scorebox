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

## FIRST ACTION OF EVERY SESSION — hooks, saving work and cold resume (added 2026-10-10)

ScoreBox shares the checkpoint system of Tj's other repos, adapted for one difference: **a push to `main` builds and publishes a release, so autosave and `tools/push.sh` push only the session's own branch and never touch `main`.** Landing on `main` stays the deliberate step described above.

- **First action of every session:** `bash tools/install-hooks.sh` (merges the hooks into the container's settings; idempotent; `--check` reports without changing). Claude Code on the web doesn't read a repo's own `.claude/settings.json` when the repo sits in a subdirectory, so this is what makes the hooks fire.
- **SessionStart hook → `tools/resume.sh`:** pulls, reports sync with GitHub and `origin/main`, flags an interrupted last session, prints `CHECKPOINT.md` and the open items of `TASKS.md`. If you didn't see it, run it by hand and tell Tj.
- **Autosave (`tools/autosave.sh`)** commits and pushes the session branch after tool calls; `tools/secretscan.sh` blocks anything shaped like a credential (the repo is public: never commit the keystore passwords or any key).
- **After every completed step:** `bash tools/ckpt.sh "what I just did" "what comes next"` — rewrites `CHECKPOINT.md`, commits, pushes.
- **When Tj asks for something new:** write it into `TASKS.md` as `[ ]` boxes first, checkpoint, then code.

## Standing setup rules — every session, every Claude account (Tj, 2026-10-10, permanent)

**Standing instruction from Tj (2026-10-10, verbatim):** "Review all available plugins, skills, and connectors at your disposal. Use any plugins, skills, and connectors freely if they can improve app building, app UI and theming, efficiency and accuracy of code, efficiency of Claude usage, or anything else to improve Claude code for building android apps. Ignore skills, plugins, and connectors if they contradict one another; choose the best one. Most of my apps are for Android 16. I frequently use a lot of usage and it runs out and interrupts Claude output. All projects should have ladder systems that auto save all data frequently to GitHub, and a new Claude code session can cold resume the project with no data or progress being lost. Make a checkpoint system and ensure all Claude progress on my projects are saved frequently in case of interruptions. Assume Claude can be interrupted at any time, and plan for a resumption protocol. There should be a smooth handoff to the next Claude session so it can immediately see what to resume, how to resume, what work needs to be done, what work was already finished, etc. I prefer longer sessions and more usage if it makes a better product and fixes bugs, but efficiency and saving Claude usage where possible."

This rule is identical in all five of Tj's repos (novig, scorebox, fantasy-football, Portfolio, Mirage). At the start of every session, before the work:

1. **Take stock of the toolbox (once per session, cheap).** Look at what this session has: the skills list in the system prompt (`ListSkills` / `SearchSkills`), plugins (`ListPlugins`), connectors and MCP servers (`ListConnectors`), the repo's own `.claude/skills/`. Use the ones that improve app building, UI and theming, code accuracy, or Claude-usage efficiency (Compose skills, `code-review`, `simplify`, `security-review`, `claude-api`, the GitHub MCP tools, the artifact/dataviz skills for reports, and so on) freely, without asking. If two of them contradict each other, or contradict this repo's own rules, pick the better one for the job and ignore the other; where a skill and this repo's CLAUDE.md/BRIEF.md disagree, this repo wins. Don't install anything that costs money, sends data out of the repo, or changes Tj's accounts without his word.
2. **Target: Android 16 (API 36).** Most of Tj's apps target it: use current Material 3 / edge-to-edge / predictive-back / themed-icon conventions and the platform's Android 16 behavior changes, unless the repo's BRIEF.md pins something else.
3. **Assume you can be cut off at any moment** (usage cap, dropped connection, container reclaimed). Never hold work, findings, or intent only in the conversation or in `/tmp`. The ladder, lowest rung first: (a) the raw request captured to disk; (b) the autosave hook commits and pushes after tool calls; (c) `bash tools/ckpt.sh "did" "next"` after every completed step, with an honest, specific "what comes next"; (d) the milestone ship gate where the repo has one. The repo's section below this one ("Saving work" or equivalent) names the exact scripts.
4. **Make the handoff cold-resumable.** A new session on any account must be able to read, with nothing else, what is DONE, what is IN PROGRESS, what comes NEXT and HOW to resume: that is `CHECKPOINT.md` + `TASKS.md` (+ `tools/resume.sh`'s briefing at session start). If you did not see the briefing, run `bash tools/resume.sh` and tell Tj the hook didn't fire. If `tools/install-hooks.sh` exists, run it first.
5. **Longer sessions are fine; waste is not.** Spend usage where it makes a better product or fixes a bug. Save it where it doesn't: hand mechanical or long-running work (builds, test runs, waiting on CI) to GitHub Actions rather than polling, run only the tests that matter on the way and the full suite at milestones, don't re-read finished work or re-derive established facts, and use prompt caching when calling the Claude API from app code.
6. **If this rule and the repo's older text disagree, tell Tj in one line and follow the stricter safety (save more, not less).** To change this rule, edit it in all five repos so they stay identical.
