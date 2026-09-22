<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# Plan — EPIC-070: Stripe, and the pricing page it makes true

Branch `epic/070-stripe-and-pricing`. Epic file `docs/epics/EPIC-070-stripe-and-pricing.md`.
Row 5 of `docs/epics/plan-mockup-parity.md`. Size **M** — two to three sessions, and this plan is
written expecting that rather than hoping otherwise.

## 0. Where this started: a blocker, then six rulings

`docs/epics/BLOCKER-EPIC-070.md` was written first. The epic assumed only the **live** Stripe ids
were missing and that test mode was available to build against; probing found **no 41Prompts Stripe
account at all** — the CLI on this machine is logged in to another project's sandbox
(`display_name = 'TimeBud sandbox'`) with a key that expired 2026-06-11.

Soroush, 2026-09-22: **he creates the test-mode account.** The epic runs as written. He also ruled
on the five open design questions, and `docs/decisions/ADR-007-plans-prices-and-what-a-seat-is.md`
is written and accepted:

| | ruling |
|---|---|
| `users.plan` | **drop it**; plan derived from the `subscriptions` row |
| a seat | **does not exist** — flat **$29/month per account**, not per seat |
| what a plan buys | **a run count** (50 / 5,000) **on top of** the existing `run_budgets` cents cap |
| on cancel | **everything readable, publishing keeps working**, new runs fall back to Free |
| Team | **"talk to us"** — no price, no checkout, no feature list |

**ADR-007 is done and this plan does not re-open it.** Where the build has a question ADR-007
answers, it cites the section rather than deciding again.

## 1. What is still blocked, and what that gates

**`STRIPE_SECRET_KEY` does not exist yet.** Steps 2 and 3 below do not need it. Everything from
step 4 does.

If the key has not arrived when step 3 finishes, the work **stops there** rather than continuing
into a half version — the blocker's §2 argument is unchanged: shipping `/pricing` without checkout
publishes the exact sentence `claims.test.ts` denies, and shipping plan-based quotas without
checkout enforces plans nobody can buy.

## 2. ADR-007 — **done**

Committed before any schema, as the epic's scope item 1 and `PROCESS.md` both require.

## 3. The things that need no key

| | what | why it is safe to build first |
|---|---|---|
| 3a | **`plans` and `subscriptions` in `packages/db`**, keyed by Stripe's ids, plus `stripe_events` for idempotency | tables and a migration; no API call |
| 3b | **Drop `users.plan`**, with the derived read replacing it, and the test that fails if a plan-like column returns | ADR-007 §3. This is a migration over an existing column, so it goes in early and gets its own careful look |
| 3c | **The run counter**: a per-period count enforced beside `run_budgets.cap_cents`, with the refusal naming which limit and which plan | ADR-007 §2. `apps/worker/src/budgets/increment-run-budget.ts` is the existing shape to follow |
| 3d | **The webhook handler and its idempotency test, test first** | Stripe signs payloads with the webhook secret; `stripe.webhooks.constructEvent` verifies **offline** against a secret we choose in a fixture. A replayed `evt_…` is provable with no network at all — and the epic's Notes say to write this test before the handler |

**3d is the one worth stating plainly**: the money-critical property of this epic can be proved
without Stripe ever being reached, because event signing is HMAC over a body with a shared secret.
What cannot be proved offline is that Stripe *sends* what we think it sends, which is what the
test-mode drive is for.

## 4. The things that need the key

| | what |
|---|---|
| 4a | Products and prices created in **test mode**, by a script in `scripts/`, so the objects are reproducible rather than clicked into existence |
| 4b | Checkout session, success/cancel returns, and the customer portal |
| 4c | `stripe listen` against the local webhook route; `stripe trigger`; **`stripe events resend <id>` as the idempotency proof** — one subscription row after the resend, not two |
| 4d | **`/pricing`** — three tiers, Team as a contact link, every feature line in `claims.ts` or absent |
| 4e | **The price-parity test**: `/pricing`'s numbers read **from Stripe**, failing when the two disagree. This is `docs/roadmap.md`'s Review line — *"Pricing page equals Stripe"* — made mechanical, and the criterion that stops the page being retyped |
| 4f | Settings → Billing: usage against both limits, the period end, a portal link. A **route** beside the existing three with `aria-current`, not a `role="tab"` tablist — EPIC-055's ruling |
| 4g | **The claims-guard change**: delete `["a per-seat price", …]` **and** its control row `["$29 per seat / month", …]` together, in one commit, with the reason in the message; register the price sentences in `claims.ts` citing this epic |
| 4h | Dunning via Resend (already a dependency), and the refund path as a written procedure in `docs/` |

### 4g is the one to get right, and the pattern still catches the new copy

ADR-007 §1 changes the sentence from *"$29 per seat / month"* to *"$29 / month"*. The denied
pattern is `/\bper seat\b|\$\d+\s*(?:a|per|\/)\s*(?:month|seat)/i`, and **`$29 / month` still
matches its second alternative.** So nothing about the ordering relaxes: the guard has to come out
in the same commit that makes the claim true, and its control row comes out with it. Removing one
without the other leaves a pattern matching nothing, which is the failure the controls exist to
catch.

The remaining ten patterns each keep their control, and the run proves it.

## 5. Order of work

1. ADR-007 — **done**.
2. This plan — **done**.
3. 3a → 3b → 3c → 3d, each with its tests, committed as it lands. `pnpm test`, `typecheck`, `lint`.
4. **Stop if the key has not arrived.** Report what is built and what waits.
5. 4a → 4c (prove idempotency against the real thing) → 4b → 4f → 4d/4e → 4g → 4h.
6. Build, `next start`, drive by hand through a test-mode purchase, screenshots into
   `docs/epics/reports/screenshots/EPIC-070/`.
7. Lighthouse over `/pricing`. `pnpm audit-run`'s gitleaks step, because this epic adds secrets to
   the environment for the first time since EPIC-042.
8. Report, session log, decisions. `node scripts/gates.mjs ci` on that commit. `git merge --no-ff`.

## 6. Traps, read off the code rather than anticipated in the abstract

1. **`run_budgets` is cents and the page promises runs.** Found by reading `schema.ts:167` — the
   existing cap is `cap_cents`, and nothing counts runs. ADR-007 §2 settles it as two limits; the
   build has to enforce **both** and the refusal has to say which one was hit, or a customer at 50
   runs and a customer at their spend cap get the same unexplained refusal.
2. **`users.plan` exists and the epic's criterion says it must not.** Found by reading
   `schema.ts:41`. It is a migration over a column `plan_budget_defaults` reads through, so the
   drop and the derived read land together or the budget seeding breaks.
3. **A new dependency.** `stripe` is not in any `package.json`. It needs a one-line reason in the
   commit message and in the report — `CLAUDE.md`'s rule. The reason is that signature verification
   is security-critical and hand-rolling HMAC verification against a documented-but-subtle scheme
   is the wrong place to save a dependency.
4. **`pnpm dead-code` and the public-package boundary.** Nothing Stripe touches may be imported by
   `packages/core`, `cli`, `sdk-ts` or `sdks/python` — `CLAUDE.md` rule 11, enforced by
   dependency-cruiser. Billing lives in `apps/web` and `packages/db`.
5. **The two Linux visual baselines.** `/pricing` is a new page and does not have one; the `/`
   baselines only move if the footer or nav changes, which this epic has no reason to touch.
   EPIC-072b's §7 has the measurement procedure if they do.
6. **`/pricing` joins five lists, not four.** `public-routes.json`, `sitemap.ts`, `robots.ts`,
   `site-claims.test.tsx`'s `PAGES` — **and `PUBLIC_PATHS` in `lib/site/hosts.ts`**, which is the
   one EPIC-072b's plan missed and `hosts.test.ts` caught. Also `site-pages.spec.ts`'s 404 control
   asserts `/pricing` **is a 404 today**; that assertion comes out with this epic, and the route
   that is on no roadmap stays as the control.
7. **Prose links.** Anything `/pricing` puts inside a sentence must sit in a container
   `landing.css`'s prose-link rule covers, or `site-pages.spec.ts`'s "links in running text" walk
   fails with the link's own text in the message. Add the container; do not blanket `main a`.

## 7. What this plan will not do

- **Validate the prices.** EPIC-005 is cut. $29 stands on the roadmap alone and every report says so.
- **Build teams, roles, SSO, an audit log, a shared blok library or private judge models.** All five
  are the mockup's invention and four are denylisted. Team is a contact link.
- **Enforce anything retroactively** on accounts that exist before this ships — ADR-007 §4.
- **Touch production, or any live Stripe object.** Test mode only. Live ids are configuration
  Soroush sets when he decides to charge somebody.
