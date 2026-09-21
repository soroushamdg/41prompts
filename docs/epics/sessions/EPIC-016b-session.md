<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# EPIC-016b session — 2026-09-21

**Prompt.** `prompt_continue`, with an instruction to read `docs/epics/EPIC-016b-HANDOVER.md` first
and to take the next row from `docs/epics/plan-mockup-parity.md` rather than from `docs/backlog.md`.

**Where it started.** Mid-epic. A previous session had shipped four illustrative surfaces and the
`Example` marker (`f0c0a19`) and then ended, leaving a handover that named steps 3 to 5 of the plan
as outstanding: the rotator, the Ask-AI chips, the motion, Lighthouse either side, and the two Linux
visual baselines.

## The thing that paid for itself before any code

**Reading the guards before writing anything that had to pass them.** `page.test.tsx`,
`site-claims.test.tsx`, `claims.test.ts` and `token-contract.test.ts` between them decide what a
sentence, a number, a colour and a custom property on this page are allowed to be. Three decisions
came straight out of that reading rather than out of a failing run later:

- the rotator's panels are registry claims and carry no figures, so nothing there needs an
  `Example` marker;
- `--i` and every other custom property is **defined** in a CSS rule as well as read, because
  `token-contract.test.ts` fails on a `var()` that resolves to nothing;
- the rotator is a client component that takes **strings**, because `lib/site/claims.ts` imports
  the retention constants from `@41prompts/db` and importing it into a client bundle would drag
  Drizzle into the browser.

## Decisions taken while building

Logged in `docs/decisions/AUTONOMOUS.md`; the report has the arguments.

1. **"Deliver", not the mockup's "Learn"** — no lessons exist and the word is denylisted.
2. **Stops on click rather than restarting the cycle** — the epic's Scope prose and its acceptance
   criterion disagree, and the criterion is both what the tests assert and the accessible answer.
3. **Three registry sentences answer the three counters one for one**, rather than the counters
   being dropped without replacement.
4. **The rotator and the proof row sit after the provider comparison**, not where the mockup puts
   them — the built page already had the three-step strip early, and "the whole loop" reads as the
   summary before the closing call.
5. **The meters stay ink.** Green and red would be correct usage under rule 10 and this is still not
   the page to make the first exception on.
6. **The `Tabs` primitive gained `orientation`** rather than the rotator growing its own tablist.

## What took longer than expected

**A 116px sideways scroll at 390px that had nothing to do with the new sections.** `.site-two` has
shipped a `1fr` track since EPIC-072, and `1fr` is `minmax(auto, 1fr)`: the first `.data-table` to
land in one of those columns sized the column to its 480px `min-width`. It took one measurement to
find and one line to fix, and it would have taken much longer from the screenshot alone — the page
*looked* fine, because the overflow was off the right-hand edge.

**Two compiled-code traps in the drive, back to back.** esbuild's `keepNames` putting a `__name`
call inside a `page.evaluate`, and `locator.evaluate` silently not calling a string. The second is
the nastier one: it returned `undefined` and the check still printed like a measurement.

## The lesson worth keeping

**A test that compares two clock readings is asserting the schedule, not the behaviour.**

The `Replay` check read the walk's `currentTime`, clicked, read it again, and asserted the second
number was smaller. It passed in `pnpm e2e` and failed in the drive, for no reason that had
anything to do with `Replay`: the drive runs with `slowMo` on, so it arrived after the animation had
already finished, and "before" read as zero. The same assertion in the e2e suite was 360ms from the
same failure and nobody would have known why when it eventually flaked.

What the control claims is *after the click there is a walk and it is at its beginning*. Asserting
that is both simpler and immune to how long everything before it took. The first version was
measuring the test's own timing and reporting it as a property of the product.

There is a smaller version of the same lesson in §4.3 of the report: axe failed on a row that was
mid-fade, and the honest reading is not "axe sampled at a bad moment" but "there is a moment at
which this text is under 4.5:1". Both are cases where the instrument was right and the thing being
measured was wrong.

## Verification output (tail)

```
pnpm test        9 checked, 9 passed (1371 tests)
pnpm typecheck   9 checked, 9 passed
pnpm lint        12 checked, 12 passed
pnpm compliance  REUSE compliant · 217 modules cruised · 215 files in 4 packages · 289 pytest
pnpm dead-code   929 exported values across 619 source files, none orphaned
playwright       landing.spec.ts 44 passed, 2 skipped (Linux-only)
                 dev-ui + site-pages 71 passed, 2 skipped
lighthouse       17 routes, lowest category score 94, `/` at 98/100/100/100
linux baselines  4 passed in mcr.microsoft.com/playwright:v1.63.0-noble
drive            21/21
```

## Open at the end of the session

The report's §8 has all four. The two worth a second look are the Lighthouse spread — the
instrument is noisier on this machine than the change it was asked to measure, which is worth
knowing before anybody quotes a single number from it — and the rotator's stop-on-click behaviour,
which is a one-line reversal if the Scope prose was the intent rather than the criterion.

`docs/epics/EPIC-016b-HANDOVER.md` is deleted by the same commit as this file. It was a handover
for a session that has now finished, it says in its own first line that nothing in it is a
Definition-of-Done claim, and leaving it beside a finished report would be two documents disagreeing
about whether this epic is done.
