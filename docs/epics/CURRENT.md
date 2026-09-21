<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# No epic is in progress — EPIC-016d is merged

**EPIC-016d closed sixteen of the twenty-three landing-page differences**, including all four that
were waiting on Soroush. Merged into local `main` as `8a552eb` on a green
`node scripts/gates.mjs ci` (17 of 17, on `ab6e5f6`). Report
`docs/epics/reports/EPIC-016d-report.md`.

The four answers, 2026-09-21, because they are decisions and not just history:

| | question | answer |
|---|---|---|
| B7 | the trust row of five invented customers | **Leave it out** |
| D1 | the three fabricated counters | **Keep the three true sentences** |
| B2 | the hero headline | **Restore the mockup's** — *"Stop guessing which prompt works."* |
| C2 | blok kind colour | **EPIC-021a's palette, made persistent** |

Two of them were "build nothing", so **EPIC-016e does not exist** — the only thing left of it was
the headline, and that landed here.

## What is merged into local `main`, and not pushed

EPIC-023 (app shell), EPIC-024 (page composition), EPIC-016b (the home page in full), EPIC-016c
(the rotator), EPIC-016d (the rest of the landing page). All five `gates.mjs ci` green.
`origin/main` is far behind; **no staging URL is evidence about any of it**, and
`docs/epics/RELEASE-DUE.md` has been waiting since 2026-09-20.

## What is left on the landing page, and none of it is a decision

Seven differences, each of them a page that does not exist. `docs/epics/plan-landing-parity.md`
has the table; the short version:

| waits on | closes |
|---|---|
| **EPIC-072b** About and Careers · S | E3 |
| **EPIC-070** Stripe and the pricing page · M | A2, D4's second button, E1 |
| **EPIC-073b** the blog, with real posts · S | half of E2 |
| **Stage 7** — EPIC-064, 060, 061, 062, 063 | A3, D3, the other half of E2 |

EPIC-016's rule holds for all of them: *a nav link to a 404 is worse than no nav.*

## What comes next

`docs/epics/plan-mockup-parity.md` is the sequence and supersedes `docs/backlog.md` for this
programme — the backlog does not know it exists, because `CLAUDE.md` reserves that file for
Soroush. Its next unbuilt row is **EPIC-072b: About and Careers, honest**, which is written, scoped
and carries two rulings already on file from 2026-09-20. `PROMPT_CONTINUE` says to pick the next
epic from the backlog; for this programme, pick it from there.

## Three things that are Soroush's, not the next session's

1. **`docs/epics/RELEASE-DUE.md`.** Five epics have merged since the last push.
2. **The run demo's heading says "Six checks" over five rows** — the mockup's own copy, shipped in
   EPIC-016b and deliberately out of scope for EPIC-016d rather than re-decided quietly. One line
   either way: the heading becomes "Five checks", or the table gains a row.
3. **`See the workbench` goes to `/features`, not to the workbench.** The mockup sends it to the
   signed-in editor, which for a signed-out reader is a sign-in wall. If he wants the mockup's
   destination, it is one href.
