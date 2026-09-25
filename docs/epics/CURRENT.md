<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# No epic is in progress — EPIC-074 is merged

**EPIC-074 made Stripe the merchant of record**, merged into local `main` as `4d0f7a3` on a green
`node scripts/gates.mjs ci` (17 of 17 at `837affa`). Report
`docs/epics/reports/EPIC-074-report.md`, decision record `docs/decisions/ADR-008-who-sells.md`.
EPIC-070 — Stripe, checkout and `/pricing` — merged before it as `e121b0c`.

Stripe sells to the customer and registers, files and remits sales tax, VAT and GST in 80+ countries
**under its own registrations**. Soroush holds none. Proved with a real test-mode purchase: "Sold
through Link" on the checkout page, **$4.34** of Québec tax computed on the $29 plan from a billing
address, the completed session reading back `payment_status: paid`, and the webhook writing Pro.

## The thing a future session must not get wrong

> *"i don't and i won't have a tax code"* · *"i don't plan to register a company right now"*
> — Soroush, 2026-09-25

Both are about **registrations**. A Stripe **product tax code** is a classification string —
`txcd_10103001`, "SaaS, business use" — that nobody issues, that costs nothing and that needs no
company. Reading those sentences as a refusal of the epic would have been easy and would have cost
the whole feature. ADR-008 §2 carries it as a table.

## What outlives this epic

**A Managed Payments checkout cannot be completed by a script.** Stripe's own submit button is
present, visible, enabled and clicked, and nothing happens; the page runs Link with hCaptcha beside
it. That is the fraud prevention now being paid for, working.

So the browser drive automates to the last button and **asks a person for that one click**, the way
`docs/PROCESS.md` already has a production drive ask for a sign-in. `DRIVE_HEADLESS=1` skips the
purchase and **records the skip**, so `gates.mjs ci` never waits on a window and a run that bought
nothing cannot read as one that did.

**This changes the Definition of Done and `docs/PROCESS.md` should say so** — report §6.

## The state of the remote, and it is not green

`origin/main` was level with local `main` before this merge; **two epics now sit on top of it,
unpushed** (EPIC-070's merge was pushed on 2026-09-25; EPIC-074's is not).

**GitHub CI has been red on `main` since 2026-09-20**, which is why staging still serves `bbcb038`
and production `af089c7`. Neither cause belongs to EPIC-070 or EPIC-074 — checked against the
2026-09-20 run, which failed on the same three tests:

- **`ci.yml` installs `uv` at step 116 and runs `pnpm test` at step 105**, so `uv` is not on the
  PATH when `cli-generated-code.test.ts` shells out to it. One line: move `setup-uv` above it.
- **The third-party notices list is platform-dependent** — `--check` says *current* on darwin and
  *stale* on the Linux runner. The real fix is a platform-independent generator; a check that
  depends on the machine cannot be a gate.

**This is the smallest useful thing to do next** and it is what unblocks the deploy.

## What is Soroush's

Report §8, none blocking:

1. **The Managed Payments Terms of Service** at `dashboard.stripe.com/settings/managed-payments`,
   which live mode needs and test mode did not, plus Stripe's eligibility review.
2. **`txcd_10103001`** — one line for an accountant. AIaaS was the alternative and ADR-008 §3 says
   why not: on Pro the customer brings their own provider key, so what is sold is not model access.
3. **`/pricing` prints `$29` and a Québec customer is charged `$33.34`.** The page says the debit
   can differ; whether it should print a tax-inclusive figure is undecided, and `tax_behavior` on
   the Price is where it would be.
4. **$29 is still unvalidated.** EPIC-005 is cut.

## Also noticed, and nobody's epic yet

- **Settings → Billing prints "0 of 5000 runs"** where `/pricing` says "5,000". Pre-existing since
  EPIC-070; a `toLocaleString()` away.
- **Invoicing** (Soroush, 2026-09-23) and **a CSP header** are still unscoped rows.

## What comes next

`docs/epics/plan-mockup-parity.md` is the sequence for the mockup programme and supersedes
`docs/backlog.md` for it; EPIC-070 was its last row. `scripts/pick-next-epic.mjs` stops at
**EPIC-035**, a `todo` row with no epic file — a full stop by design, and the advisor's to write.
