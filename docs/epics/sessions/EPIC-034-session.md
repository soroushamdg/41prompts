<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: Apache-2.0
-->

# Session · EPIC-034 · Activation onboarding

Date: 2026-09-15 · Branch `epic/034-activation`

## Prompt sent

"continue" — the third epic of one session, after EPIC-032 and EPIC-033. The standing instruction is
Soroush's of 2026-09-15: build the next epic, nothing is pushed, skip what needs a person.

## Plan summary

No epic file existed, so one was written first. It took longer than the code did, and the reason is
§1 of the report: **this epic's goal cannot be met in production**, and finding that out before
writing anything changed what the epic was for. Had it been discovered halfway through, the natural
move would have been to quietly redefine success. Written at the top of the epic file, it instead
became the thing the epic is honest about.

Then `docs/epics/plan-EPIC-034.md`, then the code, in the order the plan gave: the pure modules
first (the example's content, the derived progress), then the action, the events, the UI, the timed
test, the drive.

## The tension I had to settle, and how

**Soroush ruled on 2026-09-14 that seeded starter bloks are not owed** — an empty state does the job
"without fabricating someone's content". `docs/roadmap.md`'s EPIC-034 line asks for "a seeded prompt
(three templates)". Those are in direct conflict, and the roadmap line is the older of the two.

The ruling wins, and decision 1 draws the line where the ruling's own reasoning puts it: **content
put into your prompt without asking** is what was ruled out, and it stays out — a prompt made by
hand is still empty, asserted by a test that would fail if it ever gained a blok. **An example a
person pressed a button to get, named as an example**, is a different act: nobody's words are put in
their mouth.

Narrowed to one example rather than three, for the same reason: three is three times the fabricated
content for nothing extra learned.

## Two things the example taught me about my own design

**1. The first example could never have passed.** It ended with `{{question}}`, and the fake echoes
the last line, so the answer *was* the input row — no edit to the prompt could change the result, and
step four of the journey was unreachable. Caught by writing the e2e, not by thinking about it.

**2. The example passed its own check.** The apology blok said `Sorry`; the rule forbids `"sorry"`;
`must_not_contain` uses `String.includes`. **The onboarding's first run would have gone green** and
demonstrated nothing. Caught by a test that compiles the real content and grades it, which is the
only kind of test that could have caught it — reading the two strings is exactly what a person does
successfully every time.

That second one is also a live product question and the report raises it: today a rule against
`"sorry"` silently produces false passes on `Sorry`, which is the failure mode this product exists
to prevent.

## The defect the drive found, which no test would have

`run-history.tsx` put a **pass tick on a run whose check had failed** — it only asked whether the
run reached `done` without a refusal. Shipped in EPIC-032, walked past by three e2e specs because
they all assert on the detail page.

It was found by opening a screenshot and looking at it. That is the second epic running in which the
drive earned its place by catching something the suite structurally could not, and it is worth
noting *why*: a test asserts what somebody thought to assert, and nobody thinks to assert the icon
on a list row they were not writing.

## What took longer than expected

Three rounds of small, self-inflicted friction rather than one big problem:

- `label` is an ADR-003 forbidden word and I used it for a UI step, twice — once as a field name and
  once as a file name. `pnpm forbidden-words` caught both, which is what it is for.
- `border-radius: 4px` is forbidden by the design-token contract test. Also caught, also correct.
- **A manually started server poisoned a later `pnpm e2e`.** The drive's server runs without
  `E2E_RATE_LIMIT_OFF`, `reuseExistingServer` picked it up, and four `beforeAll` sign-ins hit the
  rate limit — the exact symptom EPIC-032 spent two rounds diagnosing, arriving from a new
  direction. **Kill the drive's server before running the suite.**

## Verification

```
pnpm test  8/8    pnpm typecheck  8/8    pnpm lint  11/11    pnpm e2e  204 passed, 4 skipped
node scripts/gates.mjs ci        16/16
node scripts/drive-epic-034.mjs  14/14, 9 screenshots, journey in 7.4s of 300s
```

## Open questions

Report §6. The one to read first: `must_not_contain` is case-sensitive, and that produces false
passes on exactly the kind of rule people write.
