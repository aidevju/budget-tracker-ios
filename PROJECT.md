# Ledger — personal budget tracker

A personal-use budget tracker built as a Progressive Web App (PWA), so it
installs on iOS via Safari's "Add to Home Screen" with no App Store, no
Apple Developer account, and no Mac required.

## What it is

- Add income and expenses with a category, optional note, and date.
- Four screens, swapped in place via a bottom tab bar (no page
  navigation, no router — no top app bar either, the tab bar is the
  only persistent chrome), plus one drill-down screen (Credit Card
  Bills) reached from Dashboard rather than the tab bar:
  - **Month** (default tab): prev/next month navigation, a
    receipt-styled balance summary, monthly expense target progress,
    a category breakdown (expenses only), a day-grouped transaction
    list, and an "Export CSV" link next to the transactions header.
  - **Dashboard**: top category, average daily spend, and a
    spending-by-category pie chart (with legend) for the last-viewed
    month, plus a 6-month expense trend with a "Today" link. Tapping
    a trend month jumps back to the Month tab on that month, for
    drill-down. Also shows a **Credit Cards** panel — one row per
    account with a nonzero unbilled Credit-Card balance (plus an
    "Unspecified card" bucket for charges with no account set), each
    with a "Pay Bill" action that opens the Pay Card Bill sheet, plus a
    "View all" link that opens the **Credit Card Bills** screen (below).
    The panel is hidden entirely only when there's nothing unbilled
    *and* no bill has ever been paid.
  - **Credit Card Bills** (drill-down, reached only via "View all" on
    Dashboard's Credit Cards panel, not part of the tab bar): a back
    arrow returns to Dashboard. Lists every past bill-payment
    transaction, newest first, each expandable in place to show the
    charges it reconciled — read-only, no tap-to-edit. Reuses the same
    linked-charge row rendering as the "Includes N charges" block in
    the transaction edit sheet.
  - **Templates**: a flat, dateless list of recurring income/expense
    presets (category, subcategory, payment method, account, note,
    and an optional amount), each shown with a "—" when no amount is
    set. An inline "+ Add" header link opens the add/edit sheet (the
    floating "+" stays Month-only — not reused here); tapping a row
    edits it, with Delete inside that sheet. Applying a template from
    the transaction add sheet's picker is a one-time copy into a new,
    independent transaction — there's no persistent link back. An
    "Export CSV" header link (next to "+ Add") downloads all templates
    as a CSV (Type, Category, Subcategory, Payment Method, Account,
    Note, Amount — Amount blank when unset); the matching "Import
    Templates" action lives in Settings (see below), since that's
    where the transaction Import CSV action already lives.
  - **Settings**: theme (light / dark / system), a currency symbol
    picker (defaults to no symbol), an optional monthly expense
    target, the credit-card bill suggestion window (days), an
    **Import CSV** action (see below), an **Import Templates** action
    (the counterpart to the Templates screen's "Export CSV" — same
    preview-before-commit flow, but for the dateless template shape:
    required columns are just Type and Category, Amount is optional),
    and an editable-lists section
    for Expense Categories / Income Categories / Payment Methods (add,
    rename — cascades to existing transactions *and* templates — and
    delete, blocked while a value is still in use by either), each
    collapsed by default to keep the screen from being dominated by
    long lists. A full tab/screen, not a popup sheet, for consistency
    with the other tabs. A version number ("Ledger vX.Y.Z") is shown
    at the bottom of the screen, hardcoded in `index.html`.
- The floating "+" add-transaction button only shows on the Month
  tab (hidden on Dashboard/Credit Card Bills/Templates/Settings), positioned above the
  tab bar.
- Export downloads the currently viewed month as a CSV file (summary,
  category breakdown, then the full transaction list) — opens
  directly in Excel, Numbers, or Google Sheets. No `.xlsx` export,
  since a real Excel binary format needs an external library, which
  would break the no-dependencies/fully-offline setup.
- Import (Settings) bulk-loads transactions from a CSV file — the
  other half of Export, for restoring/backing up data or bringing in
  historical records from elsewhere. Columns are matched by name
  (case-insensitive), not position, so a reordered file still works;
  unrecognized extra columns are ignored, which is what lets a
  straight re-import of the app's own Export file work unedited — the
  header row is *found* rather than assumed to be row 1, so Export's
  title/summary/category-breakdown preamble ahead of its Transactions
  section is skipped automatically. An unrecognized Category or
  Payment Method is auto-created rather than rejected (same
  `addListValue()` Settings' list editor uses). A non-blank
  `Reconciled With` cell is matched, within the same file only,
  against another row's exact `"<date> — <note>"` string — precisely
  what Export writes into that column, so an Export → Import
  round-trip restores `reconciledBillId` links intact. Row-level
  validation: a bad row (missing/invalid Date, Type, or Amount) is
  skipped, not fatal to the whole import; every rejected row and its
  reason is listed in a preview sheet before anything is written,
  alongside row counts, new list values, Reconciled With match counts,
  income/expense totals, and the date range covered. Amount parsing
  strips currency symbols and figures out which of "." and ","
  is the decimal separator (the last one, when followed by 1-2
  digits) rather than always treating "." as decimal and "," as
  thousands — so a comma-decimal amount like "50,00" reads as 50.00,
  not 5000. No de-duplication against existing transactions —
  importing the same file twice creates duplicate rows.
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
├── index.html          Page shell: Month/Dashboard/Templates/Settings
│                        screens plus the bottom tab bar, the add/edit
│                        transaction sheet, the Pay Card Bill sheet, the
│                        add/edit template sheet, the Import CSV preview
│                        sheet, and the Import Templates preview sheet
│                        (five modals now, same open/close mechanics),
│                        the template picker inside the
│                        transaction sheet, plus a custom autosuggest
│                        dropdown for subcategory/account. Screens are
│                        plain hidden-attribute divs toggled in app.js —
│                        no router. Icons are inline SVG (no icon
│                        font/library)
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
    subcategory: string, note: string, date: "YYYY-MM-DD",
    paymentMethod: string, account: string, reconciledBillId?: string }
  ```
  `subcategory` and `account` are optional freeform text — no fixed
  taxonomy, just a custom autosuggest dropdown (`setupAutosuggest()` in
  `app.js`) sourced live from the user's own prior entries; not a
  native `<datalist>`, which has poor/inconsistent support in iOS
  Safari, this app's actual install target.
  `paymentMethod` is a required fixed-list field (defaults to `"Cash"`
  for records predating this field). `reconciledBillId` is optional —
  present only on a Credit-Card expense that's been linked, via the
  Pay Card Bill flow, to the expense transaction that settled it; its
  *absence* is what makes a charge "unbilled" — there's no separate
  status field.
- `ledger_settings_v1` — JSON object:
  ```js
  { theme: "light" | "dark" | "system", currency: "none" | "USD" | "PHP" | ...,
    monthlyTarget: number | null, ccSuggestWindowDays: number }
  ```
  `monthlyTarget` is a single overall expense target applied to every
  month (not per-category, not per-month); `null`/absent means no
  target is set and the dashboard's target card stays hidden.
  `ccSuggestWindowDays` (default `60`) controls how far back the Pay
  Card Bill sheet looks, from the entered bill date, when
  auto-suggesting candidate charges to reconcile.
- `ledger_templates_v1` — JSON array of:
  ```js
  { id, type: "income" | "expense", category: string, subcategory: string,
    note: string, paymentMethod: string, account: string, amount: number | null }
  ```
  Dateless by design — mirrors the source spreadsheet's `Common`/
  `Monthly` sheets, which are flat recurring-item lists with no date
  column. `amount` is nullable: a template with no amount just leaves
  Amount blank when applied, for the user to fill in. Applying a
  template (from the picker inside the transaction add sheet) is a
  one-time copy into a new, independent transaction — deliberately
  **no** persistent link back, unlike `reconciledBillId` above, since
  there's no "settlement" concept for templates.
- `ledger_lists_v1` — JSON object:
  ```js
  { expenseCategories: string[], incomeCategories: string[],
    paymentMethods: string[],
    expenseCategoryColorSlots: { [category: string]: number },
    nextExpenseColorSlot: number }
  ```
  Backs the Category and Payment Method dropdowns — editable from
  Settings (add / rename-with-cascade / delete-if-unused, where usage
  is checked and cascaded across both `ledger_transactions_v1` *and*
  `ledger_templates_v1`) instead of hardcoded constants. Seeded from
  the app's defaults the first time
  it's read if the key doesn't exist yet, so existing installs see
  identical dropdowns and colors after upgrading. Each expense
  category's chart color is looked up by a persisted `colorSlot`
  (assigned once, at creation, and never reassigned by renaming or
  reordering) rather than by array position: slots 0–8 map to the
  curated `--cat-1..9` CSS variables, and slot 9+ (only reachable once
  a user adds a 10th expense category) falls back to a generated
  `hsl(...)` color computed in `app.js` — see `categoryColor()`.

The currency list (order: none, USD, PHP, then the rest) is defined as
a constant near the top of `app.js`.

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
`service-worker.js` (e.g. `ledger-cache-v21` -> `ledger-cache-v22`).
Otherwise devices that already installed the app keep serving the old
cached version indefinitely. In the same commit, set `APP_VERSION` in
`app.js` (shown in Settings as "Ledger vX.Y", rendered into
`#appVersionLabel` in `index.html`) so its minor number matches the
new `CACHE_NAME` number — e.g. `ledger-cache-v22` -> `APP_VERSION =
"1.22"`. Bump the major segment instead for a breaking/data-model
change.

## Conventions to keep

- No frameworks or build tooling — keep it plain HTML/CSS/JS so it
  stays easy to pick up from scratch.
- All styling goes through the CSS custom properties in `styles.css`
  (`--ink`, `--paper`, `--income`, `--expense`, etc.) so light/dark
  mode stays consistent — avoid hardcoding colors.
- Keep files separated by concern (markup / styles / logic) rather
  than inlining, so future fixes touch one small file.
- Expense categories are colored via `--cat-1`...`--cat-9` in
  `styles.css`, looked up by each category's persisted `colorSlot` in
  `ledger_lists_v1` (`categoryColor()` in `app.js`) — not by array
  position, so user renames/reordering via Settings don't shift other
  categories' colors. Slot 9+ (past a 10th user-added expense
  category) is a generated color instead of a CSS variable — see the
  data model section above.
- If a class sets `display` on an element that's also toggled via the
  `hidden` attribute (e.g. `.fab { display: flex; }`), add an explicit
  `.that-class[hidden] { display: none; }` override. The class selector
  and the browser's built-in `[hidden]` rule have equal specificity, so
  without the override the later one (the author's) wins and `hidden`
  silently stops hiding the element. Hit this three times already
  (the old `.dashboard` wrapper, then `.fab`, then `.list-editor`) —
  check for it whenever a new `hidden`-toggled element gets its own
  `display` rule. `#templatePickerField` (a `.field`) and the
  Templates screen's `.list-header-row h1` got their overrides added
  proactively for exactly this reason, before shipping rather than
  after a bug report.

## Possible future enhancements

(Not started — ideas only.)

- De-duplication on Import — importing the same CSV file twice
  currently creates duplicate transactions; flagged in the Import
  preview sheet as a known v1 limitation, not blocking logic
- Multiple accounts/wallets
- Charts beyond the simple category bars and dashboard trend
- Per-category budgets/limits with progress indicators (the
  dashboard currently only supports one overall monthly target)
- Let the CSV export format be edited/customized — e.g. which
  columns are included, or a transactions-only layout instead of the
  current summary + category breakdown + transaction list. Scope
  unclear yet; needs a decision on what "edit" means (a settings
  toggle? a format picker at export time?) before implementing
- Screenshot/statement-OCR matching for credit-card bill
  reconciliation — auto-detect candidate charges from a photographed
  statement instead of the manual checklist in the Pay Card Bill
  sheet. Deferred; needs an example statement image before design.
- Smarter handling when deleting an in-use list value in Settings
  (currently blocked outright with a usage-count message) — e.g.
  offer to reassign affected transactions/templates to another value,
  or merge two values, before allowing the delete.
