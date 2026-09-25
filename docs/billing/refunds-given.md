<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# Refunds given

One line per refund or chargeback, appended. `docs/billing/refunds.md` step 4 is what writes here.

**Owner ids, never email addresses.** An account is identified by `users.id`, which is what
`billing_customers.owner` and the Stripe customer's `metadata.owner` both carry. An email address in
this file would be a customer's contact details in a git history that cannot be rewritten, for no
benefit — the owner id finds the account and the Stripe customer, which is everything anybody
reading this row would need.

**It is empty, and that is a fact rather than an omission.** Nobody has been charged: every Stripe
object this product has is in the `41prompts` sandbox, and live keys are configuration Soroush sets
when he decides to charge somebody (ADR-007 §8).

**Why keep it at all before there is anything in it.** The row is the only evidence of how the
policy has actually been applied, and the pattern worth noticing — three refunds for the same
reason, or two chargebacks from one account — is only visible in aggregate. A log started after the
first interesting month has already missed it.

| date | owner | amount | mode | reason |
|---|---|---|---|---|
| — | — | — | — | *nothing yet* |
