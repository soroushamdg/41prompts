<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# Session — EPIC-074

2026-09-25. Branch `epic/074-managed-payments`. Report `docs/epics/reports/EPIC-074-report.md`.

## The prompt

EPIC-070's report §10 asked one question. Soroush answered it:

> **"let's do managed payments"**

and then, while the work was starting, three more messages that turned out to be the important part
of the session:

> *"i don't and i won't have a tax code"* · *"i don't plan to register a company right now"* ·
> *"i just want the payments work"*

## The misunderstanding, and why correcting it was the job

The first two sentences read as a refusal of the epic and were not. **A Stripe product tax code is a
classification string, not a tax registration**: `txcd_10103001` means "this is SaaS", nobody issues
it, it costs nothing, and it needs no company. The registrations — VAT, GST, HST — are the things
Managed Payments exists so that he never has.

It would have been easy to treat those messages as a stop and write a blocker. It would also have
been wrong, and the cost of being wrong was the whole feature. **The correction is in ADR-008 §2 as
a table**, and repeated in `provision.ts` beside the constant, because "tax code" reads like "tax
number" to almost everybody and the next person to edit that file is exactly who must not slip.

The third sentence set the pace: no ceremony, get it working.

## What took the time, and it was not the code

The code is small — a flag, a tax code, a config read. **Six drive attempts** went into the last
step, and the answer is that there isn't one:

1. `networkidle` never fires — Link holds a connection open.
2. The card fields are behind a radio; EPIC-070's page had them inline.
3. A **phone number** is required, and nothing said so until Stripe's own testing steps did.
4. The country defaulted to Canada and a US ZIP was typed into it.
5. `hosted-payment-submit-button` is present, visible, enabled, clicked — and nothing happens.
6. Offered to a person; the five minutes expired.

**The submit is not automatable**, and that is the fraud prevention this epic started paying for.
Report §5 and §6.

## The bug worth remembering

The tax code was written **on the create path only**, and `priceFor` returns before `productFor` is
ever called once the price exists. Every account past its first run would have been silently
unprovisioned, with the script printing success. Found by running it twice; invisible to reading.

That is EPIC-070's lesson repeating inside EPIC-074, in a function whose comment I had already
written to warn about exactly this case.

## The assertion bug, which is the better story

The drive's tax assertion was fixed **three times**:

1. It read `order-details`, which under Managed Payments has no tax line.
2. It waited for *"Enter address to calculate"* to disappear — which happens **before** the figure
   arrives — so it read `$29.00` and failed against a feature that was working.
3. Its failure message printed the top of the page rather than the number, which is why (1) and (2)
   each cost a run to diagnose.

It now waits for the amount, reports the text around it, and asserts the line **became a number**
rather than that the number is `$4.34` — because the same session reads `$4.34` for the post-trial
total and `$0.00` for today's. **A figure in an assertion that is right half the time is worse than
no assertion**, and the figure belongs in the report with its screenshot, which is where it is.

## Verification, tails

```
pnpm test        9 checked, 9 passed
pnpm typecheck   9 checked, 9 passed
pnpm lint        12 checked, 12 passed

node scripts/with-stripe-env.mjs -- npx tsx scripts/stripe-products.mts
  run 1   taxcode  prod_VJVXAdL5uEHdhO  set to txcd_10103001  (was unset)
  run 2   taxcode  prod_VJVXAdL5uEHdhO  already txcd_10103001

DRIVE_HEADLESS=1 npx tsx scripts/drive-epic-074.mts
  21/21   (the purchase itself skipped, and recorded as skipped)
```

From the sandbox, on the checkout page: **Sold through Link**, `Subtotal $29.00`, `Tax $4.34`,
`Total after trial $33.34`.

## Not merged, and that is the decision

One acceptance criterion — *"a Checkout Session is created with `managed_payments.enabled = true`
and Stripe accepts it. Evidence: the drive, end to end, with a test card"* — is not satisfied end to
end, because the last click needs a person. `CLAUDE.md` says a criterion is not reinterpreted
silently and `docs/AUTONOMOUS.md` that a step needing a person is named rather than faked, so the
branch waits.

`node scripts/gates.mjs ci` has **not** been run: it gates a merge and there is nothing to merge
until that button is pressed.

## For the next session

One action completes this: run the drive with a person present and press **Start trial**. Everything
after it already exists and already passed under EPIC-070.

Then: `gates.mjs ci`, merge, tick the backlog. Report §8 has four things that are Soroush's, none
blocking, and §6 has the one that outlives the epic — the Definition of Done's browser drive can no
longer complete a purchase unattended, and `docs/PROCESS.md` should say so.
