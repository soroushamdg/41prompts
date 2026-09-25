<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# EPIC-070 — Stripe, and the pricing page it makes true

Branch `epic/070-stripe-and-pricing`. Epic file `docs/epics/EPIC-070-stripe-and-pricing.md`,
plan `docs/epics/plan-EPIC-070.md`, decision record
`docs/decisions/ADR-007-plans-prices-and-what-a-seat-is.md`.

## 0. The short version

**A customer can buy Pro, the price they see is the price Stripe charges, and the plan they are on
decides what the product lets them do.** The drive completed a purchase with `4242 4242 4242 4242`,
the plan was written by a webhook Stripe actually delivered, and Stripe's own redelivery of that
event left one subscription row and one period.

**The claims guard came out in the commit that made the claim true**, both rows together — the
per-seat pattern and its control. It had been right for its whole life; what changed is the fact
underneath it, not the judgement.

**Three defects, and no test could have found any of them.** A real checkout returned `400` because
Stripe's Managed Payments is on by default and wants a product tax code. The customer portal's one
button said the portal was not configured. And the Team tier rendered as a tall box with seven
hundred pixels of nothing in it, with every assertion on the page passing over it.

**The price is unvalidated and this report says so as plainly as the roadmap does.** $29 comes from
`docs/roadmap.md`, which took it from the mockup. EPIC-005 — the pricing-validation study — is cut.
Nobody has asked a customer what this is worth. Changing the number is a Stripe row and a line on a
page; changing the *shape* is a migration, and the shape is what ADR-007 spent its argument on.

## 1. What was built

This epic ran across two sessions. The first built everything that could be built and stopped;
`docs/epics/plan-EPIC-070.md` §1b is its handoff. This lists the whole of it.

| | what | where |
|---|---|---|
| 1 | **ADR-007**, before any schema, with six of Soroush's rulings | `docs/decisions/ADR-007-…md` |
| 2 | **`plans`, `subscriptions`, `billing_customers`, `stripe_events`**, and `users.plan` dropped | `packages/db/src/schema.ts`, migration `0017` |
| 3 | **The plan, derived** — never stored, with a test that fails if a plan-like column returns | `packages/db/src/billing.ts` |
| 4 | **The run gate**, refusing in words before a run exists | `apps/web/lib/runs/plan-gate.ts` |
| 5 | **The webhook**, idempotent on Stripe's event id, seven handled types, unknown types recorded | `apps/web/app/api/stripe/webhook/route.ts`, `lib/billing/webhook.ts` |
| 6 | **Checkout and the customer portal** | `apps/web/lib/billing/checkout.ts` |
| 7 | **Settings → Billing**, a route beside the other three | `apps/web/app/app/settings/billing/` |
| 8 | **The Stripe objects**, by a script, idempotent — and now the portal configuration too | `scripts/stripe-products.mts`, `lib/billing/provision.ts` |
| 9 | **`/pricing`**, three tiers, every feature line a registry claim | `apps/web/app/pricing/page.tsx`, `lib/site/pricing.ts` |
| 10 | **The price-parity test**, both halves | `lib/site/pricing.parity.test.ts`, `pricing.test.ts` |
| 11 | **The claims-guard removal**, both rows, one commit | `lib/site/not-true-yet.ts` |
| 12 | **BYO keys as a Pro feature**, non-retroactively | `lib/runs/plan-gate.ts`, `lib/providers/actions.ts` |
| 13 | **Dunning via Resend** | `lib/billing/dunning.ts`, `lib/email.ts` |
| 14 | **The refund procedure**, written | `docs/billing/refunds.md`, `refunds-given.md` |

## 2. The order was the epic, not an accident of it

EPIC-072 refused `/pricing` in as many words: *"needs EPIC-070; no checkout, no metering, prices
marked unvalidated."* `apps/web/lib/site/not-true-yet.ts` carried

```
["a per-seat price", /\bper seat\b|\$\d+\s*(?:a|per|\/)\s*(?:month|seat)/i]
```

paired with the control `["$29 per seat / month", …]` — the mockup's own sentence.

**That denial was correct.** A page saying $29 while nothing charged $29 is a claim a reader could
hold us to and we would lose. So the guard was not worked around: checkout, the webhook, the plans
table and the run gate landed first, the claim became true, and **both rows came out in the same
commit** (`6d20015`).

Both, and that is the load-bearing part. Removing the pattern and leaving the control leaves a
control matching nothing — the exact failure the controls exist to catch. Removing the control and
leaving the pattern denies the page the epic exists to ship.

Ten patterns and eight controls remain, and every control still matches
(`lib/site/claims.test.ts`, "would still catch %s").

**What replaced it is narrower and stronger.** `site-claims.test.tsx` keeps `["a price", /\$\d/]`
over every rendered page **except `/pricing`**, with three controls: the exemption list is exactly
one route, every other page is still checked, and the exempt page really does print a price. The
old rule said *never print a price*; the new one says *print the price Stripe charges and no other*.

## 3. The Review line, made mechanical

`docs/roadmap.md` Stage 6: **"Pricing page equals Stripe."** A review line is something a person
checks on the day they write it. This is the version that runs.

**The page holds no typed price.** `$29` is produced by `moneyWords(2900)` from the same cents
figure the parity test holds the Stripe Price against, and `pricing.test.ts` asserts the module
contains **exactly one** currency literal — `"$0"`, Free's, which is not a price because nothing is
sold.

**Two halves, and the offline one matters more on most days.** `pricing.parity.test.ts` reads the
Price by `lookup_key` and fails on amount, currency, interval or an archived price. It cannot run
without `STRIPE_SECRET_KEY`, which no CI machine has — so a pair of tests where the only runnable
half checks nothing would be the `PARTIAL`-read-as-a-pass failure one level up. The comparison is a
pure function; `pricing.test.ts` exercises all five ways it can disagree offline, and the networked
file always runs one test that names which mode the run was in.

**Both halves proved to fail, not just to pass:**

```
# against the sandbox, as shipped
$ node scripts/with-stripe-env.mjs -- npx vitest run lib/site/pricing.parity
  ✓ pro matches its Stripe Price                                   3 passed

# with PRO_UNIT_AMOUNT_CENTS temporarily 3900
  × pro matches its Stripe Price
    → the page says $39 and Stripe says $29: expected [ Array(1) ] to deeply equal []
```

That message is why `priceDisagreements` returns sentences rather than a boolean.

## 4. The three defects the drive found

Every one of these was invisible to a green suite, and two were invisible to every assertion on the
page.

### 4.1 The first real checkout returned 400

> *"Invalid line_items[0]: the product tax code is missing … Product tax code is required for
> Managed Payments, which is enabled by default on your account."*

Stripe turns **Managed Payments** on for new accounts. Under it Stripe is the **merchant of
record**: it sells to the customer, it charges and remits the tax, and money reaches us as a payout
rather than as a charge we made.

**Adding a `tax_code` to the Product would have cleared the error and opted us into all of that
silently**, which is the worse of the two failures available. It is outside this epic twice over:
the epic puts tax beyond Stripe Tax out of scope, and `docs/decisions/AUTONOMOUS.md` (2026-09-24)
records Soroush's decision that **no tax is collected**, because he is not registered anywhere.

So the session passes `managed_payments: { enabled: false }` — exactly the behaviour every document
about this epic already describes. Per session rather than in the Dashboard, so it lives in the
repository and survives a Dashboard nobody remembers configuring. `stripe@22`'s types do not carry
the parameter; it is spread in through a cast, and the API names it in the error text above.

**Turning it on is a real option and possibly a good one** — it is the usual answer to selling
digital services worldwide without registering anywhere. It is in §10 as a question for Soroush.

### 4.2 The portal button said the portal was not configured

`billingPortal.sessions.create` fails until the portal's settings have been saved **once** for the
account, and nothing in the code can tell that from any other portal failure — `createPortalSession`
reports it as "not configured yet", which is the right thing for it to say and the wrong thing to
leave true. A settings page whose one button says the feature is not configured is a feature that is
not shipped.

`provision.ts` creates the default configuration now, beside the price, for the same reason: a thing
clicked into existence in one Dashboard exists in one account and nobody can say how it was made. It
allows a payment-method update, invoice history, and **cancellation at the period end** — ADR-007 §5
expressed to Stripe rather than restated in prose. Idempotent by asking first; proved over two
consecutive runs.

**The drive's assertion was also wrong and was tightened.** The first version accepted *either* "the
portal opened" *or* "the page said it is not configured" — a test that passes both ways, and it
passed the wrong way. It now requires `billing.stripe.com`.

### 4.3 The Team tier read as a card that had failed to load

The screenshot showed a tall box with a heading at the top, a button at the bottom and seven hundred
pixels of nothing between. **Every assertion on the page passed over it**, including the one
asserting Team has no feature list, which is the content decision that caused it.

Identical in shape and cause to EPIC-072b's `/about`: correct content in a layout drawn for more of
it. Team gains two sentences saying why there is no number. They are **not a feature list by another
name** (ADR-007 §6) — they name nothing the product does not do.

**The guard written for it was vacuous and was rewritten, which is the more useful half of this
finding.** "How much of the card do its children span" reads 94% for every tier whether Team has
content or not, because `margin-top: auto` pins the button to the bottom either way — a guard that
cannot fail. It now counts each tier's text with the name, amount, cadence and button removed:
**783 · 1088 · 301 characters**, and **zero** on the version that was broken.

## 5. The drive — 24/24, watched, against the built app

`scripts/drive-epic-070.mts`; transcript at
`docs/epics/reports/screenshots/EPIC-070/transcript.txt`. Its header carries the exact commands.

```
PASS  the built app serves /pricing styled, reached by clicking the home page's own button
PASS  three tiers, and two of them carry an amount — 3 tiers · $0 · $29
PASS  Pro's amount is $29, formatted from the cents the parity test compares
PASS  Free's amount is $0
PASS  Team has no amount and no feature list, and says so rather than showing an empty card
PASS  every tier says something between its name and its button — 783 chars · 1088 chars · 301 chars
PASS  the Pro card is plated heavier than the other two, as the mockup draws it
PASS  the three buttons line up, though the three lists are different lengths — 1342 · 1342 · 1342
PASS  the nav marks Pricing as the current page
PASS  /pricing does not scroll sideways at 390px — overflow 0px
PASS  Billing shows the Free plan, the meter at zero of fifty, and the date the period starts again
PASS  a Free account is refused a provider key, in words that name Pro and where to change it
PASS  and nothing was stored, so the refusal is a refusal rather than a message over a write
PASS  a run past the plan's limit is refused on the page, naming the number, the plan and the reset date
PASS  and the refused run wrote no row, so a refusal cannot spend the quota — suite_runs: 1
PASS  the Upgrade button reaches Stripe's own Checkout — checkout.stripe.com
PASS  Checkout completes and returns to Settings → Billing — returned with a session id
PASS  the plan the webhook wrote is Pro, with Pro's run limit and Stripe's own period end
PASS  exactly one subscription row exists after the purchase — subscriptions: 1
PASS  the same account on Pro is no longer refused the key
PASS  the subscription event is in the ledger, so there is something to replay
PASS  Stripe redelivered the same event and it left one subscription row and one period
PASS  the page offers a portal button once there is a subscription to manage
PASS  the customer portal opens — billing.stripe.com
24/24
```

Screenshots `01`–`10` in the same directory: `/pricing` at 1440 light and dark and at 390, Billing
on Free, the BYO refusal, the run-limit refusal, Stripe's Checkout, Billing on Pro, the key accepted
on Pro, and the portal.

**What the drive changes in the database, and why it is not seeding.**
`plans.monthly_run_limit` for Free is lowered to **1** for one section and put back. That is
deployment configuration in the same category as the cents cap, not account data — and fifty runs
through the UI to photograph a refusal is an afternoon, not a drive. **Everything the account owns
is still made by clicking**: the project, the prompt, the blok, the variable, the inputs and the run.

**`FAKE_PROVIDER=1`, so no model was called.** The key the drive stores on Pro was accepted by the
deterministic fake, not by Anthropic. The drive proves the plan gate opened, and proves nothing
about whether Anthropic would take that string.

## 6. The money bug, proved twice

The epic calls this the P0 class, and it has two proofs that fail differently.

**Offline, in `lib/billing/webhook.test.ts`:** a redelivered event id leaves one subscription row and
one period; a *different* event id does write, so the ledger is what stopped the replay; two
concurrent deliveries of one event claim it exactly once; an unknown type is recorded with
`handled: false`. The claim is `INSERT … ON CONFLICT DO NOTHING RETURNING`, one statement, because a
`SELECT`-then-`INSERT` has a window and a timeout-then-retry is exactly what walks into it.

**Against Stripe, in the drive:** `stripe events resend <evt_…>` on an event the route had already
seen. Rows 1 → 1, period unchanged.

The offline test proves the property; the resend proves Stripe does what we think it does.

## 7. What BYO keys becoming a Pro feature does and does not do

Scope item 6. **Nothing is taken away from anybody** (ADR-007 §4):

- a key already attached keeps working, whatever plan the account is on;
- **replacing one is still allowed.** A customer whose key has leaked has to be able to rotate it,
  and a gate that stops them turns a downgrade into a security incident — a much worse thing than a
  plan boundary somebody stepped over;
- a Free account runs on the deployment's key inside the cents cap, which is what ADR-007 §2's own
  argument already assumes when it says *"the cents cap is the only thing standing between a Free
  account and a real invoice."*

**The check runs before the provider is asked to verify the key**, so a key we will refuse to store
is never sent over the network. That ordering is in the code with the reason.

## 8. Acceptance criteria

| criterion | evidence |
|---|---|
| ADR-007 written and merged before the migration | `docs/decisions/ADR-007-…md`, commit `b457f39`; migration in `c4046a4` |
| Checkout completes against test mode and the plan is visible | drive, "Checkout completes…" and "the plan the webhook wrote is Pro"; shots `07`, `08` |
| A webhook delivered twice has the effect of one | `webhook.test.ts` "a redelivered event leaves one subscription row and one period"; drive, "Stripe redelivered the same event…" |
| An unknown event type is recorded and ignored | `webhook.test.ts` "records an unknown type with handled false, rather than dropping it" |
| Plan state is derived; a test fails if a plan column is added to `users` | `packages/db/src/billing.test.ts`, the `users` column assertion |
| A run over budget is refused in words naming the budget and the plan, visible in the UI | `plan-gate.test.ts`; drive "a run past the plan's limit is refused on the page…"; shot `06` |
| Downgrade takes effect at the period end | `billing.test.ts` — `cancelAtPeriodEnd` is not consulted by the plan read; portal configured `mode: "at_period_end"` |
| `/pricing`'s prices match Stripe, read rather than retyped | `pricing.parity.test.ts`, green against the sandbox and **proved red at $39** (§3) |
| Every feature line is in `claims.ts` citing a shipped epic | `pricing.test.ts`, "%s's %s is a registry claim", eleven lines |
| `NOT_TRUE_YET`'s per-seat row and its control both removed in one commit; the rest still match | commit `6d20015`; `claims.test.ts` "would still catch %s", eight controls |
| No secret in the repository; gitleaks green | `node scripts/audit.mjs` — `secrets PASS`, 13 raw hits over the whole history, 13 accepted (all pre-existing) |
| Settings → Billing shows runs used against budget and the period end | shots `04` (Free, 0 of 50) and `08` (Pro, 0 of 5000, period from Stripe) |
| Lighthouse ≥90 on `/pricing`, accessibility 100; no sideways scroll at 390px | **P95 A100 B100 S100**; drive "overflow 0px" |
| All gates green per package; `gates.mjs ci` green before merge | §9 |
| The built app driven through a test-mode purchase, screenshots | §5 |
| Report and session log, with the unvalidated-price caveat restated | this file §0 and §11; `docs/epics/sessions/EPIC-070-session.md` |

## 9. The gate

`node scripts/gates.mjs ci` — see §12 for the run and its closing block.

## 10. What is Soroush's, and is not blocking

1. **Managed Payments: on or off?** It is off (§4.1), which matches every decision on file. Turning
   it on makes Stripe the merchant of record and hands it the tax problem `AUTONOMOUS.md`'s
   2026-09-24 row leaves open — the exposure being real: B2C digital services into the EU and UK
   carry a VAT obligation from the first sale, with no threshold. This is the cheapest moment to
   decide it, and it is a decision for him and an accountant, not for this epic.
2. **The live key and live objects.** Everything here is the `41prompts` **sandbox**. Going live is:
   `STRIPE_SECRET_KEY` (live), `STRIPE_WEBHOOK_SECRET` (from a real endpoint, not `stripe listen`),
   `STRIPE_PUBLISHABLE_KEY`, then `scripts/stripe-products.mts` against the live account — which
   **refuses a live key on purpose**, so putting live objects in place is a deliberate act with a
   person watching. §13 has the list.
3. **A restricted key.** The sandbox key is `sk_test`, not `rk_test`. Stripe's guidance is least
   privilege and it matters for the live key rather than this one.
4. **No CSP header anywhere in this app.** Stripe.js and Checkout want `https://*.stripe.com` in
   `script-src`, `frame-src` and `connect-src`. Pre-existing and wider than billing; a row of its
   own.
5. **$29 is unvalidated.** EPIC-005 is cut. Changing it is a Stripe row and a line on a page.
6. **The sandbox webhook signing secret was echoed into this session's transcript** by a `grep` over
   `stripe listen`'s output. It is a test-mode CLI secret for a sandbox with no real customers, and
   `stripe listen` mints one per session, so the exposure is small — but it is his to roll if he
   wants to, in the Dashboard's webhook settings.

## 11. The price, said plainly

**$29 has never been validated.** It is on `docs/roadmap.md` because it is in the mockup.
`docs/epics/EPIC-005` — the pricing-validation study — is **cut**, and ADR-007's Context paragraph
says the number is the cheap part and the structure is the expensive one. Nothing in this epic is
evidence that $29 is right; everything in it is evidence that $29 is what we charge, which is a
different claim and the only one the page makes.

## 12. Verify it

```
# unit, types, lint
pnpm test && pnpm typecheck && pnpm lint

# the parity test against the real sandbox
node scripts/with-stripe-env.mjs -- npx vitest run --root apps/web lib/site/pricing.parity
#   then set PRO_UNIT_AMOUNT_CENTS to 3900 → "the page says $39 and Stripe says $29"

# the guard came out and the rest still match
npx vitest run --root apps/web lib/site/claims.test.ts

# secrets
node scripts/audit.mjs

# Lighthouse (needs the built app serving)
node scripts/lighthouse-site.mjs http://127.0.0.1:3170

# the drive — the block at the top of scripts/drive-epic-070.mts
npx tsx scripts/drive-epic-070.mts
```

## 13. The environment variables, and what each is for

Already in `CLAUDE.md`'s Env list and `.env.example`; `docs/security/key-inventory.md` documents all
three (the audit's `key-inventory` check is green at 28 in use, 28 documented).

| variable | what happens without it |
|---|---|
| `STRIPE_SECRET_KEY` | **billing is absent, and that is a supported state.** Every page serves, Settings → Billing says so in words, and the webhook answers 200 |
| `STRIPE_WEBHOOK_SECRET` | the webhook answers 200 and acts on nothing, because an unverified payload is not evidence |
| `STRIPE_PUBLISHABLE_KEY` | nothing today — no Stripe.js is loaded; Checkout is a redirect |
