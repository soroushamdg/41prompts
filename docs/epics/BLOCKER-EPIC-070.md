<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# BLOCKER — EPIC-070: Stripe, and the pricing page it makes true

**Written 2026-09-22**, before any code, after EPIC-072b merged and this row came up next in
`docs/epics/plan-mockup-parity.md`.

## The short version

**There is no 41Prompts Stripe account — not live, and not test mode either.** The epic was written
on the assumption that only the *live* ids were missing and that test mode was available to build
against. It is not, so the three acceptance criteria that are the point of the epic cannot be met
and the rest should not ship without them.

**One thing from you clears it**, and it is about five minutes: a Stripe account in test mode and
`stripe login` on this machine, or a `sk_test_…` key handed over the way `~/.41prompts/staging.env`
holds the Coolify token. §4 is the exact list.

## 1. Where it surfaced, and what was actually checked

Probed rather than assumed, because "no Stripe key" and "a Stripe key I have not found" look the
same from the outside:

| checked | result |
|---|---|
| `.env` | 13 variables, none of them `STRIPE_*` |
| `.env.example` | 38 variables, none of them `STRIPE_*` |
| `grep -rn "STRIPE_"` over the whole repository | nothing |
| `stripe` in any `package.json` | not a dependency anywhere |
| `~/.41prompts/staging.env` | `COOLIFY_URL` and `COOLIFY_API_TOKEN`, nothing else |
| Stripe CLI installed | **yes**, `/usr/local/bin/stripe`, version 1.37.3 |
| Stripe CLI logged in | **yes — to somebody else.** `display_name = 'TimeBud sandbox'` |
| that login's key | `test_mode_key_expires_at = '2026-06-11'` — **expired three months ago** |

No value from any of those files was printed, here or in the transcript.

**The CLI login is another project's sandbox.** Creating 41Prompts products and prices inside
TimeBud's Stripe account would put this product's billing objects in an account that is not this
product's, and it is expired anyway. It is not a usable credential for this epic and was not used.

## 2. Which criteria this blocks, and why the rest cannot ship without them

Stripe has no offline mode: a test-mode API key requires an account. Three criteria are therefore
not reachable at all, and they are the three the epic exists for.

| | criterion | why it cannot be met |
|---|---|---|
| ✗ | *"Checkout completes against Stripe test mode and the resulting plan is visible in the product. Evidence: the drive, end to end, with a test card."* | no account, so no checkout session |
| ✗ | *"`/pricing`'s three tiers match the Stripe prices **read from Stripe**, not retyped. Evidence: a test that fails when the two disagree"* | nothing to read from. This is `docs/roadmap.md`'s Review line for the epic — *"Pricing page equals Stripe"* — made mechanical, and it is the criterion that stops the page being a retyped claim |
| ✗ | *"The built app driven in a browser through a test-mode purchase, screenshots in the report."* | same |

The `stripe listen` / `stripe trigger` / `stripe events resend` block in the epic's own Verification
section needs the same login.

**Why not build the rest and leave those three.** The epic's whole architecture is *make the claim
true, then remove the guard in the same commit*:

> `claims.test.ts` denies `["a per-seat price", /\bper seat\b|\$\d+…/]` … **That denial is correct
> today.** A page saying $29 per seat when nothing charges $29 is a claim a reader could hold us to
> and we would lose.

A version of this epic that ships `/pricing` without checkout publishes exactly that sentence. A
version that ships plan-based `run_budgets` without checkout enforces quotas for plans nobody can
buy, on a `users.plan` column that nothing can change. `docs/AUTONOMOUS.md` is direct about the
shape: **"Do not build a half version. Do not tick the row."**

## 3. A second thing, independent of the account, and it is a criterion that would fail on day one

> *"Plan state is **derived**, and a test fails if a plan column is ever added to `users`."*

**`users.plan` already exists.** `packages/db/src/schema.ts:41`, added by EPIC-004, with a comment
that names this epic:

> *"EPIC-004 decision 6's substrate for 'per-plan defaults' — there is no billing integration yet
> (EPIC-070), just a plain string a new `run_budgets` row's default cap is looked up against in
> `plan_budget_defaults`. Every account defaults to 'free' until Stripe exists."*

So the criterion as written fails against the schema it inherits, and the epic needs to say which
of three it means:

- **`users.plan` goes**, replaced by a read through `subscriptions`, with a migration — and
  `plan_budget_defaults` keeps working because the lookup key comes from the derived value;
- **`users.plan` stays as a cache** written only by the webhook, with the test asserting *nothing
  but the webhook writes it* rather than asserting the column does not exist;
- **the criterion is reworded** to "no *second* source of truth", which is what it is reaching for.

The first is the one consistent with the epic's own reasoning — *"two copies diverge, and here the
divergence is somebody's money"*, the rule EPIC-051 applied to `Live`. It is a ruling either way,
and it belongs in **ADR-007**, which the epic already requires to be written before the migration.

## 4. What clears this, exactly

**Either** of these, and the first is less work for you:

1. **A Stripe account for 41Prompts in test mode, and `stripe login` on this machine.** Test mode
   needs no payment method, no business details and no verification — it is free and immediate.
   After `stripe login` the CLI writes its own `sk_test_…` and everything in the epic's Verification
   block works. The current `[default]` profile belongs to TimeBud; use a named profile
   (`stripe login --project-name 41prompts`) so neither account can be reached by accident from the
   other.

2. **A test-mode secret key handed over the way the Coolify token is** — a line in
   `~/.41prompts/`, outside the repository, never committed and never printed. Then:
   `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `STRIPE_PUBLISHABLE_KEY` read from the
   environment, added to `CLAUDE.md`'s Env list and to `.env.example` in the same commit as the
   code that reads them.

**Live keys and live product ids are not needed to close the epic** and should not be handed over
now — the epic file already says so, and it is right: they are configuration, and the report will
list exactly which variables you set when you are ready to charge anybody.

**And one ruling, which does not wait on the account:** §3's three options. Answering it now means
ADR-007 can be written in the same session the key arrives.

## 5. Options, since this file is meant to offer them

| | option | what it costs |
|---|---|---|
| **A** | **You create the test-mode account and this epic runs as written.** | ~5 minutes of yours. Recommended — nothing about the epic changes, and it is the only option where `/pricing` ships this stage. |
| B | **Split it: EPIC-070a is ADR-007 alone**, the plans/seats/downgrade/quota rulings written down, no schema and no code. Then 070 proper when the key exists. | Real work and genuinely unblocked, but it is a document, and the decisions in it are yours rather than mine — so it would be a draft for you to rule on, not a finished ADR. |
| C | **Defer EPIC-070**, take `EPIC-025` (In-app Import) off the programme's unscheduled line instead, and come back to billing. | `plan-mockup-parity.md` calls 025 *"the one mockup app screen that is a genuine new surface rather than chrome"* and says it should be decided **after** 023 and 024 land — which they have. Nothing in it needs an account. |
| D | Cut `/pricing` from this stage and leave the denylist as it is. | The site keeps saying nothing about price, which is honest. But Stage 6 is *"Billing and launch"*, so this is deferring the stage rather than the epic. |

**No row has been ticked and no code has been written.** `docs/epics/plan-mockup-parity.md` still
shows EPIC-070 as next, and `docs/backlog.md` has not been touched — setting its status is yours,
per `docs/AUTONOMOUS.md`: *"Do not set the row to `blocked` yourself."*
