<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# ADR-008: Who sells — Stripe is the merchant of record

Status: accepted · 2026-09-25 · EPIC-074

**The decision is Soroush's**, taken on 2026-09-25 after EPIC-070's report §10 put it to him as the
one open question with a clock on it. This file records it before the code that implements it,
because `PROCESS.md` owes an ADR for a choice that is not cheaply reversible, and **who sold
something to a customer cannot be changed after they have bought it.**

## Context

EPIC-070 shipped subscriptions with **us** as the merchant of record and **no tax collected
anywhere**. `docs/decisions/AUTONOMOUS.md`, 2026-09-24, records why and names the exposure in one
line: B2C digital services into the EU and UK carry a VAT obligation from the first sale, with no
threshold, and Soroush is not registered anywhere.

That epic's first real Checkout then returned `400`:

> *"Invalid line_items[0]: the product tax code is missing. … Product tax code is required for
> Managed Payments, which is enabled by default on your account."*

Stripe enables **Managed Payments** by default on new accounts. EPIC-070 turned it off per session
rather than clearing the error with a tax code, on the grounds that adding the code would have
opted us into a merchant-of-record arrangement **silently**. That was correct then. This supersedes
it deliberately.

## Decision

### 1. Stripe is the merchant of record **(SB)**

`managed_payments.enabled = true` on every Checkout Session this product creates.

Stripe sells to the customer, and in more than 80 countries it **calculates, collects, registers,
files and remits** sales tax, VAT and GST, and issues tax invoices. It also takes fraud prevention,
dispute handling and transaction-level customer support.

**The alternative was not "do it ourselves".** It was *"no compliance"*: Soroush holds no
registrations, `docs/backlog.md`'s EPIC-071 records that he has declined to engage a lawyer for
now, and an unregistered seller taking EU B2C money is accruing a liability rather than saving a
fee. The choice was between paying for compliance and not having any.

### 2. A product tax code is **not** a tax registration, and this is the sentence to remember

Soroush, 2026-09-25: *"i don't and i won't have a tax code"*, *"i don't plan to register a company
right now"*.

Both sentences are about **registrations** — a VAT number, a GST/HST number, a business number —
and none of them is involved here.

| | what it is | who issues it | does Soroush need one |
|---|---|---|---|
| **Product tax code** (`txcd_…`) | a **classification** of the thing being sold, chosen from Stripe's published list | nobody — it is a string in Stripe's catalogue | **no** |
| **Tax registration** (VAT/GST/HST number) | permission to collect and remit tax in a jurisdiction | a tax authority | **no — Stripe holds these** |

**This distinction is load-bearing and easy to lose**, which is why it is in a decision record rather
than only in a code comment. Anybody who reads "tax code" as "tax number" will conclude this epic
asks something of Soroush that it does not.

**No company is required either.** Canada is a supported business location, Stripe supports
individuals and sole proprietorships, and Managed Payments' documented constraints are about the
**integration** (direct, not a Connect platform or marketplace) and the **product** (digital
software, fully automated) — neither of which is about incorporation. When Soroush registers
something, he has said he will say so; nothing here changes when he does.

### 3. The classification is `txcd_10103001` — SaaS, business use

Stripe requires an eligible code from its digital-goods list. Two were plausible:

| code | name | why not / why |
|---|---|---|
| `txcd_10105002` | AI as a Service — cloud, business use | Tempting, and wrong. **What is sold is not model access.** On Pro the customer brings their own provider key, so the inference is theirs and billed to them by their provider. |
| **`txcd_10103001`** | **Software as a service (SaaS) — business use** | **Chosen.** Cloud software delivered over the internet, not customised per buyer, nothing downloaded, sold to commercial users — which is the ICP: an AI engineer at a company of 10–500 people. |

**"Business use" rather than "personal use"** for the same reason. Under Managed Payments, whether a
given sale is treated as B2B is decided by whether the customer supplies a tax ID at checkout, not
by this code; the code decides which **category** of product is being taxed.

**This is the one line in this ADR an accountant should confirm**, and it is cheap to change: it is a
field on a Stripe Product, set by `scripts/stripe-products.mts`.

### 4. What we keep, and what we give up

**Kept:** the price, the plans, the run limits, the product, the customer relationship inside the
app, the ability to issue refunds, and Settings → Billing.

**Given up, knowingly:**

- **3.5% on top of standard processing** — roughly `6.4% + 30¢` against `2.9% + 30¢`. At $29 that is
  about **$1 per subscriber per month**. It is worth about $0 today and becomes material somewhere
  near $40k ARR, which is roughly where an accountant becomes affordable. That is the moment to
  revisit, not before.
- **Some of the customer's mail.** Stripe sends receipts, invoices, refund notices and certain
  subscription emails itself, from its own address.
- **Dispute handling.** Stripe decides disputes, including submitting evidence. Stripe may also
  **refund within 60 days on its own** to head off a chargeback, and applies consumer-protection
  rules such as cooling-off periods.
- **A cut of the currency decision.** Adaptive Pricing is on by default, so a customer outside the
  US may be charged in their own currency at Stripe's rate.

### 5. It is configuration, defaulting to on

`STRIPE_MANAGED_PAYMENTS` turns it off. Eligibility is **per Stripe account** — Stripe's docs say
access *"is based on an eligibility review"* — so a deployment whose account is not enrolled must
fail at **configuration**, in words, rather than at the network with a 400 in the middle of somebody's
checkout. That is the rule `lib/billing/stripe.ts` already follows for the key itself, and this is
the same rule applied to the same class of problem.

Defaulting to **on** is the decision; the variable exists so a self-hosted deployment, or this one on
the day Stripe says no, has an answer that is not a code change.

### 6. What this does not decide

- **Stripe Tax**, the fallback for the countries Managed Payments does not cover. A separate cost and
  a separate decision, and nothing forces it today.
- **Whether 3.5% is the best price for a merchant of record.** It is not — Paddle and others are
  cheaper. Switching payment provider is a different epic; switching a flag is this one.
- **Live mode.** Test mode only. The Managed Payments Terms of Service and live keys are
  configuration Soroush sets when he decides to charge somebody.
- **Whether $29 is right.** Still unvalidated, still EPIC-005, still cut.

## Consequences

**Cheap now:** turning it off again, while no customer has bought anything. A flag.

**Expensive later, deliberately:** turning it off *after* customers exist. The seller of record on
their receipts and their contract changes, which is why this is an ADR and why it was taken at zero
customers rather than at fifty.

**Two documents in this repository become wrong and are fixed in the same change**:
`docs/billing/refunds.md`, whose second half assumes we handle disputes, and `/pricing`, which
implies every customer's card is debited $29 USD.
