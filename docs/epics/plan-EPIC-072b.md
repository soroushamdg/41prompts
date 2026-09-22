<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# Plan — EPIC-072b: About and Careers, said honestly

Branch `epic/072b-about-and-careers`. Epic file `docs/epics/EPIC-072b-about-and-careers.md`.
Sequence: `docs/epics/plan-mockup-parity.md` row 4.

## What this is, in one paragraph

Two pages. `/about` says who is behind this — **one person** — and where it started. `/careers`
says there is nothing open and where to leave your name. Both are linked from the footer, both are
in the four files that decide what the public site is, and both are under every guard the six
EPIC-072 pages are under. The whole of the difficulty is **not saying anything untrue**, and the
repository already has the instruments that enforce that; most of this plan is about pointing them
at two more pages rather than about writing two pages.

## The facts this epic rests on, each checked rather than recalled

| | claimed | checked |
|---|---|---|
| The year the project started | the mockup says `2025` | `git log --reverse` → **2026-09-03**, `2134832`. So **2026**. |
| A second co-founder | the mockup names one | Soroush, 2026-09-20: *not a current co-founder, omit the name.* |
| Three open roles | the mockup lists three | Soroush, 2026-09-20: *not real. Closed.* |
| A contact channel | the mockup prints `hello@41prompts.ai` | `apps/web/app/contact/page.tsx` says in as many words **there is no support address yet**; the waitlist on `/decompile` is the one channel that works. `/careers` must point at that, not invent a mailbox. |

## The traps, found by reading the guards before writing the pages

These are the five ways this epic fails the build, all of them found by reading the tests rather
than by running them.

1. **`site-claims.test.tsx`'s `UNBACKED` contains `/\bopen (?:roles|positions)\b/i`.** The epic's
   own acceptance criterion — *"states plainly that there are no open roles"* — is written in a
   phrase the guard forbids. The guard is right and the criterion's wording is not binding on the
   page: **"No roles are open right now."** says the same thing and does not match. This is the
   single most likely way to write the page and fail.
2. **`not-true-yet.ts` holds `["a team", /\bco-founders?\b|\bour team\b|\bwe are hiring\b/i]`.**
   Neither the pattern nor its control (*"Co-founder. Engineering."*) is removed — the epic file
   says so explicitly. `Founder` alone does not match. `our team` does, so the page says
   *41Prompts* or *I*, never *our team*.
3. **`site-pages.spec.ts` asserts `/careers` answers 404**, as the control proving the two chrome
   walks can report a 404. That control is load-bearing and must not simply be deleted: `/pricing`
   stays a 404 until EPIC-070, so it carries the control alone, and a second route that will never
   exist is added beside it so the control is not one assertion away from being vacuous again.
4. **`links.test.ts` forbids duplicate footer destinations, and `.site-foot-grid` is
   `1.6fr repeat(4, 1fr)` at ≥940px** — exactly four groups. The mockup's `Company` group is
   About · Careers · Security · Contact; `Security` is already in `Resources` and `Contact` is the
   only member of `Elsewhere`. So `Elsewhere` **becomes** `Company` and gains the two new pages.
   Four groups in, four groups out, no CSS change, no duplicate href.
5. **`site-claims.test.tsx` fails on any digit nobody explained.** `/about` prints `2026` and
   `41Prompts`; `2026` and `41` are both already in `EXPLAINED_NUMBERS`, but `2026`'s reason says
   *"the year in the footer's © line"* and will now be two things. The reason gets updated, because
   a reason that is half-true is the thing that list exists to prevent.

## The changes, file by file

### New

| file | what |
|---|---|
| `apps/web/app/about/page.tsx` | eyebrow, the mockup's headline, the origin paragraph with the year corrected, **one** person card, and a short closing section that links to `/features` and `/security` rather than asserting anything new. |
| `apps/web/app/careers/page.tsx` | eyebrow, a headline that is the answer, a card that says what is open (nothing) and what to do about it, and the honest contact route. |
| `apps/web/app/company-pages.test.tsx` | the unit guards the acceptance criteria name: no `co-founder`, no `our team`, exactly one person, careers says what it says, both pages carry the chrome. Every absence assertion paired with the mockup's own sentence as its positive control. |
| `scripts/drive-epic-072b.mts` | the watched drive, IDE preview pane + visible browser, `DRIVE_HEADLESS=1` honoured. |

### Changed

| file | what | why |
|---|---|---|
| `apps/web/lib/site/links.ts` | `Elsewhere` → `Company`, gaining About and Careers | trap 4 |
| `apps/web/lib/site/public-routes.json` | `/about`, `/careers` into `indexed` | the one list four readers derive from — sitemap, robots agreement, Lighthouse, the e2e walk |
| `apps/web/app/sitemap.ts` | a priority and a change frequency for each | anything unlisted silently gets 0.3/yearly; these are editorial and belong written down |
| `apps/web/app/robots.ts` | both into the enumerated allow list | `Allow: /` already covers them; the list is a readable statement of what the site is, which is its only job |
| `apps/web/app/site-page.tsx` | `current` becomes optional | neither page is a nav entry, and `SiteNav` has always taken `current?` — only `SitePage` required it |
| `apps/web/app/site-claims.test.tsx` | both pages into `PAGES`; `2026`'s reason widened | trap 5, and so the denylist, the numbers rule and the h1/skip-link rules cover them |
| `apps/web/e2e/site-pages.spec.ts` | the 404 control rewritten; both routes into the axe + 390px sweep | trap 3, and EPIC-072's four found defects are the checklist for any new public page |
| `apps/web/lib/site/changelog.ts` | EPIC-072b into the Stage 6 row | `changelog.test.ts` walks `docs/epics/reports/` in reverse and fails on a report no row mentions |

### Deliberately not changed

- **`claims.ts`.** Nothing on either page is a claim in that registry's sense. Its contract is
  *a sentence a reader could hold us to* that names **the epic that shipped the behaviour** and
  **a path where the behaviour lives**; "41Prompts started in Montréal in 2026" has neither, and
  forcing it in would mean inventing an evidence path. The epic's scope says *"into the claims
  registry **where they make a factual statement**"* — where the pages do make a product claim they
  render an existing registry entry rather than a new string, which is the same protection without
  corrupting the registry. Logged in `docs/decisions/AUTONOMOUS.md`.
- **`not-true-yet.ts`.** The epic file rules explicitly that neither the pattern nor its control
  moves. EPIC-070 is the epic that removes one, and it removes a different one.
- **`/contact`.** Out of scope. `/careers` links to it.

## Order of work

1. This plan, committed.
2. `links.ts`, `public-routes.json`, `sitemap.ts`, `robots.ts`, `site-page.tsx` — the plumbing,
   which fails loudly and immediately if a page is missing.
3. The two pages.
4. The unit tests, then `site-claims.test.tsx` and `site-pages.spec.ts`.
5. `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm forbidden-words`. Commit.
6. Build, `next start`, `pnpm e2e`, `node scripts/lighthouse-site.mjs`, the drive. Screenshots into
   `docs/epics/reports/screenshots/EPIC-072b/`.
7. Changelog row, report, session log, decisions. Commit.
8. `node scripts/gates.mjs ci` on that commit. Record what its closing block does not cover.
9. `git merge --no-ff` into local `main`. No push, no PR.

## What this plan already knows it cannot do

- **Nothing is pushed**, so no deployed page shows either of these and no staging URL is evidence
  about them. The report says so in its own section.
- **Lighthouse needs a real browser and minutes**, so it runs by hand during the drive, not in the
  gate — `scripts/lighthouse-site.mjs`'s own header carries that argument.
- **The four visual baselines skip on darwin.** Neither new page has one, and none is being added:
  a baseline is a committed Linux PNG and generating one is a deliberate act in a container
  (`PROCESS.md`, "Visual-regression baselines"). Both pages are covered by axe and the 390px
  overflow sweep instead, which is what EPIC-072's six pages have.
