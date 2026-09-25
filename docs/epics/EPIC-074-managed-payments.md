<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# EPIC-074: Managed Payments — Stripe sells, so nobody has to register anywhere

Stage: 6 · Depends on: EPIC-070 · Size: **S**

## Why this row exists

EPIC-070's report §10 left one question open and called it the only one with a clock on it:
**Managed Payments, on or off?** Soroush answered on 2026-09-25: **on.**

EPIC-070 turned it *off* per session, because the first real Checkout returned 400 — *"the product
tax code is missing … Product tax code is required for Managed Payments, which is enabled by default
on your account"* — and clearing that error by adding a tax code would have opted us into Stripe
being the **merchant of record** silently, against `docs/decisions/AUTONOMOUS.md`'s 2026-09-24 row
that no tax is collected. That was the right call then and it is superseded now, deliberately.

## The thing this epic must not get wrong

**A Stripe product tax code is not a tax registration.** It is a classification string — `txcd_…` —
chosen from Stripe's own list, saying *what kind of thing this is* so Stripe knows which rules apply.
It costs nothing, no authority issues it, and it requires no company.

Soroush, 2026-09-25: *"i don't and i won't have a tax code"* and *"i don't plan to register a company
right now"*. Both are about **registrations**, and Managed Payments is precisely the thing that means
he never gets one: Stripe registers, files and remits in 80+ countries under its own registrations.
The epic's job is to make that true in the code and to say it plainly wherever a reader might
confuse the two.

## Goal

A customer buys Pro, **Stripe is the merchant of record**, and no tax registration exists anywhere in
Soroush's name — with every document in this repository that says otherwise updated in the same
change.

## Scope

1. **ADR-008: who sells.** Written before the code, per `PROCESS.md`: the merchant of record is not a
   cheaply reversible choice once a customer has bought something. It fixes what Managed Payments
   takes over, what it leaves with us, what it costs, and the tax-code-is-not-a-registration
   distinction above.

2. **A product tax code**, set by `scripts/stripe-products.mts` so it is reproducible rather than
   clicked. The classification is a judgement with tax consequences, so the ADR records the
   candidates and why one was chosen, and names it as the one line an accountant should confirm.

3. **`managed_payments` enabled on the Checkout Session**, replacing EPIC-070's `enabled: false`.
   **Configurable, defaulting to on**: eligibility is per Stripe account, and a deployment whose
   account is not enrolled must fail at configuration rather than at the network — the rule
   `lib/billing/stripe.ts` already follows for the key itself.

4. **The parameters Stripe now manages.** Its docs say it *"automatically manages certain parameters
   related to Connect, tax configuration, and shipping"* and that they cannot be set by hand.
   Every parameter `createCheckoutSession` sends is checked against that, and anything that
   conflicts is removed **with the reason**, not silently.

5. **`/pricing` and Adaptive Pricing.** Managed Payments turns Adaptive Pricing on by default, so a
   customer outside the US may be charged in their own currency. The page says `$29` and the parity
   test proves it equals the Stripe Price — both stay true, and the page must stop implying that
   $29 USD is what every customer's card is debited.

6. **The refund procedure.** `docs/billing/refunds.md` is written for us as merchant of record and is
   now wrong in its second half: Stripe handles disputes, can issue refunds itself within 60 days,
   and applies consumer-protection rules such as cooling-off periods.

7. **Dunning.** Stripe now sends its own transaction emails. Decide whether ours survives, and say
   why in the report rather than leaving two systems mailing the same person by accident.

## Out of scope

- **Registering anything, anywhere.** That is the point of the epic.
- **Stripe Tax.** It is the fallback for countries Managed Payments does not cover, and it is a
  separate decision with its own cost.
- **Shopping for a cheaper merchant of record.** Paddle and others are cheaper than 3.5%; switching
  payment providers is a different epic and not this one.
- **Live mode.** Test mode only, as EPIC-070. Live keys and the Managed Payments Terms of Service are
  configuration Soroush sets when he decides to charge somebody.

## Acceptance criteria

- [ ] ADR-008 is written and committed **before** the code that enables it. Evidence: commit order.
- [ ] A Checkout Session is created with `managed_payments.enabled = true` and Stripe accepts it.
      Evidence: the drive, end to end, with a test card.
- [ ] The product carries an eligible tax code, set by the provisioning script and **idempotent**.
      Evidence: the script run twice.
- [ ] Managed Payments can be turned **off** by configuration, and the code path is tested both ways.
      Evidence: test names.
- [ ] No parameter we send conflicts with what Stripe manages. Evidence: a session created against
      the real sandbox with the shipped parameters, which is the only thing that can prove it.
- [ ] `/pricing` does not imply every customer is charged $29 USD. Evidence: the page, and a test.
- [ ] `docs/billing/refunds.md` describes the merchant-of-record arrangement that now exists.
- [ ] Nothing in this repository claims we are the merchant of record. Evidence: a grep, recorded.
- [ ] All gates green; `gates.mjs ci` green before merge.
- [ ] The built app driven through a test-mode purchase, screenshots in the report.
- [ ] Report and session log written.

## Verification

```
node scripts/with-stripe-env.mjs -- npx tsx scripts/stripe-products.mts   # twice; creates nothing the second time
node scripts/with-stripe-env.mjs -- npx vitest run --root apps/web lib/billing
npx tsx scripts/drive-epic-074.mts
```

## Notes for the implementer

- **Probe rather than reason.** EPIC-070's finding came from a 400, not from reading. A session
  against the sandbox with the exact parameters we ship is the only proof that §4 is satisfied.
- **The eligibility review is Stripe's and is not ours to assert.** The docs say access *"is based on
  an eligibility review that considers factors such as business type and geography"*. Canada is a
  supported location and software is a supported category; whether this account is approved in live
  mode is Stripe's answer to give, and the report says so rather than promising it.
- If a criterion is impossible, write `docs/epics/BLOCKER-EPIC-074.md` and stop.
