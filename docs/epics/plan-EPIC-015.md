# Plan — EPIC-015: Soft ship

## What this epic is actually for

Not traffic. **Evidence.** EPIC-005 and EPIC-080 are cut, so the thirty-day window this epic opens is
the only thing standing between us and GATE 1 guessing. That makes two things matter more than the
code: that the measurement is honest, and that nothing moves while it runs.

So the plan is ordered by what would invalidate the measurement, not by what is hardest to build.

## The thing that would silently produce a zero

**`hasAnalyticsConsent` returns `false` for an anonymous visitor in production.** EPIC-004 decision 8
built it that way deliberately — *"an anonymous visitor in production with no cookie banner yet
(EPIC-017 builds the banner; until then, anonymous production traffic is simply not captured)"*.

Every visitor this epic is counting is anonymous and in production. **Shipped as-is, the funnel would
read zero for thirty days and we would not find out until we looked.** That is the failure this plan
exists to prevent.

EPIC-015's decision 9 settles the direction: *"a visitor who **declines** is not counted"* — declining
is an act, so the default is counted. Concretely:

| | counted? |
|---|---|
| `DNT: 1` or `Sec-GPC: 1` | **no** |
| Consent cookie explicitly `denied` | **no** |
| Consent cookie `granted` | yes |
| No cookie at all, anonymous, production | **yes** — this is the change |
| Anywhere but production | yes (unchanged) |

This is a real change to a privacy default and it goes in the checklist for Soroush, because whether
it needs a banner before EU traffic is a legal question and EPIC-017 owns it. It is also why criterion
9 asks the report to say the 300 will be an undercount: DNT users are invisible by design.

## Identity, without identity

PostHog needs a `distinctId` and these people have no account. Reuse **`hashIdentity(clientAddress)`**
— already computed on both paths, HMAC with a per-deployment salt, never reversible, never stored raw
(EPIC-014 §5). Nothing new is collected to make this measurement.

Its limits, stated in the report rather than discovered at GATE 1: an office behind one NAT counts
once, and somebody on a train counts several times. "300 unique" means 300 distinct address hashes,
not 300 humans.

## The events

Four, of which one does not exist yet:

| event | where | in the closed set? |
|---|---|---|
| `decompile_view` | `/decompile` page render, server side | yes |
| `decompile_run` | `runDecompile`, after a successful parse | yes |
| `decompile_share` | `shareDecompile`, after the row is written | yes |
| `waitlist_joined` | `joinWaitlist`, after the row is written | **no — added** |

Decision 5 asks for the waitlist "plus" the three declared names, so the fourth is sanctioned; adding
it means editing `EVENT_NAMES`, which is exactly how EPIC-004 says the closed set grows. `events.test.ts`
asserts the list verbatim and moves with it.

**Server-side only.** No `posthog-js`, no client bundle, nothing on the critical path — EPIC-016
decision 10, and it also means no analytics cookie to consent to.

**Exactly once per action** is the criterion. `decompile_run` fires on the `status: "ok"` path only —
not on empty, too-long or rate-limited — so a person mashing the button on an empty box does not
inflate the denominator. `decompile_view` is one per page render, which includes the render that
follows an ask-bar handoff.

## `llms.txt`

A route handler, not a static file, for the same reason `robots.ts` is one: the origin has to be the
deployed one. Generated from the same constants the product uses, so it cannot end up listing five
finding kinds or a stale URL.

Short, plain, no stuffing. What 41Prompts is, what the decompiler does, the six kinds in plain
language, no account needed. **No `llms-full.txt`** — there is one page of content; a "full" variant
would be the same text twice, which is exactly the stuffing the epic warns against. Recorded as a
deviation with the reason.

## The article

`/guides/what-your-prompt-does-not-check`. The six findings, each with a **real example from the
committed corpus** (criterion 2: *"Every example in it comes from the committed corpus"*).

`support-email-router` is the running example: a realistic 200-word support prompt already in
`SEGMENT_FIXTURES` that produces four of the six kinds on its own. `contradiction` and `too_long` come
from `DETECT_FIXTURES`.

**The examples are asserted, not transcribed.** A test runs `detect(cluster(segment(fixture)))` and
checks that every message quoted in the article is one the detectors actually produce today. An
article that drifts from the product is worse than no article, and this is the one piece of content a
model may cite.

## `docs/research/m1-window.md`

Start date, close date thirty days on, the criterion **verbatim**, an empty weekly table, and the
no-changes rule. Also the undercount note, since whoever reads this at GATE 1 needs to know the number
is a floor.

## Build order

1. **Analytics first** — the consent default, the fourth event, the four call sites, DNT. If this is
   wrong nothing else matters.
2. `llms.txt` + `robots.ts`/`sitemap.ts` updates.
3. The article, and the test that keeps it honest.
4. `m1-window.md`.
5. Tests: unit, e2e, axe on the new page.
6. Tag `v0.1.0`, deploy, verify production URLs.
7. The checklist of what needs Soroush.

## What needs Soroush (one checklist, in the report)

- Google Search Console verification + sitemap submission.
- Bing Webmaster Tools verification + sitemap submission.
- Confirm the analytics consent default above, or ask for a banner first.
- Possibly a PostHog setting: the funnel has to be created in their UI, and I can only build it if the
  project API key in the environment has the right permissions — otherwise it is a click.

## Risks

1. **The funnel reads zero because consent blocks it.** Addressed above; verified in production by
   checking a real event arrives after deploy, not by trusting the code.
2. **Production is a different environment.** `DEPLOY_ENV=production` changes analytics behaviour, so
   the staging check proves less than usual here. The report must say what was verified *in production*
   and what only in staging.
3. **Tagging is one-way.** A `v*` tag builds production images and fires Coolify's production webhook.
   Everything else lands on `main` first and is checked on staging.
4. **The window's integrity.** The report states the no-changes rule prominently enough that the next
   session cannot miss it.
