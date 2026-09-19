# ScoreBox

Single-WebView Android app. The real UI and all logic live in
`app/src/main/assets/index.html` (vanilla HTML/CSS/JS, no build step, no
framework). `MainActivity.java` is just a thin shell: it serves that file
from a local virtual origin and relays `GET`s to `site.api.espn.com`
natively so the page can call ESPN's public scoreboard feed without hitting
CORS. See `README.md` for the full project layout.

## Standing instruction: build and deliver an APK after every update

This holds for every session, not just the one that added it.

`.github/workflows/build-release.yml` ("Build and release APK") builds a
**signed release APK** (same persistent key every time, so installing over
an existing ScoreBox install updates it in place) and publishes it as a
GitHub Release with the `.apk` attached. It triggers automatically on push
to `main` or any `claude/**` branch (also on a `v*` tag, or manual
`workflow_dispatch`) — so simply pushing a change is enough to kick off a
build; no manual dispatch needed for the common case.

Whenever you finish a change to this app (anything under `app/`, or to the
Gradle/CI config itself) and push it, before ending your turn:

1. Note the commit SHA and branch you just pushed.
2. Find the workflow run it triggered: `actions_list` with
   `method: list_workflow_runs`, `resource_id: build-release.yml`, filtered
   to that branch (match by `head_sha` if more than one run shows up). It
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
