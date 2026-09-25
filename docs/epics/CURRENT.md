<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# No epic is in progress — EPIC-070 is merged

**EPIC-070 built Stripe and the pricing page it makes true**, merged into local `main` as `e121b0c`
on a green `node scripts/gates.mjs ci` (17 of 17 at `50dcc13`). Report
`docs/epics/reports/EPIC-070-report.md`, session log
`docs/epics/sessions/EPIC-070-session.md`, decision record
`docs/decisions/ADR-007-plans-prices-and-what-a-seat-is.md`.

A customer can buy Pro, the price they see is the price Stripe charges, and the plan they are on
decides what the product lets them do. Driven end to end on the built app with a real test card:
Checkout, a webhook Stripe actually delivered, the plan on Settings → Billing, and
`stripe events resend` leaving one subscription row and one period.

## The order was the epic

`not-true-yet.ts` denied any per-seat or per-month price, and **that denial was correct** — EPIC-072
refused `/pricing` for exactly that reason. So checkout, the webhook, the plans table and the run
gate landed first, the claim became true, and the pattern came out **with its control row, in the
same commit**. Removing one without the other leaves a control matching nothing, which is the
failure the controls exist to catch.

What replaced it is narrower and stronger: `["a price", /\$\d/]` still applies to every page
**except `/pricing`**, with three controls on the exception — the list is exactly one route, every
other page is still checked, and the exempt page really does print a price.

## What the drive found, and the gate after it

Three defects no test could reach, and the first is the one to read:

1. **The first real Checkout returned 400.** Stripe's **Managed Payments** is on by default and
   wants a product tax code — and under it **Stripe is the merchant of record**. Adding the tax code
   would have opted us into that silently, against the 2026-09-24 decision that no tax is collected.
   It is off, per session.
2. **The customer portal's one button said the portal was not configured**, and the drive's
   assertion accepted that answer — a test that passed both ways.
3. **The Team card rendered as a tall box with seven hundred pixels of nothing**, every assertion
   passing over it. The guard written for it was vacuous — `margin-top: auto` makes the fill ratio
   94% either way — and had to be written twice.

Then `gates.mjs ci` found **six more in the e2e suite**, because it was the first thing to run e2e
against that branch. Five from the BYO-key gate meeting a suite whose owner is a fresh Free account,
one from this epic's own sixth run-demo row meeting a literal `toHaveCount(5)`.

## What is merged into local `main`, and not pushed

EPIC-023, EPIC-024, EPIC-016b, EPIC-016c, EPIC-016d, EPIC-072b and now EPIC-070 — **seven epics, all
`gates.mjs ci` green, none pushed.** `origin/main` is 70+ commits behind, so **no staging URL is
evidence about any of it**, and `docs/epics/RELEASE-DUE.md` has been waiting since 2026-09-20, when
the count was three.

## Six things are Soroush's

Report §10 has all of them. In order of how much the delay costs:

1. **Managed Payments: on or off?** Cheapest to decide before anybody is charged, and it decides
   whether the EU/UK VAT exposure recorded on 2026-09-24 is his or Stripe's.
2. **The live key and live objects.** Everything so far is the `41prompts` sandbox.
   `scripts/stripe-products.mts` refuses a live key on purpose.
3. **A restricted `rk_` key** rather than `sk_`, for the live one.
4. **No CSP header anywhere in this app** — pre-existing, wider than billing, a row of its own.
5. **$29 is unvalidated.** EPIC-005 is cut.
6. **A sandbox `whsec_` reached a session transcript** and can be rolled.

## What comes next

`docs/epics/plan-mockup-parity.md` is the sequence for this programme and supersedes
`docs/backlog.md` for it. EPIC-070 was its row 5.

Two things this epic deliberately left as their own rows, neither scoped yet:

- **Invoicing** (Soroush, 2026-09-23) — manual invoices to Team customers who agreed a price by
  email. The two invoice webhook events it needs are already handled; the rest is a documented
  procedure and whatever surface sends one.
- **A CSP header**, which Stripe.js and Checkout would want if anything ever loads them.
