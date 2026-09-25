<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# Refunds

The procedure for giving somebody their money back. Written for EPIC-070, 2026-09-24; revised for
EPIC-074, 2026-09-25.

> **Stripe is the merchant of record** (ADR-008). It sells to the customer, it collects and remits
> any tax, and it handles disputes. That changes the second half of this procedure and not the
> first: **the policy in §1 is still ours**, and so is the decision to refund. What changed is who
> the transaction legally belongs to, who answers a chargeback, and the fact that **Stripe can now
> refund without asking us** in some circumstances.

**This is a written procedure and not code, deliberately.** EPIC-070's scope item 10 asks for "a
documented refund path", and a refund button would be the wrong answer: a refund is a judgement
about one customer, it is irreversible in the direction that matters, and Stripe's Dashboard already
does it correctly with an audit trail we do not have to build. What was missing was not a control —
it was an agreed answer to *when* and *how much*, so that the first refund is not decided under
pressure by whoever happens to read the email.

**Nothing in this file needs the product to change.** Every step is either a Stripe Dashboard action
or a reply to an email.

---

## 1. The standing answer

**If somebody asks for a refund within 30 days of a charge, give it to them in full, and do not ask
why.**

That is the policy. It is written as a default rather than as a discretion because a discretion is a
thing somebody has to be brave to exercise, and at this size the cost of being wrong in the
customer's favour is $29.

Three consequences worth stating, because they are the ones that come up:

- **A trial that was not cancelled in time is a refund, not a lesson.** The 14-day trial charges on
  day 15. Somebody who meant to cancel and did not is the single most common refund request any
  subscription product gets, and refusing it buys $29 and a person who tells people about it.
- **A second month nobody used is a refund.** `suite_runs` says whether the period was used; if the
  count is zero, the answer is yes without a conversation.
- **Past 30 days, it is a conversation and the default is still yes** where the charge was plainly a
  mistake — a duplicate account, a card somebody forgot was attached.

**There is no refund for "the product did not do what I wanted".** Not because it is unreasonable,
but because it is a different thing: that is a reason to cancel, and cancelling under ADR-007 §4
already costs them nothing and takes nothing away.

## 2. How to do it

Stripe's Dashboard, in the sandbox or in live mode, whichever the charge is in.

1. **Find the customer.** Dashboard → Customers, search the email they wrote from. If the address
   they wrote from is not the address on the Stripe customer, find them by the account's owner id
   instead: `billing_customers.owner` maps a `users.id` to a `cus_…`, and the Stripe customer
   carries `metadata.owner` with the same value. **Refund the account, never the address** — an
   email address is the least reliable identifier in this system and the one an attacker controls.
2. **Open the payment** under that customer and press **Refund**. Full amount unless §1 says
   otherwise.
3. **Decide whether the subscription also ends.** A refund is not a cancellation and Stripe will not
   treat it as one; the next period will charge as normal if the subscription is left alone. Almost
   always the customer wants both, so cancel it in the same visit — **Cancel subscription**, at the
   period end, not immediately (ADR-007 §5: they keep what they paid for until it runs out).
4. **Write one line in `docs/billing/refunds-given.md`**: the date, the owner id — *not* the email —
   the amount, and the reason in a few words. That file is the record of how this policy has
   actually been applied, which is the only way to notice a pattern that should change the policy.
5. **Reply.** Say the refund is issued, say it takes five to ten days to appear, and say what
   happens to their account. If the subscription was cancelled, say that everything they made is
   still there and still exportable, because that is true and it is the thing they will worry about.

## 3. Stripe can refund without us, and that is not a bug

Under Managed Payments, Stripe states it **can issue refunds within 60 days of purchase in certain
cases, including to help reduce chargebacks**, and that it applies consumer-protection rules such as
regional cooling-off periods. So a refund can appear that nobody here decided.

Three consequences, and none of them needs code:

- **`refunds-given.md` will have gaps**, because a refund Stripe issued was never written down by
  step 4. That is acceptable and it is better than the alternative of pretending the log is
  complete: the log's purpose is to show how *our policy* has been applied, and a Stripe-initiated
  refund is not our policy being applied. Write the row anyway if you notice one, with `stripe` as
  the reason.
- **§1's 30-day answer is unchanged.** It is more generous than a rule Stripe would apply on its
  own, and being outvoted in the customer's favour costs nothing.
- **Do not chase one.** A refund Stripe issued to avoid a chargeback has already saved the fee it
  was issued to avoid.

## 4. What happens in this system, and what does not

**Nothing in the product reacts to a refund, and that is correct.**

- A refund does not emit a subscription event, so `subscriptions` does not change. The row still
  says what Stripe says, which is that the subscription is active until it is cancelled.
- Cancelling **does** emit `customer.subscription.updated` and later `customer.subscription.deleted`,
  both of which `/api/stripe/webhook` already handles. The plan read is `status` plus the current
  period against the clock (`packages/db/src/billing.ts`), so the account stays on Pro until the
  period it paid for runs out and then falls back to Free on its own.
- **`charge.refunded` is not a handled event type.** It is recorded in `stripe_events` with
  `handled: false`, which is the deliberate behaviour for an event we have nothing to do about —
  `apps/web/lib/billing/webhook.ts` has the argument for why an unknown type is recorded rather than
  dropped. If a refund ever needs to change something in the product, that is the event to add and
  the row in `stripe_events` is the evidence of how often it has arrived.

**Nothing is deleted from the account by a refund.** ADR-007 §4 applies to a refunded customer the
same way it applies to a cancelled one: prompts, versions, runs and published builds stay.

## 5. Chargebacks are Stripe's now

A chargeback is the customer's bank reversing the charge without asking us. **Under Managed Payments
Stripe handles it** — it reviews the dispute and submits evidence on our behalf, automatically or by
hand.

So the old advice here ("do not fight one over $29") is no longer a decision anybody has to make,
and that is most of what the 3.5% buys. What remains:

- Stripe still emits `charge.dispute.created`. It is **not handled** and is recorded in
  `stripe_events` with `handled: false`, like any other unhandled type.
- Do cancel the subscription, so the next period does not produce a second dispute.
- Write the line in `refunds-given.md` with `chargeback` as the reason. The pattern worth noticing
  is *more than one from the same account*, which is fraud rather than a refund — and it is also
  what threatens **eligibility**: Stripe requires a low dispute rate to keep Managed Payments.

## 6. What this does not cover, and where it goes when it does

- **Partial and pro-rata refunds.** Not offered. Stripe can do them; the policy above deliberately
  cannot, because "how much of a month did you use" is a negotiation and $29 is not worth one.
- **Tax.** Stripe collects and remits it, and refunds it with the charge — under Managed Payments
  there is no separate tax step for anybody here to get wrong. This replaces the 2026-09-24 position
  that no tax is collected at all, which was true until ADR-008.
- **Invoiced Team customers.** There is no Team price and no Team invoicing yet; both are their own
  backlog row. A negotiated invoice refunded under a negotiated contract is not this procedure.
- **Anything in live mode.** Every Stripe object this product has is in the `41prompts` sandbox and
  nobody has been charged. The procedure is written now so that the first real charge is not also
  the first time anybody thinks about the second half of it. **Managed Payments in live mode also
  needs its Terms of Service accepted** at `dashboard.stripe.com/settings/managed-payments`, and
  Stripe runs an eligibility review — neither is something this repository can do.
