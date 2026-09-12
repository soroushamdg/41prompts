# M1 measurement window

**Opens 2026-09-11 (Friday). Closes 2026-10-11 (Sunday).** Thirty days.

Production went live with `v0.1.0` at **2026-09-12 00:17 UTC** — the evening of the 11th in Montréal,
which is the date above. Before that tag, production had been serving a build with no `/decompile` at
all, so the window and the product start together.

> **One condition on the start date.** The apex `41prompts.ai` is **not routed yet**: production serves
> `app.41prompts.ai`, and the apex has no certificate. Everything the product advertises about itself —
> canonical URLs, `sitemap.xml`, `llms.txt` — points at `app.41prompts.ai`, so the measurement is
> internally consistent and can run as it stands. But "findable" is the thing being measured, and a
> brand's apex returning a TLS error is a real handicap on it. **If the apex is routed within a few
> days, leave these dates alone.** If it takes longer than that, move both dates to the day it lands
> and say so here — a window that measures findability should not start before the front door opens.

## What counts, and where it is counted

**The source of truth is `decompile_runs` in our own Postgres.** One row per decompile that actually
ran: a keyed address hash, two integers about the shape of the result, a timestamp. No cookie, no
third party, nothing leaving Montréal, no prompt text. `readM1(db, from, to)` in `packages/db` is the
one way to read it, so the number is derived the same way every time.

**This replaced a PostHog funnel on 2026-09-12**, one day into the window. Counting anonymous EU and
Québec visitors by default, with a cookie and a stable id, through a processor outside Canada, is not
defensible under GDPR or Law 25 — and a consent banner is the wrong fix, because a number gathered
behind one measures who accepts banners rather than whether the wedge works. PostHog is still wired
and now fires only after explicit consent; its funnel is **supplementary** and is not what GATE 1
reads.

**The start date does not move.** Shares are backfillable: `decompiles` has carried `ip_hash` and
`created_at` since `v0.1.0`, so the share side of the criterion is complete from 2026-09-11.

**One thing is not backfillable, and it should be said plainly.** Nothing wrote a row per *run* before
2026-09-12 — runs existed only as PostHog events. Those could be exported, but they were gathered
under exactly the default this change overturned, so they are not used. **The run count therefore
begins at the 2026-09-12 deploy while the window still opens on 2026-09-11**, which makes the count a
floor by roughly one day of traffic on a site nobody had been told about yet.

## The criterion, verbatim

From `docs/roadmap.md`, the M1 row:

> **Goal:** Turn any pasted prompt into named, multi-range bloks with findings, no signup
>
> **Kill criterion:** 300 unique decompiles in the first 30 days without announcement; ≥15% share or
> waitlist rate
>
> **Failure action:** Under 100 decompiles in 30 days: the wedge is not findable; rework EPIC-015
> before Stage 2

## The rule

**Nothing about the product changes between those two dates.**

Not the copy, not the layout, not a new finding, not a better headline. The only permitted change is a
defect that makes the decompiler *wrong* or *unavailable* — a crash, a broken deploy, a finding that
fires falsely, data being stored when the page says it is not.

The reason is not discipline for its own sake. **A thirty-day measurement with three product changes
inside it measures nothing**: there is no way afterwards to say whether the number came from the
product, the changes, or the order they landed in. A tempting improvement on day 9 costs the entire
window.

If something is worth changing, write it down and ship it on the 12th of October.

The counter is read **weekly, not daily**. Reading it daily produces the urge to act on noise, and
acting on noise is how the rule above gets broken.

## What the number will and will not include

**It is a floor, not a count of humans.** Three things pull it down or blur it, and whoever reads this
at GATE 1 needs all three:

1. **Runs before 2026-09-12 are not in it** (see above). About a day, on a site nobody had been told
   about. The *server-side* count does not honour `DNT`, and deliberately: it is a first-party
   aggregate of our own service with a pseudonymous key and no cookie, not cross-site tracking, and
   honouring a cross-site signal here would reintroduce exactly the blind spot this change removed.
   PostHog, which is the thing DNT is about, honours it and GPC and does not fire without consent.
2. **"Unique" means a distinct address hash**, not a distinct person. An office behind one NAT counts
   once no matter how many people paste something; one person on a train counts several times.
   `hashIdentity` is an HMAC with a per-deployment salt — deliberately not an identity.
3. **No announcement is part of the test**, not a limitation of it. If 300 people find this without
   being told, the wedge is findable. That is the question.

## Changes made inside the window, and why each was allowed

The rule below permits exactly one kind of change. Every exercise of it is recorded here, with the
reason, so the exception cannot quietly become the rule.

| date | change | why it qualified |
|---|---|---|
| 2026-09-12 | **Consent and counting.** M1 moved from a PostHog funnel to a server-side count in our own Postgres; PostHog now fires only after explicit consent. | It fixes a measurement that would otherwise read **zero for thirty days**. A window measuring nothing is not a window. |
| 2026-09-12 | **Host split.** `41prompts.ai` serves the public product and `app.41prompts.ai` everything behind a session, with 301s both ways and canonicals naming the apex. Shipped with the decided landing copy. | It affects **findability**, which is what M1 measures. A brand's apex that does not serve the product handicaps the only thing being tested. |

Neither changes what the decompiler does, beyond the landing copy shipped with the second.

**One thing the second change surfaced and did not fix**, because it needs a ruling rather than an
edit: `v0.2.0` made **"nothing is stored" false** in eleven user-facing strings. A row per run now
exists — a keyed hash, two integers, a timestamp, and nothing about the prompt. "Your prompt is not
stored" is still true; "nothing is stored" is not. Listed in full in
`docs/reports/host-split-report.md` §4. Correcting a claim that is no longer true is a defect fix, not
a product change, so it qualifies under the rule whenever the wording is decided.

## Held until the window closes

Things noticed during the window that are **not** defects making the decompiler wrong or unavailable,
and so must wait for 2026-10-12. Add to this list rather than fixing.

| | |
|---|---|
| `/decompile`'s **Decompile** button has no explicit `min-height` at the small breakpoint, so its height comes from font metrics and lands on 44px exactly — it reached CI at `43.99998474121094`. EPIC-013 gave `.blok-view-control .btn` headroom for this reason and missed this one. The test now rounds the measurement to a hundredth of a pixel; the CSS still wants `min-height: 46px`. | found 2026-09-12 |

## Weekly readings

Fill in from the PostHog funnel. Leave a row blank rather than estimating it.

Read with `readM1`, not by hand. Unique decompiles is `uniqueCallers`; shares is `sharers`.

| week ending | unique decompiles | shares | waitlist joins | share-or-waitlist rate | notes |
|---|---|---|---|---|---|
| 2026-09-18 | | | | | |
| 2026-09-25 | | | | | |
| 2026-10-02 | | | | | |
| 2026-10-09 | | | | | |
| **2026-10-11 (close)** | | | | | |

## What happens at the close

EPIC-084 reads the result and sizes what comes next; GATE 1 decides on it. Neither runs before
2026-10-11 — EPIC-084 is blocked until then, and the backlog says so.

Three outcomes are written down now, before the number exists, so the reading is not negotiated
afterwards:

| | |
|---|---|
| **≥ 300 decompiles and ≥ 15%** | The wedge is findable and the value lands. Stage 2 proceeds. |
| **100–299, or ≥ 300 with a low rate** | Ambiguous, and the honest answer is that it is ambiguous. EPIC-084 works out which half is weak — findability or value — before anything is rebuilt. |
| **Under 100** | The wedge is not findable. Rework EPIC-015 before Stage 2, per the failure action above. |
