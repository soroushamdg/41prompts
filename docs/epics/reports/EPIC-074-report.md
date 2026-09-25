<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# EPIC-074 — Managed Payments: Stripe sells, so nobody registers anything

Branch `epic/074-managed-payments`. Epic file `docs/epics/EPIC-074-managed-payments.md`,
decision record `docs/decisions/ADR-008-who-sells.md`.

**Status: done.** Soroush pressed the one button a script cannot press, and the purchase completed:
`managed_payments: {"enabled": true}`, `payment_status: paid`. §5 has what that took and why it is
permanent.

## 0. The short version

**Stripe is the merchant of record.** It sells to the customer, and it registers, files and remits
sales tax, VAT and GST in 80+ countries under its own registrations. Soroush holds none, and this
epic asks him to obtain none.

**The sentence this epic exists to protect**, because it is the one that was nearly lost:

> *"i don't and i won't have a tax code"* · *"i don't plan to register a company right now"*
> — Soroush, 2026-09-25

Both are about **registrations**. A Stripe **product tax code** is a classification string from
Stripe's own catalogue — `txcd_10103001`, "Software as a service (SaaS) — business use" — that says
*what kind of thing is being sold*. Nobody issues it, it costs nothing, and it requires no company.
The registrations are the things Stripe now holds, which is the entire reason for paying it 3.5%.

**Proved against the sandbox, end to end**: the checkout page says **"Sold through Link"**, Stripe
computed **$4.34** of Québec tax on the $29 plan — a $33.34 total — from a billing address, and a
real test-mode purchase completed with Stripe recording it as a Managed Payments sale. No
registration of ours appears anywhere in it.

## 1. What changed

| | what | where |
|---|---|---|
| 1 | **ADR-008**, before the code | `docs/decisions/ADR-008-who-sells.md` |
| 2 | `managed_payments.enabled` on every Checkout Session | `apps/web/lib/billing/checkout.ts` |
| 3 | A product tax code, provisioned and idempotent | `apps/web/lib/billing/provision.ts` |
| 4 | `STRIPE_MANAGED_PAYMENTS`, defaulting to **on** | `apps/web/lib/billing/stripe.ts` |
| 5 | Stripe's documented unsupported parameters, asserted absent | `apps/web/lib/billing/checkout.test.ts` |
| 6 | `/pricing` says who charges you, and that the debit can differ | `apps/web/app/pricing/page.tsx` |
| 7 | The refund procedure, revised for the new arrangement | `docs/billing/refunds.md` |
| 8 | Dunning kept, with the reason | `apps/web/lib/billing/dunning.ts` |

## 2. The bug that would have shipped

**The tax code was written on the create path only, and every account that matters is past its
create path.**

The first version put the repair inside `productFor`. That reads correctly and is wrong:
`priceFor` finds the price by `lookup_key` and **returns before `productFor` is ever called**. So on
any account that already had the price — which is every account after its first run — the code was
never written, the script printed success, and the next checkout would have failed with the same
`400` EPIC-070 already spent a session on.

**It was found by running the script, not by reading it**, which is the same lesson EPIC-070's
report opens with. It now runs unconditionally, reads before it writes, and is idempotent rather
than merely convergent:

```
run 1   taxcode  prod_VJVXAdL5uEHdhO  set to txcd_10103001  (was unset)
run 2   taxcode  prod_VJVXAdL5uEHdhO  already txcd_10103001
```

## 3. What was proved, and how

| claim | evidence |
|---|---|
| A session is created with `managed_payments.enabled = true` | The **real** `createCheckoutSession` against the sandbox returned a checkout URL — not a re-derived parameter set |
| **Stripe records the completed sale as Managed Payments** | Read back from Stripe by session id after the purchase: `managed_payments: {"enabled": true}` · `payment_status: paid`. What we send and what Stripe records are different claims |
| The plan still arrives, under the new arrangement | The webhook wrote **Pro**, 0 of 5000 runs, period ending 9 October — and `stripe events resend` left **one** row and one period |
| Stripe accepts our exact parameters | Same call; nothing we send conflicts with what Managed Payments manages |
| Stripe is the seller, visibly | Checkout carries **"Sold through Link"** — shot `08` |
| Stripe computes the tax | `Tax $4.34`, total `$33.34`, from a Montréal address — shot `08` |
| The product carries the classification | `tax_code: txcd_10103001`, read off the live Product |
| Provisioning is idempotent | Two consecutive runs, §2 |
| Off is possible and tested | `STRIPE_MANAGED_PAYMENTS=off\|false\|0`, with a control proving an unrecognised value reads as the **default** rather than as off |
| Nothing claims we are the seller | Grep over `apps`, `packages`, `docs` — the only hits are this epic's own files and the append-only decision log |

## 4. The drive — 21/21, and what it deliberately does not cover

`scripts/drive-epic-074.mts`. Everything EPIC-070's drive covered is kept — a purchase path is
where a regression is most expensive, and the arrangement underneath it just changed.

**Three bugs in the drive, all found by running it**: `networkidle` never fires because Link holds
a connection open; the card fields sit behind a radio where EPIC-070's page had them inline; and
**a phone number is required**, which nothing said until Stripe's own testing steps did. A required
field nobody filled looks exactly like a broken button, and it is what most of the failed attempts
were actually hitting.

**And one bug in an assertion, fixed three times**, which is worth more than the fix: it waited for
*"Enter address to calculate"* to disappear — which happens **before** the figure arrives — then
reported a failure against a feature that was working, with a message showing the top of the page
rather than the number. It now waits for the amount, reports the text around it, and asserts the
line **became a number** rather than that the number is $4.34: the same session reads `$4.34` for
the post-trial total and `$0.00` for today's, because today is a trial. A drive that fails half the
time teaches people to ignore it.

## 5. **The one thing that is Soroush's, and it blocks the merge**

**A Managed Payments checkout cannot be completed by a script, and this is the feature working.**

Five attempts. Stripe's own `hosted-payment-submit-button` is present, visible, enabled and
clicked; nothing happens — no error, no processing state, no navigation, and no subscription in the
account afterwards. The page runs **Link** with an **hCaptcha** frame beside it. That is the fraud
prevention this epic started paying 3.5% for, and a checkout that resists automation is it working.

So the drive asks, the way `docs/PROCESS.md` already has a production drive ask for a sign-in: it
waits for the **outcome** rather than for a keypress, because a drive starts from a shell with no
interactive stdin. It was offered once during this session and the five minutes expired.

**`DRIVE_HEADLESS=1` skips it and records that it skipped it**, so `gates.mjs ci` never waits on a
window and a run that bought nothing cannot read as one that did.

### It was offered twice; the second time it was taken

The first handoff expired after five minutes with nobody there, and the branch was left unmerged
rather than the criterion being ticked on Soroush's behalf — `CLAUDE.md` is explicit that a
criterion is not reinterpreted silently. The second time he pressed it and everything downstream
ran: **30 of 31**.

**The one failure was the instrument, not the product**, and it is worth writing down because it is
the third instrument bug in this epic. The assertion read `/v1/products/41p_pro` — the deterministic
id `provision.ts` uses on its **create** path — and this account's product predates that path, so it
is `prod_VJVXAdL5uEHdhO` and the read returned `resource_missing`. It then reported *"tax_code:
unset"* about a product that was correctly set, **on a purchase that had just succeeded and could
only have succeeded because the code was there.** A false alarm that contradicts the run it is part
of.

It now follows the product id from the price, and it **moved before the purchase**, because it is a
fact about Stripe objects and needs no checkout — so it runs headless too. Verified without asking
for a second click:

```
DRIVE_HEADLESS=1 npx tsx scripts/drive-epic-074.mts
  PASS  the product carries the tax classification Managed Payments requires
        — prod_VJVXAdL5uEHdhO → tax_code: txcd_10103001
  22/22
```

and directly, against Stripe:

```
$ stripe get /v1/products/prod_VJVXAdL5uEHdhO
  tax_code: txcd_10103001
```

**The watched run was not re-run to turn 30/31 into 31/31.** It would have cost another human click
to re-prove a fact already proved twice, and a drive is worth what it catches rather than what its
score reads.

## 6. This changes the Definition of Done, permanently

**The browser drive can no longer complete a purchase unattended.** That is not a regression in this
product and it will not be fixed by a better selector — it is a property of the arrangement.

Every future epic that touches billing inherits it. The honest shape is the one here: automate to
the last button, ask for that one click when a person is present, and **say so in the transcript**
when there is not. It belongs in `docs/PROCESS.md` the next time somebody edits it.

## 7. What this cost, stated

- **3.5% on top of standard processing**, about **$1 per subscriber per month** at $29. Worth ~$0
  today and material near $40k ARR — which is roughly where an accountant becomes affordable, and
  the moment to revisit.
- **Some of the customer's mail**: Stripe sends receipts, invoices and refund notices itself.
- **Dispute handling**, and Stripe may refund within 60 days on its own to head off a chargeback.
- **A cut of the currency decision**: Adaptive Pricing is on by default.

**Dunning survives anyway.** Stripe's emails are about the payment; ours is about the product, and
says what ADR-007 §4 obliges us to say — nothing was taken away, publishing keeps working. A second
email is mildly annoying; a customer who assumes a failed card broke their deploy is a churn event.

## 8. Still open, and none of it blocks

1. **The Managed Payments Terms of Service** must be accepted at
   `dashboard.stripe.com/settings/managed-payments` before live mode, and **Stripe runs an
   eligibility review** it has not been asked for yet. Canada is a supported location and software a
   supported category; whether this account is approved is Stripe's answer to give.
2. **`txcd_10103001` is the one line for an accountant.** AIaaS (`txcd_10105002`) was the other
   candidate and ADR-008 §3 says why not: on Pro the customer brings their own provider key, so what
   is sold is not model access. It is a field on a Stripe Product and cheap to change.
3. **`/pricing` prints `$29` and a Québec customer is charged `$33.34`.** The page now says the
   debit can differ. Whether it should print a tax-inclusive figure is a product decision nobody has
   made; `tax_behavior` on the Price is where it would be made.
4. **GitHub CI is still red on `main`** for two reasons that predate all of this — `ci.yml` installs
   `uv` after `pnpm test`, and the third-party notices list is platform-dependent. EPIC-070's report
   and `CURRENT.md` carry it.

## 9. Verify it

```
node scripts/with-stripe-env.mjs -- npx tsx scripts/stripe-products.mts   # twice
pnpm test && pnpm typecheck && pnpm lint
DRIVE_HEADLESS=1 npx tsx scripts/drive-epic-074.mts                        # 22/22, purchase skipped
npx tsx scripts/drive-epic-074.mts                                         # and press "Start trial"
```
