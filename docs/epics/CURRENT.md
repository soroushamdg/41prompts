<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# No epic is in progress — EPIC-072b is merged

**EPIC-072b built `/about` and `/careers`**, merged into local `main` as `57b6a8b` on a green
`node scripts/gates.mjs ci` (17 of 17 on `8a4944e`). Report
`docs/epics/reports/EPIC-072b-report.md`.

Both pages say only what is true: **one person, in Montréal, since 2026**, and **no roles open**.
The mockup's second co-founder, its 2025 date and its three invented openings are all gone, and the
footer's `Elsewhere` group became the `Company` group the mockup draws.

## The finding, and it is on neither page

The drive measured **thirteen links across seven pages** — five of them built by other epics —
rendering with the *same colour, the same weight and no underline* as the text around them. Not
"distinguished only by colour", which is the WCAG failure everybody quotes. Distinguished by
nothing at all.

`axe` cannot see that class by construction: its `link-in-text-block` rule fires on a link
differing *by colour alone*. Nine pages had been axe-clean and Lighthouse-100 over it since
EPIC-072. The mockup had already ruled — global `text-decoration:none`, then `underline` inline on
every link it puts inside a sentence — so ours had taken half of it. It is a walk over every public
route now, with a control that injects the defect, and it was proved to fire.

## What is merged into local `main`, and not pushed

EPIC-023, EPIC-024, EPIC-016b, EPIC-016c, EPIC-016d and now EPIC-072b. All six `gates.mjs ci`
green. `origin/main` is far behind; **no staging URL is evidence about any of it**, and
`docs/epics/RELEASE-DUE.md` has been waiting since 2026-09-20 — six epics now, not three.

## What comes next

`docs/epics/plan-mockup-parity.md` is the sequence for this programme and supersedes
`docs/backlog.md` for it. Its next row is **EPIC-070: Stripe and the pricing page · M**, and it is
the one row in the programme that **needs Soroush**: the ruling of 2026-09-20 is *"build it now at
the mockup's prices, and build Stripe underneath it — Soroush supplies the product ids and the API
key."*

Read it against `docs/AUTONOMOUS.md`, "Rows whose dependency is a person", before starting. It is
also the row that *removes* a `NOT_TRUE_YET` pattern: once Stripe enforces the price, the per-seat
claim becomes true and the denylist row and its control are deleted **together**, in one commit,
with the reason in the message. That is the test working, not the test being worked around.

## Three things that are Soroush's, not the next session's

1. **`docs/epics/RELEASE-DUE.md`.** Six epics have merged since the last push.
2. **Two questions from EPIC-016d are still open**: the run demo's heading says "Six checks" over
   five rows, and `See the workbench` goes to `/features` rather than to the signed-in editor.
3. **Two from EPIC-072b**, neither blocking: whether `/about` should end on its "if I stop" section
   or on a mission sentence, and whether `/careers` should exist at all rather than 404 — which the
   epic file itself flags as an assumption to correct if wrong.
