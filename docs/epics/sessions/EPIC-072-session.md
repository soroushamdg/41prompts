<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# Session log — EPIC-072, 2026-09-18

**Prompt.** Soroush: *"read the file prompt_continue and run it"* — the standing autonomous prompt:
read `CLAUDE.md`, `docs/PROCESS.md`, `docs/AUTONOMOUS.md`, `CURRENT.md`, `docs/backlog.md` and
`docs/decisions/AUTONOMOUS.md`, work out where the project is from git rather than from the docs,
then pick up the next epic and build it to Definition of Done.

**Where the project actually was.** Local `main` at `576fb1f`, clean, **109 commits ahead of
`origin/main`**. Stage 5b closed with EPIC-056 on 2026-09-18; every stage through 5b has a report.
`scripts/pick-next-epic.mjs` printed `GATE: ▣ GATE 3`, which is the stale-status-cell stop both
`GATE-3.md` and `GATE-5.md` predict in writing — both gates are decided *Go* and every epic behind
them has already shipped. So nothing was actually gated, and the next buildable row was **EPIC-072**,
which `docs/epics/HANDOVER.md` also names as the one Stage 6 row whose dependencies are done.

## Plan summary

`docs/epics/plan-EPIC-072.md`. Registry first, pages out of it — a page written freehand and audited
afterwards is a page whose next copy edit is unaudited.

## Decisions, and why

All are in `docs/decisions/AUTONOMOUS.md` as single lines. The three that shaped the epic:

1. **Six pages, not eleven.** `/pricing`, `/learn`, `/blog`, `/about` and `/careers` are refused,
   each because its content is a fact this repository does not hold — a price with no checkout, nine
   lessons that do not exist, six fabricated posts, a second co-founder, three invented jobs. Stated
   in the epic file's Out of scope **before** any code, per `CLAUDE.md`'s "do not reinterpret
   silently".
2. **The Review line is the deliverable.** `apps/web/lib/site/claims.ts` plus three tests, rather
   than six pages and a closing audit.
3. **One epic, not a split.** It is an M and the row exists; splitting would have meant a `072b` row
   in `docs/backlog.md`, which `docs/AUTONOMOUS.md` forbids a run from adding.

## What took longer than expected

**The nav.** Adding four links to it cost more than writing three of the pages. It put the nav 185px
past a 390px viewport, and since the nav is on every public page that made *every* page scroll
sideways — seventeen e2e failures across three spec files, two of them belonging to EPIC-016 and
EPIC-017. Ten minutes went into reading the failures as seventeen problems before the probe made it
one. `docs/PROCESS.md`'s "probe the thing" is right and I applied it late: a twenty-line Playwright
script printing every element wider than the viewport answered it immediately, and the mockup's own
CSS already had the fix.

**Three separate baseline regenerations** were nearly needed. The chrome moved twice — once for the
nav, once for the footer grid the drive screenshot showed wrapping — and the two landing baselines
are Linux-only, so nothing local says they are stale. Batching the second and third change into one
container round trip saved about ten minutes; noticing that only after doing the first one did not.

## The verification tail

```
node scripts/gate-run.mjs                     16 step(s), all passed, 11m14s   (at 5a8dffa)
pnpm test                                     9 checked, 9 passed · database: throwaway container
pnpm typecheck                                9 checked, 9 passed
pnpm lint                                     12 checked, 12 passed
pnpm e2e                                      319 passed, 4 skipped on darwin
npx tsx scripts/drive-epic-072.mts            18/18 checks passed
node scripts/lighthouse-site.mjs              17 routes, every category at or above 90
node scripts/third-party-notices.mjs --check  third-party notices are current
node scripts/binary-files.mjs                 1086 checked in full, no NUL byte   (exit 0, read directly)
```

## What I would tell the next session

1. **`public-routes.json` is the route table now.** `links.ts`, `sitemap.ts`, the Lighthouse runner
   and `routes-agree.test.ts` all read it, and that test fails if any of them grows its own copy. It
   exists because `sitemap.ts` had a hand-written list and simply did not mention six live pages.
2. **The claims registry is not decoration.** A page may only render a sentence that is in it. If you
   want new copy, add the claim with the epic that shipped it and the path to the evidence — and if
   you cannot name one, that is the test telling you something.
3. **`changelog.test.ts` will fail on your epic** the moment its report file exists, unless you add a
   row or declare it invisible with a reason. That is deliberate and it is the half of a changelog
   that usually rots.
4. **Lighthouse is run by hand, not by `gates.mjs`.** `scripts/lighthouse-site.mjs` against the built
   app. It exits non-zero, so read `$?` rather than the table (lesson 33).
5. **The `is-crawlable` adjustment is not a waiver.** Read the both-directions check in that script
   before touching it; one-way it would hide a page silently dropping out of search.
6. **A spelled-out count is a claim the digit guard cannot see.** "Twelve things this does today"
   went stale within the session. Prefer a lede with no number in it.
7. **`packages/db` is imported by `claims.ts`** for the three retention constants, the way
   `lib/site/legal.ts` already did. Retention numbers are never retyped.

## Open questions

All in the report's §11, all Soroush's: `/about` and `/careers` need facts only he has; `/pricing`
waits on EPIC-070; the two gate status cells; and the release, which is now twelve epics overdue.
