<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# EPIC-070: Stripe, and the pricing page it makes true

Stage: 6 · Depends on: EPIC-072b · Size: **M**

Sequence and rationale in `docs/epics/plan-mockup-parity.md`. `docs/roadmap.md`, Stage 6:

> **Tasks.** Products and prices as this roadmap names them ($29/$79 per seat, unvalidated —
> EPIC-005 is cut); checkout, portal, webhooks (idempotent); `run_budgets` by plan; BYO-key unlock
> on Pro; usage meter; dunning via Resend; refund path documented.
> **Review.** Pricing page equals Stripe.

## Why this row, now

EPIC-072 refused `/pricing` because *"needs EPIC-070; no checkout, no metering, prices marked
unvalidated"*. Soroush, 2026-09-20: **build the page now at the mockup's prices, and build Stripe
underneath it.** He supplies the Stripe product ids and the API key.

The order matters and is the point of this epic. `apps/web/lib/site/claims.test.ts` denies the
pattern `["a per-seat price", /\bper seat\b|\$\d+\s*(?:a|per|\/)\s*(?:month|seat)/i]`, paired with
the control `"$29 per seat / month"` — the mockup's own sentence. **That denial is correct today.**
A page saying $29 per seat when nothing charges $29 is a claim a reader could hold us to and we
would lose.

So this epic does not work around the guard. It **makes the claim true and then removes the guard in
the same commit**, with the reason in the commit message. The denylist row and its control row go
together; removing one without the other leaves a pattern matching nothing, which is the exact
failure mode the controls were built to catch.

## Goal

A customer can buy Pro or Team, the price they see is the price Stripe charges, the plan they are on
determines what the product lets them do, and the pricing page's prices stop being a denied claim
because they become an enforced one.

## Scope

1. **ADR-007: plans, prices and what a seat is.** Written **before** the schema, per
   `PROCESS.md` — a billing schema keyed to an external system's ids is not cheaply reversible.
   It fixes: the three plans, what a seat is, what happens at the period boundary on a downgrade,
   whether quota is per seat or per account, and what a customer keeps when they stop paying.

2. **Stripe products and prices.** Free, Pro `$29`/seat/month, Team `$79`/seat/month — the
   roadmap's numbers, which are the mockup's numbers, **unvalidated** (EPIC-005 is cut and said so).
   Built and tested against **Stripe test mode with our own test products**, so the suite runs
   without Soroush's account. His live product ids and key are configuration, read from the
   environment, never committed.

3. **Checkout, the customer portal, and webhooks.** Webhooks **idempotent** on Stripe's event id —
   Stripe redelivers, and a second delivery that grants a second month is a money bug. Every handled
   event type enumerated; an unknown type is recorded and ignored, never assumed benign.

4. **`plans` and `subscriptions` in `packages/db`**, keyed by Stripe's ids, with a migration.
   **Live plan state is derived from the subscription row, never copied onto the user** — the same
   rule EPIC-051 applied to `Live` and for the same reason: two copies diverge, and here the
   divergence is somebody's money.

5. **`run_budgets` by plan, enforced.** The mockup's Free tier says 50 runs a month and Pro says
   5,000. A quota printed and not enforced is the same class of untrue claim this epic exists to
   close. The worker refuses over budget **in words**, the way EPIC-042 refuses a missing provider
   key.

6. **BYO-key unlock on Pro**, using EPIC-042's existing provider-key path.

7. **A usage meter** in Settings → Billing: runs this period against the plan's budget, and the
   period's end date.

8. **Settings → Billing**, the fifth of the mockup's Settings tabs, as a route beside the existing
   three — a link with `aria-current`, not a `role="tab"` tablist (EPIC-055's ruling: a control that
   changes the URL is a link).

9. **`/pricing`**, the mockup's three tiers, with each tier's feature list **cut down to what is
   true**. The mockup's Team tier lists SSO/SAML, roles and an audit log, a shared blok library and
   private judge models. None exists, and four of them are separately denylisted. Team ships with
   the features it has, or Team ships as "talk to us" with no feature list at all.

10. **Dunning via Resend**, which is already a dependency, and a **documented refund path** in
    `docs/` — a written procedure, not code.

11. **The claims-guard change**: delete `["a per-seat price", …]` from `NOT_TRUE_YET` **and** its
    control row `["$29 per seat / month", …]`, and register the price sentences in `claims.ts`
    citing this epic. The report states the removal in its own section.

## Out of scope

- **Validating the prices.** EPIC-005 is cut; $29/$79 stand on the roadmap alone and the report says
  so, as the roadmap already does.
- **SSO/SAML, roles, an audit log, a shared blok library, private judge models.** The mockup's Team
  tier invents all five. Each stays denylisted.
- **Tax, VAT/GST handling beyond what Stripe Tax does for us**, and invoicing outside Stripe.
- **Annual billing, coupons, trials beyond the mockup's 14 days, and usage-based pricing.**
- **Enforcing anything retroactively** on accounts that exist before this ships.
- **Publishing prices anywhere but `/pricing`.** The home page does not gain a price.

## Acceptance criteria

- [ ] ADR-007 is written and merged **before** the migration. Evidence: the file and the commit
      order.
- [ ] Checkout completes against Stripe test mode and the resulting plan is visible in the product.
      Evidence: the drive, end to end, with a test card.
- [ ] **A webhook delivered twice has the effect of one.** Evidence: a test replaying the same
      event id, asserting one subscription row and one period.
- [ ] An unknown event type is recorded and ignored. Evidence: test name.
- [ ] Plan state is **derived**, and a test fails if a plan column is ever added to `users`.
      Evidence: test name.
- [ ] A run over budget is refused **in words that name the budget and the plan**, and the refusal
      is visible in the UI, not only in a log. Evidence: test name plus a screenshot.
- [ ] Downgrade takes effect at the period end, not immediately. Evidence: test name.
- [ ] `/pricing`'s three tiers match the Stripe prices **read from Stripe**, not retyped. Evidence:
      a test that fails when the two disagree — this is the roadmap's Review line, made mechanical.
- [ ] Every feature line on `/pricing` is in `claims.ts` citing a shipped epic, or is absent.
      Evidence: the claims tests.
- [ ] `NOT_TRUE_YET`'s per-seat row and its control row are **both** removed, in one commit, and the
      remaining ten patterns each still match their control. Evidence: the run.
- [ ] No secret in the repository; `pnpm audit-run`'s gitleaks step green. Evidence: the run.
- [ ] Settings → Billing shows runs used against budget and the period end. Evidence: screenshot.
- [ ] Lighthouse ≥90 on `/pricing`, accessibility 100; no sideways scroll at 390px.
- [ ] All gates green per package; `gates.mjs ci` green before merge.
- [ ] The built app driven in a browser through a test-mode purchase, screenshots in the report.
- [ ] Report and session log written, with the unvalidated-price caveat restated.

## Verification

As EPIC-023's block, plus the Stripe CLI for webhook delivery:

```
stripe listen --forward-to localhost:3120/api/stripe/webhook
stripe trigger checkout.session.completed
stripe events resend <event-id>     # the idempotency proof
npx tsx scripts/drive-epic-070.mts
```

Expected: one subscription row after the resend, not two.

## Notes for the implementer

- **Soroush supplies the live product ids and the API key.** Do not wait on them
  (`CLAUDE.md`, "Human-only work is skipped, not blocked on"). Build and prove everything against
  test mode with products this repository creates; his ids are environment configuration. If the
  live ids are absent at close, the epic still closes — say so in the report and list exactly which
  variables he sets.
- New env vars go in `CLAUDE.md`'s Env list in the same commit, and never in a `.env` this
  repository tracks.
- **Money bugs are the P0 class.** `PROCESS.md`: data loss, security and keys are fixed within 24
  hours as an S epic. Charging twice belongs in that set; write the idempotency test before the
  handler, not after.
- The mockup's pricing page is lines 700–730. Its Free tier says *"1 project"* and *"1 provider"* —
  check both against what the product actually restricts before printing either; today it restricts
  neither, so either enforce it or do not say it.
- `docs/design/README.md`: the prototypes are the spec for the interface, not for what is true about
  the company. That applies to a price list more than to anything else on the site.
- If a criterion is impossible, write `docs/epics/BLOCKER-EPIC-070.md` and stop.
