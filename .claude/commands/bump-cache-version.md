---
description: Bump service-worker.js's CACHE_NAME and the matching APP_VERSION in app.js, then commit and push
argument-hint: [major]
---

Bump the PWA's cache-busting version, following the convention documented in
`PROJECT.md` under "Deployment".

1. Read `service-worker.js` and find the current `CACHE_NAME`, e.g.
   `"ledger-cache-v22"`. Extract the trailing number `N`.
2. Set `CACHE_NAME` to `"ledger-cache-v<N+1>"`.
3. Read `app.js` and find the current `APP_VERSION`, e.g. `"1.22"`
   (`major.minor`). Set its minor segment to `N+1` to match the new
   `CACHE_NAME` number, giving `"<major>.<N+1>"`.
   - If the argument `$ARGUMENTS` contains `major`, also increment the
     major segment (e.g. `"1.22"` -> `"2.23"` when `N+1` is 23) — use
     this only for a breaking/data-model change, not a routine bump.
4. Show the resulting diff of both files to confirm the two numbers
   agree (`CACHE_NAME`'s number == `APP_VERSION`'s minor number).
5. Stage `service-worker.js` and `app.js`, commit with a short message
   describing why the cache/version was bumped (summarize the pending
   uncommitted/recent changes on the branch if there are any — a plain
   "Bump cache version" is fine if there's nothing else to reference),
   then push to `origin` on the current branch with `git push -u origin
   <current-branch>`, updating the branch's open PR if one exists.

Do not bump anything if `service-worker.js` and `app.js` are already in
sync at the same number and there's nothing else uncommitted to justify
a bump — ask before bumping in that case.
