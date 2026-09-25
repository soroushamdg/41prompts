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

## 1b. Where this is, 2026-09-24 — **the account arrived; step 4 is half done**

**`STRIPE_SECRET_KEY` exists.** Soroush created the `41prompts sandbox` on 2026-09-23 (test key
valid to 2026-12-22) and the blocker is cleared. `docs/epics/BLOCKER-EPIC-070.md` stays as the
record of why it was written, not as a live blocker.

Ten commits on `epic/070-stripe-and-pricing`, none merged:

| commit | what |
|---|---|
| `b457f39` | ADR-007, this plan, the epic into `CURRENT.md` |
| `c4046a4` | the billing schema; `users.plan` dropped; the plan derived |
| `0334504` | the run limit, refused in words before a run exists |
| `6739508` | the webhook, idempotent on Stripe's event id, proved to fire |
| `3e8ac67` | **the Stripe-review fixes** — four missing lifecycle events, and the customer as the ownership boundary |
| `7fee7cb` | the provisioning script, idempotent, and the search-consistency bug it found |
| `c1318e0` | four of Soroush's rulings (two changed a page) |
| `ef425aa` | the sixth check row; GATE 3 and GATE 5 recorded as passed |
| `0a5753f` | **checkout, the customer portal, Settings → Billing** |

Gates on that tree: `pnpm test` 9/9 · `typecheck` 9/9 · `lint` 12/12 · `dead-code` clean.
`gates.mjs ci` has **not** been run — it gates a merge and there is nothing to merge yet.

### The Stripe objects that exist

`41Prompts Pro`, one Product, one recurring monthly Price at **$29**,
`lookup_key: 41p_pro_monthly`, written into `plans.stripe_price_id`. Re-running
`scripts/stripe-products.mts` creates nothing — proved over three consecutive runs.

### Reviewed against Stripe's own guidance, 2026-09-23

`stripe_implementation_planner` was unreachable (the MCP server needs OAuth), so the documented
fallback `npx skills add https://docs.stripe.com` was used and the integration reviewed against
`stripe-best-practices`. **Two real defects, both fixed in `3e8ac67`** — see that commit. The skills
live in `.agents/skills/` and are gitignored.

**Still open from that review, and none of it blocks the epic:**

- **No CSP header anywhere in this app.** Stripe.js and Checkout want `https://*.stripe.com` in
  `script-src`, `frame-src` and `connect-src`. Pre-existing and wider than billing; it is a row of
  its own rather than a line in this one.
- **The key is `sk_test`, not a restricted `rk_`.** Stripe's recommendation is least privilege.
  Matters for the live key rather than the sandbox one.
- **Stripe Tax is off and stays off** — Soroush is not registered anywhere and sells worldwide. The
  exposure is in `docs/decisions/AUTONOMOUS.md`, 2026-09-24, and is his and an accountant's.

## 4bis. What is left, in order

The rest of §4. Nothing below is blocked.

| | what | notes |
|---|---|---|
| 4c | **`stripe listen` + `stripe trigger` + `stripe events resend`** | The one acceptance criterion that needs the real thing: *one subscription row after the resend, not two*. The offline proof already exists; this is the same property against Stripe's own delivery. `stripe listen --project-name 41prompts --forward-to localhost:3120/api/stripe/webhook` |
| 4d/4e | **`/pricing`**, and the **price-parity test** | The parity test is `docs/roadmap.md`'s Review line made mechanical: the page's numbers read **from Stripe**, failing when the two disagree. Team is a contact link with no feature list (ADR-007 §6). |
| 4g | **The claims-guard removal** | Delete `["a per-seat price", …]` **and** its control row together, in one commit, with the reason in the message. §4g below has the detail and it has not changed: `$29 / month` still matches the pattern's second alternative. |
| 4h | **Dunning via Resend**, and the refund path as a written procedure in `docs/` | `invoice.payment_failed` is already handled and is the trigger. |
| — | **The drive**, through a test-mode purchase with card `4242 4242 4242 4242`, screenshots into `docs/epics/reports/screenshots/EPIC-070/` | |
| — | **Lighthouse** over `/pricing`; `pnpm audit-run`'s gitleaks step | The first secrets added to the environment since EPIC-042. |
| — | Report, session log, `gates.mjs ci`, `git merge --no-ff` | |

**`/pricing` joins five lists, not four** — `public-routes.json`, `sitemap.ts`, `robots.ts`,
`site-claims.test.tsx`'s `PAGES`, **and `PUBLIC_PATHS` in `lib/site/hosts.ts`**, which is the one
EPIC-072b's plan missed. `site-pages.spec.ts` also asserts `/pricing` **is a 404 today**; that
assertion comes out with this epic and the route that is on no roadmap stays as the control.

## 4ter. Not this epic

**Invoicing is its own row** (Soroush, 2026-09-24): manual invoices to Team customers who agreed a
price by email. The two invoice webhook events it needs are already handled; the rest is a
documented procedure and whatever surface sends one. It shares almost nothing with subscription
billing and folding it in would widen the largest epic in the programme.

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
