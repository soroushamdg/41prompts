<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# Plan — EPIC-023: App shell

Written 2026-09-20, against `docs/epics/CURRENT.md`.

## The one hard problem, and the answer

The rail's middle group is **contextual** — it is headed with the project's or the prompt's name and
its items are that record's routes. The rail lives in `app/app/layout.tsx`, which sits at `/app` and
therefore **never receives `[projectId]` or `[promptId]`**. Next.js gives a layout the params of its
own segment and no deeper.

Four options were considered:

| | Approach | Rejected because |
|---|---|---|
| a | Rail shows ids, not names | The mockup heads the group `REFUND CLASSIFIER`. An id is not a name. |
| b | A second rail in `pr/[promptId]/layout.tsx` | Layouts nest, so the shell would wrap the shell. |
| c | Page pushes context up to the layout | Server components do not compose upward. |
| **d** | **Proxy forwards the path; layout parses it; names via `cache()`** | **Chosen.** |

`proxy.ts` already runs on every `/app/*` request and already parses `pathname`. Forwarding it as
`x-41p-path` is three lines on a path that is not hot (the matcher excludes `_next/static` and
`_next/image`).

**The names cost no extra query.** React's `cache()` dedupes a call within one render pass, and a
layout and its page render in the same pass — so the layout asking for the prompt's name and the
page asking for the same prompt resolve to **one** database round trip. This is the same shape as
`requireSession`, which the layout and every page already both call, and whose comment already says
why that is cheap. A test asserts the dedupe by counting calls; without it the claim is a guess.

## Files

**New**
- `packages/ui/src/app-shell.css` — the rail, the top bar, the shell grid, the mobile disclosure.
- `apps/web/app/app/app-rail.tsx` — the rail, pure, no data access.
- `apps/web/app/app/app-topbar.tsx` — breadcrumbs, version pill, Theme, Website, primary action.
- `apps/web/app/app/rail-icons.tsx` — the mockup's nine SVGs, verbatim.
- `apps/web/lib/app-shell/context.ts` — pathname → `{ projectId?, promptId?, current }`, pure.
- `apps/web/lib/app-shell/context.test.ts`
- `apps/web/lib/app-shell/names.ts` — `cache()`d project and prompt name lookups.
- `apps/web/lib/app-shell/names.test.ts` — including the dedupe count.
- `apps/web/app/app/app-rail.test.tsx`, `app-topbar.test.tsx`
- `apps/web/e2e/app-shell.spec.ts`
- `scripts/drive-epic-023.mts`

**Changed**
- `apps/web/proxy.ts` — forward `x-41p-path`.
- `apps/web/app/app/layout.tsx` — render the shell; `.app-chrome` goes.
- `packages/ui/src/styles.css` — import the new sheet.
- `packages/ui/src/canvas.css` — delete the `.app-chrome*` rules the layout no longer uses.
- The ten pages carrying `.app-crumb` — **see the scope note below.**

## The one scope exception, stated up front

The epic puts "any page's body" out of scope. Ten pages render their own `.app-crumb` line, and the
top bar now renders a breadcrumb trail. Leaving both ships **two breadcrumbs on ten pages**, which
is a visible defect, not a smaller version of the feature.

So the `.app-crumb` element is removed from those ten pages and nothing else in them is touched.
That is a one-line deletion per page, it is chrome rather than composition, and it is named here
rather than discovered in review. `.app-pagehead-actions` **stays** — EPIC-024 owns it.

## Order of work

1. `lib/app-shell/context.ts` + tests. Pure, no framework — the route table is data.
2. `proxy.ts` forwards the path; a test asserts the header survives.
3. `lib/app-shell/names.ts` + the dedupe test.
4. `rail-icons.tsx` — copy the nine SVGs from mockup lines 1046–1060.
5. `app-rail.tsx` + `app-topbar.tsx`, pure components taking everything as props, unit-tested in
   both the "no context", "project context" and "prompt context" states.
6. `packages/ui/src/app-shell.css`, ported from mockup lines 148–173 onto the token set.
7. `layout.tsx` wires it; `.app-chrome` and its CSS are deleted.
8. Remove the ten `.app-crumb` lines.
9. `e2e/app-shell.spec.ts` — group sets, `aria-current`, keyboard, 390px overflow, 44px targets.
10. `scripts/drive-epic-023.mts` — **one session reaching all nine destinations without typing a
    URL.** If it cannot, the rail is not done.

## Decisions taken before writing code

1. **Links, not buttons.** The mockup uses `<button data-app=…>`; every rail item navigates, so each
   is an `<a>` with `aria-current="page"` (not the mockup's `aria-current="true"`, which is invalid
   on a link).
2. **`Lessons` is not in the rail.** Stage 7. A rail item to a 404 is what EPIC-016 refused.
3. **`Import` links to the public decompiler** on the apex via `siteOrigin()`, until EPIC-025 gives
   it an in-app home. It is the import path that exists.
4. **The rail foot shows the email and Sign out, and no plan or quota.** The mockup's
   `Pro · 4,120 runs left` is two things that do not exist.
5. **The version pill is neutral ink.** `Draft vN`, and `Draft vN · Live vM` when published.
   `docs/design/README.md` corrects the mockup's amber `v7 · unsaved` on both counts.
6. **Mobile is a `<details>` disclosure**, not the mockup's stacked column. Server-rendered, so
   `ThemeToggle` stays the shell's only client component.
7. **The skip link targets `#main`**, which every page already provides, so it skips the rail.

## Risks

- **`cache()` not deduping** because the layout and page end up in different render passes. The test
  counts calls; if it shows two, the fallback is to accept two reads and say so in the report rather
  than thread a prop through ten pages.
- **`z-index`.** The top bar is sticky and the consent banner is fixed. The banner must stay on top.
- **`overflow.ts` at 390px** — EPIC-072's nav put itself 185px past the viewport and every
  assertion passed. Run the sweep over every `/app` route, not one.
