# Ledger — personal budget tracker

A personal-use budget tracker built as a Progressive Web App (PWA), so it
installs on iOS via Safari's "Add to Home Screen" with no App Store, no
Apple Developer account, and no Mac required.

## What it is

- Add income and expenses with a category, optional note, and date.
- Two screens, swapped in place (no page navigation, no router):
  - **Month screen** (default): prev/next month navigation, a
    receipt-styled balance summary, monthly expense target progress,
    a category breakdown (expenses only), and a day-grouped
    transaction list.
  - **Dashboard screen** (opened via the 📊 button in the top bar):
    top category, average daily spend, and a spending-by-category
    pie chart (with legend) for the last-viewed month, plus a
    6-month expense trend. Tapping a trend month jumps back to the
    month screen on that month, for drill-down.
- Settings: theme (light / dark / system), a currency symbol picker
  (defaults to no symbol), and an optional monthly expense target.
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
├── index.html          Page shell: month screen (month bar, receipt
│                        summary, target progress, breakdown,
│                        transaction list) and dashboard screen
│                        (insights, trend), plus add/edit sheet and
│                        settings sheet. Screens are plain hidden-
│                        attribute divs toggled in app.js — no router
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
  { theme: "light" | "dark" | "system", currency: "none" | "USD" | "PHP" | ...,
    monthlyTarget: number | null }
  ```
  `monthlyTarget` is a single overall expense target applied to every
  month (not per-category, not per-month); `null`/absent means no
  target is set and the dashboard's target card stays hidden.

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
- Expense categories are colored via `--cat-1`...`--cat-8` in
  `styles.css`, mapped by index into the `CATEGORIES.expense` array
  in `app.js` (`categoryColor()`). Reordering or resizing that array
  changes chart colors — add new categories at the end and add a
  matching `--cat-N` pair (light + dark) if you go past 8.

## Possible future enhancements

(Not started — ideas only.)

- Recurring transactions
- Export/import data (JSON or CSV) since everything is local-only
  and has no backup
- Multiple accounts/wallets
- Charts beyond the simple category bars and dashboard trend
- Per-category budgets/limits with progress indicators (the
  dashboard currently only supports one overall monthly target)
