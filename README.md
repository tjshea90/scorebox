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
```

## Building

Requires Android Studio (or the command-line SDK) with Android SDK Platform
34 and Build-Tools 34.0.0 installed — a plain `File → Open` on this folder
will prompt Android Studio to fetch anything missing.

```
./gradlew assembleDebug
```

The app targets `minSdk 21` / `targetSdk 29`, matching the original build.
`compileSdk` is bumped to 34 purely so current Android Studio can build it
without installing an old platform — it doesn't change runtime behavior.

Because `assets/index.html` is plain HTML/CSS/JS, you can also just open it
in a desktop browser for quick iteration — the only thing that won't work
outside the app is the ESPN API relay (see below), so scores won't load
until you either run it in the WebView or point `fetch()` at a CORS-friendly
proxy during development.

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
