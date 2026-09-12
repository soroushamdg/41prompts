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

1. **Anyone sending `DNT: 1` or `Sec-GPC: 1` is invisible.** Analytics honours both, so a privacy-
   conscious visitor — disproportionately likely among AI engineers, which is exactly our audience —
   decompiles without being counted. The true number is higher than this one by an unknown margin.
2. **"Unique" means a distinct address hash**, not a distinct person. An office behind one NAT counts
   once no matter how many people paste something; one person on a train counts several times.
   `hashIdentity` is an HMAC with a per-deployment salt — deliberately not an identity.
3. **No announcement is part of the test**, not a limitation of it. If 300 people find this without
   being told, the wedge is findable. That is the question.

## Weekly readings

Fill in from the PostHog funnel. Leave a row blank rather than estimating it.

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
