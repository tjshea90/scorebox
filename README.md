# ScoreBox

A pocket scoreboard for MLB, WNBA, NFL and CFB. Scores come straight from
ESPN's public scoreboard feed — no accounts, no ads, no backend of your own
to run.

The whole app is one dependency-free HTML/CSS/JS file
(`app/src/main/assets/index.html`) running inside a thin Android `WebView`
shell (`MainActivity.java`). There's no build step for the app itself and no
JS framework — edit the HTML file and reinstall.

## How this project came back from just an APK

The original source for this app was lost; only the built, installed APK
survived. This repository is a reconstruction of that project, recovered by
reverse-engineering `ScoreBox.apk` — decompiling `classes.dex` with
[androguard](https://github.com/androguard/androguard) to recover
`MainActivity.java` byte-for-byte (down to the exact `configChanges` bitmask
and `launchMode`), decoding `resources.arsc`/`AndroidManifest.xml` for the
package name, theme, and launcher icons, and pulling `assets/index.html`
back out whole — it was never compiled or obfuscated, so it came back intact.
The rebuilt project was then compiled and diffed against the original APK's
manifest (`aapt dump badging`) to confirm an exact match on package name,
version, SDK levels, permissions, and the launcher activity.

The one thing that *can't* be recovered from an APK is intent — comments,
commit history, and any design notes are gone. What's here is the working
app as it shipped, safe to keep building on.

## Project layout

```
app/src/main/
  java/com/scorebox/app/MainActivity.java   WebView shell — loads the app,
                                             relays ESPN API calls past CORS,
                                             serves assets/ locally
  assets/index.html                         the app itself (HTML/CSS/JS)
  res/                                      launcher icon, theme, app name
keystore/scorebox-release.jks               release signing key (see Releases)
.github/workflows/build-release.yml         CI: builds + publishes the APK
```

## Building

Requires Android Studio (or the command-line SDK) with Android SDK Platform
34 and Build-Tools 34.0.0 installed — a plain `File → Open` on this folder
will prompt Android Studio to fetch anything missing.

```
./gradlew assembleDebug     # quick local build, debug-signed
./gradlew assembleRelease   # signed with keystore/scorebox-release.jks (see Releases)
```

The app targets `minSdk 21` / `targetSdk 29`, matching the original build.
`compileSdk` is bumped to 34 purely so current Android Studio can build it
without installing an old platform — it doesn't change runtime behavior.

Because `assets/index.html` is plain HTML/CSS/JS, you can also just open it
in a desktop browser for quick iteration — the only thing that won't work
outside the app is the ESPN API relay (see below), so scores won't load
until you either run it in the WebView or point `fetch()` at a CORS-friendly
proxy during development.

## Releases

`.github/workflows/build-release.yml` builds and publishes a signed APK
automatically on every push to a `claude/**` branch and on every `v*` tag:

- An ordinary push publishes to a single rolling **`latest`** release —
  same tag, same filename, overwritten in place each time — so there's one
  stable link that always has the newest build:
  https://github.com/tjshea90/scorebox/releases/tag/latest
- Pushing a `v3.0.1`-style tag (or running the workflow manually with a tag
  input) cuts its own permanent, numbered release instead.

Every build is signed with `keystore/scorebox-release.jks`, checked into
this repo on purpose rather than kept as a CI secret. That's intentional,
not an oversight: ScoreBox has no Play Store listing (sideloaded only) and
requests no permission beyond `INTERNET`, so the only thing this signature
buys is a stable identity across builds — installing a newer APK over an
existing ScoreBox install upgrades it in place instead of requiring an
uninstall first. `versionCode` is set from the CI run number
(`-PappVersionCode=<run number>`) so it's always strictly increasing,
which is what makes that in-place upgrade possible. If ScoreBox ever gets a
real distribution channel, replace this keystore with a private one first.

## How it fits together

- `MainActivity` serves the app from `assets/` under a virtual HTTPS origin
  (`https://appassets.androidplatform.net/`), and transparently relays any
  `GET` the page makes to `site.api.espn.com` through a native
  `HttpURLConnection` — that's what lets a page with no server of its own
  call ESPN's API without hitting CORS.
- `index.html` polls `site.api.espn.com/apis/site/v2/sports/.../scoreboard`,
  caches parsed results in `localStorage`, and renders game cards. "Live
  sync" polls every 10s; "Track live" follows a single game every 5s.

## What changed since the recovered version

Everything else was left exactly as it shipped. Two additions:

1. **Pull to refresh.** Drag down from the top of the list to trigger the
   same refresh "Sync all" does (or, while tracking a single game, the same
   immediate re-check its 5s timer already does).
2. **Richer live detail:**
   - **Football (NFL/CFB):** a 🏈 next to whichever team currently has the
     ball, with the down, distance and field position right under their
     name — e.g. "2nd & 7 at GB 32".
   - **Baseball (MLB):** the live at-bat — current batter, current pitcher,
     and that pitcher's pitch count for the outing, shown under the status
     line alongside the existing bases/count/outs display.

Both pull from fields ESPN's scoreboard feed already returns per game
(`situation.pitcher`/`situation.batter` for baseball,
`situation.down`/`situation.possession`/`situation.downDistanceText` for
football) — no extra network calls, and every new field is read
defensively the way the rest of the parser already treats ESPN's response:
if a field is ever missing for a given game, that piece just doesn't render
rather than breaking the card.

## Bug fixes since the initial reconstruction

- **Sync silently refusing to run.** Every sync path was hard-gated on
  `navigator.onLine`, which is well known to be unreliable in Android
  WebView specifically over tethered/hotspot connections. Sync now always
  attempts the fetch and lets its own success/failure decide;
  `navigator.onLine` is only used for the cosmetic online/offline dot.
- **Relay failures masquerading as CORS errors.** `MainActivity`'s native
  relay returned `null` on any failure (DNS, timeout, TLS, ...), which
  told WebView to re-issue the request itself as a real cross-origin
  fetch — one ESPN doesn't send CORS headers for, so it was doomed
  regardless of whether it actually reached ESPN, and hid the real error
  behind a generic network failure. The relay now always returns its own
  CORS-enabled response, including a real error on failure.
- **IPv6 on tethered hotspots.** Phone hotspots commonly advertise an IPv6
  route that doesn't actually forward off the phone; `java.net`'s
  dual-stack connection logic can stall on that dead route even though
  IPv4 works fine over the same hotspot. The relay now forces IPv4.
- **Missing football icon mid-drive.** `parseFootballSituation` discarded
  possession info whenever ESPN's feed had no down/distance text, which
  it commonly omits between snaps (kickoffs, extra points, replay
  review). The 🏈 now renders off possession alone.
