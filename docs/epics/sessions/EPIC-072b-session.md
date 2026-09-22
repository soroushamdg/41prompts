<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# Session — EPIC-072b

**Date** 2026-09-21. **Branch** `epic/072b-about-and-careers`.

## The prompt

`prompt_continue`, read and run. It names the reading order — `CLAUDE.md`, `docs/PROCESS.md`,
`docs/AUTONOMOUS.md`, `docs/epics/CURRENT.md`, `docs/backlog.md`, `docs/decisions/AUTONOMOUS.md` —
then says to work out where the project is from git and the filesystem rather than from any of
those, pick up the next epic, and build it to the Definition of Done.

`CURRENT.md` said no epic was in progress, that EPIC-016d had merged, and that for the
mockup-parity programme the next epic comes from `docs/epics/plan-mockup-parity.md` rather than
from `docs/backlog.md` — *"the backlog does not know it exists, because `CLAUDE.md` reserves that
file for Soroush."* That file's next unbuilt row is EPIC-072b, and its epic file was already
written. Nothing to invent.

## Where the project was, read rather than recalled

```
git log --oneline -15      → 06bbe1f docs: EPIC-016d is merged, and CURRENT.md says so
git status                 → clean
git log origin/main..main  → 48 commits, none pushed
ls docs/epics/reports/     → 49 reports; no EPIC-072b
```

## The plan, and what it got right before any code

`docs/epics/plan-EPIC-072b.md`. It was written by **reading the guards first**, and that was worth
doing: four of its five predicted traps were real and each would have cost a round trip.

| predicted | what happened |
|---|---|
| the epic's own criterion phrase is refused by `UNBACKED` | true — the page says "No roles are open right now" instead |
| `not-true-yet.ts` refuses `\bour team\b`, and neither pattern may be removed | true — "Founder" checked against `\bco-founders?\b` before the line was written |
| `site-pages.spec.ts` asserts `/careers` is a 404 | true — the control was rewritten rather than deleted |
| four groups is what `.site-foot-grid` has room for | true — `Elsewhere` renamed rather than a fifth group added |
| `2026` is already in `EXPLAINED_NUMBERS` but its reason will be half-true | true — reason widened in the same commit |

**What the plan missed: a fifth reader of the route list.** `PUBLIC_PATHS` in
`apps/web/lib/site/hosts.ts`. `hosts.test.ts` failed on the first full run of the web suite, about
two minutes after the pages existed. Nothing was broken — everything outside `APP_PATHS` is
marketing by default — but the classification was missing, which is the only thing that list is
for. Report §5.

## What took longer than expected, and it is the epic's finding

**Looking at the drive's screenshots**, which is the step that cannot be hurried and where the two
real findings came from.

1. `/careers` line 15 read "How to reach a person" and the picture showed it looking exactly like
   the two headings above it. **The instinct was to reason about it; the rule is to probe it.** Ten
   lines of `getComputedStyle` over every public route produced 13 of 13 prose links with the same
   colour, the same weight and no underline as their surroundings — on seven pages, five of them
   belonging to other epics.

   `axe` cannot see that class: `link-in-text-block` fires on a link distinguished *by colour
   alone*, and these are distinguished by nothing. Nine pages had been axe-clean and
   Lighthouse-100 over it since EPIC-072.

   The mockup had already ruled — global `text-decoration:none`, then `underline` inline on every
   link inside a sentence — so the fix is parity rather than a new decision. It is now a walk over
   every route in `site-pages.spec.ts`, with a control that injects the defect, and it was proved
   to fire: remove the rule and 7 of 20 fail, exactly the seven pages the measurement named.

2. `/about`'s person card passed every assertion and **looked unfinished** — a 1200px box holding
   two short lines. Moved to the `.site-row` idiom. This is precisely the case the browser drive
   exists for, and it is the third epic running where the drive found something the tests could
   not.

## Decisions

Seven, appended to `docs/decisions/AUTONOMOUS.md`: no new claims-registry entry and why the epic's
clause is still satisfied; `Elsewhere` → `Company` rather than a fifth group; the `open roles`
phrasing; one person, 2026, first person; fixing the link defect now rather than reporting it; the
person card's idiom; and the 404 control's replacement.

## Verification, tails

```
pnpm --filter @41prompts/web exec vitest run
  Test Files  62 passed | 4 skipped (66)
  Tests       1481 passed | 56 skipped (1537)

pnpm typecheck        9 checked, 9 passed
pnpm lint            12 checked, 12 passed   (incl. dependency-cruiser, turbo boundaries, forbidden words)
pnpm dead-code       935 exported values, 0 orphaned, 0 allowed by name
pnpm binary-files    1193 checked in full, no NUL byte

pnpm e2e             394 passed, 4 skipped (9.5m)
                     the 4 are the Linux-only visual baselines; the skip reporter names them

npx playwright test site-pages -g "links in running text"
                     20 passed  —  and 7 failed with the CSS rule removed, which is the proof

Linux baselines      mcr.microsoft.com/playwright:v1.63.0-noble, maxDiffPixelRatio: 0
                     landing-light  693 px of 6,571,520   (budget 65,715)
                     landing-dark  3,253 px of 6,571,520
                     both unchanged; /dev/ui pair byte-identical

drive                20/20 against the built app, watched, screenshots in the report

node scripts/lighthouse-site.mjs http://127.0.0.1:3131
| route | perf | a11y | bp | seo |     | route | perf | a11y | bp | seo |
|---|---|---|---|---|                  |---|---|---|---|---|
| /                        | 98 | 100 | 100 | 100 |   | /about                   | 96 | 100 | 100 | 100 |
| /features                | 99 | 100 | 100 | 100 |   | /careers                 | 96 | 100 | 100 | 100 |
| /delivery                | 95 | 100 | 100 | 100 |   | /legal/terms             | 96 | 100 | 100 | 100 |
| /docs                    | 96 | 100 | 100 | 100 |   | /legal/privacy           | 96 | 100 | 100 | 100 |
| /security                | 99 | 100 | 100 | 100 |   | /legal/security          | 99 | 100 | 100 | 100 |
| /changelog               | 99 | 100 | 100 | 100 |   | /legal/sub-processors    | 96 | 100 | 100 | 100 |
| /guides                  | 96 | 100 | 100 | 100 |   | /legal/third-party-notices| 98 | 100 | 100 | 100 |
| /guides/what-your-…      | 95 | 100 | 100 | 100 |   | /contact                 | 99 | 100 | 100 | 100 † |
| /decompile               | 99 | 100 | 100 | 100 |   | /sign-in                 | 96 | 100 | 100 | 100 † |
                                                      | /sign-up                 | 96 | 100 | 100 | 100 † |
† SEO recomputed without `is-crawlable` — disallowed in robots.txt on purpose, EPIC-015.
```

The `gates.mjs ci` run and its closing block are report §10 and the commit that follows this file.

## Open questions for Soroush

Report §12, three of them: `RELEASE-DUE.md` (six epics since the last push), whether `/about`
should end on the "if I stop" section or on a mission sentence, and whether `/careers` should exist
at all rather than 404 — which the epic file itself flags as an assumption to correct if wrong.

## For the next session

- **`docs/epics/plan-mockup-parity.md` row 5 is `EPIC-070` — Stripe and the pricing page, size M.**
  It is the one row that *removes* a `NOT_TRUE_YET` pattern (the per-seat price becomes true because
  it becomes enforced), deleting the denylist row and its control together with the reason in the
  commit message. It also needs product ids and an API key from Soroush, which makes it a candidate
  for the "skipped, not blocked on" rule — read the epic file before starting.
- **`/pricing` is now the sole 404 control** in `site-pages.spec.ts`'s chrome walk, alongside a
  route that is on no roadmap. EPIC-070 will build `/pricing`; leave the second one alone.
- The prose-link rule in `packages/ui/src/landing.css` **enumerates containers**. A new page that
  puts a link inside a container not on that list will fail `site-pages.spec.ts`'s walk with the
  link's own text in the message. Add the container, do not blanket `main a` — the mockup leaves
  wordmark- and button-shaped links bare on purpose.
