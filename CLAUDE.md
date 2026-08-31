# Budget Tracker iOS PWA

## Service worker cache version

`service-worker.js` uses a cache-first strategy keyed by `CACHE_NAME` (e.g. `ledger-cache-v19`).
Whenever any file in `APP_SHELL` changes — `index.html`, `styles.css`, `app.js`, `manifest.json`,
or the icons — bump `CACHE_NAME` (e.g. `v19` -> `v20`) in the same commit as the content change.

Without this bump, iOS Safari (and other browsers) will keep serving the old cached files
indefinitely after the GitHub Page is republished, since the service worker never notices
anything changed.
