<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# Refunds

The procedure for giving somebody their money back. Written for EPIC-070, 2026-09-24.

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

## 3. What happens in this system, and what does not

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

## 4. Chargebacks are a different thing

A chargeback is the customer's bank reversing the charge without asking us, and it costs a fee on
top of the amount.

- Stripe emits `charge.dispute.created`. It is **not handled** and is recorded like any other
  unhandled type.
- **Do not fight one over $29.** The evidence submission takes longer than the amount is worth, and
  a lost dispute costs the fee twice.
- Do cancel the subscription, so the next period does not produce a second one.
- Write the line in `refunds-given.md` with `chargeback` as the reason, because the pattern worth
  noticing here is *more than one from the same account*, which is fraud rather than a refund.

## 5. What this does not cover, and where it goes when it does

- **Partial and pro-rata refunds.** Not offered. Stripe can do them; the policy above deliberately
  cannot, because "how much of a month did you use" is a negotiation and $29 is not worth one.
- **Tax.** No tax is collected (`docs/decisions/AUTONOMOUS.md`, 2026-09-24), so no tax is refunded.
  The day a registration exists, this section becomes the part of the procedure that is not optional.
- **Invoiced Team customers.** There is no Team price and no Team invoicing yet; both are their own
  backlog row. A negotiated invoice refunded under a negotiated contract is not this procedure.
- **Anything in live mode.** As of this epic every Stripe object this product has is in the
  `41prompts` sandbox and nobody has been charged. The procedure is written now so that the first
  real charge is not also the first time anybody thinks about the second half of it.
