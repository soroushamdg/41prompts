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

## The remote is green, and staging is serving it (2026-09-25)

**`main` is pushed and GitHub CI is green** — the first green build since 2026-09-20 — with
Compliance green beside it. **Staging serves `82bc38f`**, the commit CI passed, rebuilt on the box
from `infra/docker-compose.staging.yml`. Verified as more than `/healthz`: the marketing host serves
`/`, `/pricing`, `/features`, `/changelog` and `/about` at 200, the app host serves `/sign-in` with
a submittable form, and both stylesheets `/pricing` links fetch as real CSS.

**Production is unchanged and still serves `af089c7`.** It moves only on a `v*` tag —
`build-images.yml` triggers on tags alone since EPIC-009 — and that is Soroush's.

### What it took, because three rounds of it were instructive

The red build had **two** causes, and the fix for the second was wrong the first time:

1. **`ci.yml` set Python up after it needed it.** `setup-uv` was step 116 and `pnpm test` step 105,
   so `uv` was not on the PATH when the mypy-over-generated-Python test shelled out to it. Fixed by
   moving the step. **`gates.mjs ci` cannot see this**: it runs the same steps in the same order on
   a machine where `uv` is already installed, because it refuses to start without it.
2. **The notices check was machine-dependent, so it was not a gate.** First attempt excluded
   packages by **name**, which missed **`fsevents`** — macOS-only, name says nothing — and `main`
   stayed red. The signal is `os`/`cpu` in the package's own manifest: npm's own declaration, and
   symmetric across platforms. **Verified in `node:22-slim` before pushing the second time**, which
   is what should have happened before the first.
3. **Then the Linux visual baselines**, which EPIC-070 had moved by adding `Pricing` to the nav and
   `See pricing` to the home page's closing band. Regenerated in
   `mcr.microsoft.com/playwright:v1.63.0-noble`. **This is the gap `gates.mjs ci` names in its own
   closing block every run** — the runner is Linux, this machine is darwin, and those specs skip
   here.

Two things EPIC-016's procedure for that does not mention, each of which cost a run: the suite
refuses to start without `DATABASE_URL` even for tests that never touch it, and `tar` from macOS
carries AppleDouble `._` files that Playwright tries to parse as specs.

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
