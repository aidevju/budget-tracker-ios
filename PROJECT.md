# Ledger — personal budget tracker

A personal-use budget tracker built as a Progressive Web App (PWA), so it
installs on iOS via Safari's "Add to Home Screen" with no App Store, no
Apple Developer account, and no Mac required.

## What it is

- Add income and expenses with a category, optional note, and date.
- Monthly view with prev/next navigation, a receipt-styled balance
  summary, a category breakdown (expenses only), and a day-grouped
  transaction list.
- Settings: theme (light / dark / system) and a currency symbol picker
  (defaults to no symbol).
- Fully offline-capable once installed — a service worker caches the
  app shell, and all data lives in the browser's `localStorage` on
  the user's own device. No backend, no accounts, no network calls.

## Tech stack

Plain HTML/CSS/JS. No framework, no build step, no npm dependencies.
This is deliberate — it keeps the project runnable by opening
`index.html` (via a local server) or hosting the folder as-is on any
static host.

## File structure

```
budget-tracker/
├── index.html          Page shell: month bar, receipt summary,
│                        breakdown, transaction list, add/edit sheet,
│                        settings sheet
├── styles.css           All styling. CSS custom properties in :root
│                        define the theme; dark mode overrides the
│                        same variables under [data-theme="dark"]
├── app.js                All app logic (single IIFE, no modules)
├── manifest.json         PWA manifest — name, icons, theme colors
├── service-worker.js     Offline caching. CACHE_NAME must be bumped
│                        (e.g. v2 → v3) any time a cached file changes,
│                        or installed devices keep serving stale files
└── icons/
    ├── icon-192.png
    ├── icon-512.png
    └── apple-touch-icon.png
```

## Data model

Stored client-side in `localStorage`, nothing leaves the device.

- `ledger_transactions_v1` — JSON array of:
  ```js
  { id, type: "income" | "expense", amount: number, category: string,
    note: string, date: "YYYY-MM-DD" }
  ```
- `ledger_settings_v1` — JSON object:
  ```js
  { theme: "light" | "dark" | "system", currency: "none" | "USD" | "PHP" | ... }
  ```

Category lists and the currency list (order: none, USD, PHP, then the
rest) are defined as constants near the top of `app.js`.

## Running it locally

No build step. From the project folder:

```
python3 -m http.server 8000
```

Then open `http://localhost:8000`. Opening `index.html` directly via
`file://` mostly works for UI testing but the service worker won't
register — use the local server for anything offline-related.

## Deployment

Hosted as a static site via GitHub Pages, deployed from the `main`
branch root. To publish a change: upload the changed files through
GitHub's web UI (or `git push`), commit, and Pages rebuilds
automatically within about a minute.

**Important:** whenever any of `index.html`, `styles.css`, `app.js`,
or `manifest.json`/icons change, bump `CACHE_NAME` in
`service-worker.js`. Otherwise devices that already installed the app
keep serving the old cached version indefinitely.

## Conventions to keep

- No frameworks or build tooling — keep it plain HTML/CSS/JS so it
  stays easy to pick up from scratch.
- All styling goes through the CSS custom properties in `styles.css`
  (`--ink`, `--paper`, `--income`, `--expense`, etc.) so light/dark
  mode stays consistent — avoid hardcoding colors.
- Keep files separated by concern (markup / styles / logic) rather
  than inlining, so future fixes touch one small file.

## Possible future enhancements

(Not started — ideas only.)

- Recurring transactions
- Export/import data (JSON or CSV) since everything is local-only
  and has no backup
- Multiple accounts/wallets
- Charts beyond the simple category bars
- Budgets/limits per category with progress indicators
