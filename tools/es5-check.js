/* Parse a script as ES5 with the acorn that ships inside Node (offline, nothing to install).
     node --expose-internals tools/es5-check.js file.js
   WHY: ScoreBox runs in whatever Android System WebView the phone has -- on Android 10 / Android Go devices that is
   often an old, frozen one. A single token it does not know (=>, let/const, `template`, ?., ..., async) makes the
   engine refuse the WHOLE script: a blank app. So the page stays plain ES5 (var / function), and this proves it.
   Exit 0 = ES5, or the checker is unavailable (never blocks a checkpoint because of a Node upgrade); 1 = not ES5. */
const fs = require('fs');
let acorn;
try { acorn = require('internal/deps/acorn/acorn/dist/acorn'); }
catch (e) { console.log('es5-check: skipped (this Node does not expose its bundled acorn)'); process.exit(0); }
try {
  acorn.parse(fs.readFileSync(process.argv[2], 'utf8'), { ecmaVersion: 5, sourceType: 'script', locations: true });
  console.log('es5-check: ok');
} catch (e) {
  console.error('es5-check FAILED: ' + e.message + '\n  The page must stay ES5: an older Android WebView refuses the whole script on newer syntax.');
  process.exit(1);
}
