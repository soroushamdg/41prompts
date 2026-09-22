<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# ADR-007: Plans, prices, and what a seat is

Status: accepted · 2026-09-22 · EPIC-070

**Six of the decisions below are Soroush's, answered on 2026-09-22 before any code was written**,
and they are marked **(SB)** where they are his. The rest follow from them or from rules already on
file. `docs/epics/EPIC-070-stripe-and-pricing.md` scope item 1 asks for this file before the
schema, which is the explicit instruction `CLAUDE.md`'s never-touch list requires for anything in
`docs/decisions/`.

## Context

`PROCESS.md` owes an ADR for any **irreversible** choice and names "database schema for a public
object" as one of the four. A billing schema is worse than that: it is keyed to **an external
system's identifiers**, and the rows it produces are the record of what somebody was charged.

1. Stripe assigns `cus_…`, `sub_…`, `price_…` and `evt_…`. Our rows point at them.
2. A subscription accrues periods. A period that was charged cannot be un-charged by editing a row.
3. A customer's receipt is Stripe's, and our idea of what they are on has to agree with it forever
   or one of the two is lying about money.

So the cost of getting this wrong is not a migration — it is a refund, or a customer who paid for
something they did not get.

**And one thing is *not* irreversible and should not be treated as though it were: the numbers.**
`$29` and `$79` come from `docs/roadmap.md`, which took them from the mockup. **EPIC-005, the
pricing-validation study, is cut.** Nobody has asked a customer what this is worth. A price is a
row in Stripe and a line on a page; both can change next week. The structure below is what is
expensive.

## Decision

### 1. Three plans, and a flat price per account — not per seat **(SB)**

| plan | price | what it is |
|---|---|---|
| **Free** | $0 | the default every account is on until it buys something |
| **Pro** | **$29 / month** | flat, per **account** |
| **Team** | — | **"talk to us"**, no checkout, no price printed |

**A seat does not exist, so nothing is billed per seat.** The mockup says *"$29 per seat / month"*
and the roadmap copied it. Nothing in this product has multi-user accounts: there are no
invitations, no roles, no membership table, and `projects.owner` is a single `users.id`. A per-seat
charge would bill a quantity that is always exactly 1 and call it a seat, which is a claim about
the product's shape rather than a price.

**So the Stripe price is `recurring`, flat, with no `quantity` semantics**, and the page says
`$29 / month`. The moment a membership table exists, changing to per-seat is a new Stripe price and
a migration — reversible, and deliberately deferred to the epic that builds teams.

**`docs/design/README.md` applies here more than anywhere**: the prototype is the spec for the
interface, not for what is true about the company. That covers a price list.

### 2. What a plan buys: a run count, enforced **alongside** the spend cap **(SB)**

This is the decision most likely to be misread later, so it is stated as two limits rather than
one, because it is two limits.

| | limit | who it protects | where it lives |
|---|---|---|---|
| **Runs per period** | Free **50**, Pro **5,000** | the customer's understanding of what they bought | new, this epic |
| **Model spend** | `run_budgets.cap_cents` | **us**, from an unbounded provider bill | exists since EPIC-004 decision 6 |

**Both are enforced and a run is refused if either is reached**, with a refusal that names *which*
one and the plan — the way EPIC-042 refuses a missing provider key, in words, in the UI and not
only in a log.

**Why not one limit.** They are different quantities and each fails without the other:

- **A run count alone removes EPIC-004 decision 6's guarantee.** *"No user can run up an unbounded
  provider bill"* — and 50 runs against an expensive model on a long input is still an unbounded
  bill. The cents cap is the only thing standing between a Free account and a real invoice.
- **A cents cap alone cannot be sold.** *"$4 of model spend a month"* is a sentence a customer
  cannot price without knowing every model's per-token rate. The count is what they reason about.

**The cents cap is not a plan feature and is not printed on `/pricing`.** It is a safety rail, it
is per account in `run_budgets`, and `plan_budget_defaults` seeds it from the plan. Printing it
would turn a rail into a promise.

**On a BYO key the spend is not ours**, so the cap there protects the customer rather than us. It
still applies: an account that has attached its own key can raise it, and that is a later epic.
This ADR only fixes that the cap does not disappear when the key becomes theirs.

### 3. Live plan state is **derived**. `users.plan` goes **(SB)**

`users.plan` has existed since EPIC-004 as *"substrate for per-plan defaults … until Stripe
exists."* Stripe exists now, so the substrate is replaced rather than filled in.

- A migration **drops `users.plan`**.
- The plan is read through the account's `subscriptions` row: its status and its current period.
- `plan_budget_defaults` is unchanged and keeps working, because the lookup key is the derived
  value rather than a stored one.

**The rule and its precedent.** EPIC-051 applied exactly this to `Live`: one source of truth, never
a copy, because two copies diverge. Here the divergence is somebody's money — an account showing
Pro in our column and `canceled` in Stripe is either service given away or service withheld, and
which one is a coin flip.

**A test asserts `users` has no plan-like column**, so re-adding one is a failing build rather than
a decision nobody notices.

**Cost, stated:** every plan read becomes a join. That is the trade, it is small, and it is the one
that cannot silently be wrong.

### 4. Cancellation: everything stays readable, nothing new is granted **(SB)**

When a subscription ends — cancelled, or failed payment through the dunning sequence:

- **Nothing is deleted.** Prompts, bloks, versions, runs and their history stay visible and
  exportable.
- **Publishing to Live keeps working**, and this is the deliberate part. A lapsed card must not
  break somebody's deploy.
- **New runs fall back to the Free budget**, both limits.
- **Nothing is enforced retroactively.** An account over the Free limits keeps what it has; it
  simply cannot add beyond them.

**Why publishing is not frozen.** `/security` publishes the claim *"Your build carries a copy of
its prompts. If we are unreachable your application keeps running on the last version it saw."*
A product whose billing state can break a customer's production path contradicts the sentence it
sells itself with. Withholding *new* capacity is a business decision; breaking a running system
over an expired card is a different thing and we are not doing it.

### 5. A downgrade takes effect at the period end, never immediately

EPIC-070's acceptance criterion, restated here because it is the one people get wrong in the
implementation rather than in the plan: a customer who cancels on day 3 of a paid month **keeps Pro
until day 30**. Stripe models this with `cancel_at_period_end`; our derived read must agree, which
means the read is *"is there a subscription whose current period covers now and whose status is
`active` or `trialing`"*, not *"is `cancel_at_period_end` false"*.

### 6. Team is "talk to us" **(SB)**

Team has no price, no checkout and **no feature list**. The mockup's Team tier lists SSO/SAML,
roles, an audit log, a shared blok library and private judge models. **None of the five exists**,
and four of them are separately denied by `apps/web/lib/site/not-true-yet.ts`.

A tier is a contact link. When there is something to sell, it gets a price.

### 7. Webhooks are idempotent on Stripe's event id, and an unknown type is recorded

Stripe redelivers. A second delivery that grants a second period is a money bug, and `PROCESS.md`
puts money bugs in the P0 class with data loss and keys.

- Every processed `evt_…` is stored. A replay of a stored id is a no-op that returns 200.
- **The idempotency test is written before the handler**, not after — the epic's Notes say so.
- **An unknown event type is recorded and ignored, never assumed benign.** Stripe adds event types;
  a handler that silently drops what it does not recognise cannot tell "we do not care about this"
  from "we stopped caring about something we used to handle".

### 8. Keys are configuration and nothing is committed

`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `STRIPE_PUBLISHABLE_KEY` are read from the
environment, go into `CLAUDE.md`'s Env list and `.env.example` in the same commit as the code that
reads them, and never into a tracked `.env`. Test mode is what this epic is built and proved
against; live ids are configuration set when Soroush decides to charge anybody.

## Consequences

**What this makes cheap:** changing the numbers. A price is a Stripe object and a line on a page.
Changing the *shape* — per-account to per-seat, or one limit to two — is a migration and a new
Stripe price.

**What this makes expensive, deliberately:** storing plan state anywhere but the subscription row.
§3's test is there to make that expensive.

**What is knowingly unvalidated:** the numbers themselves. EPIC-005 is cut; $29 stands on the
roadmap alone. Every report for this epic says so, as the roadmap already does.

**What this does not decide, and where each goes:**

- Annual billing, coupons, usage-based pricing, tax beyond Stripe Tax — out of scope in EPIC-070.
- Multi-user accounts, roles and invitations — the epic that builds teams, which also revisits §1.
- Raising the cents cap on a BYO key — a later epic, per §2.
- Whether $29 is the right number — a validation study, which is cut and would have to be rescoped.
