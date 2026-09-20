<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# EPIC-023 session — 2026-09-20

## The prompt

Soroush opened by comparing the built app against `docs/design/41prompts-full-mockup.html` and
asking for the differences, plus one sentence on whether each was a planning or a development
problem. That survey came first; this epic is the first row of what it produced.

## What the survey found, and the answer to his question

**Planning, almost entirely.** The epics were scoped stage by stage against what the product could
truthfully do at each moment, not against the mockup as a whole, and three areas were never written
into anyone's Scope:

1. **The app shell.** The word "rail" appears in **no** roadmap row, backlog row or epic file.
2. **The home page's eight missing sections.** EPIC-016 scoped it as *"Nav, hero, three-step strip,
   CTA and footer"*; EPIC-072 then refused to touch it — *"EPIC-016 owns it."* So no epic has ever
   owned building the mockup's home page.
3. **Five marketing pages**, refused by EPIC-072 with written reasons.

Method: read all 1,826 lines of the mockup (24 screens), built and ran the app (`next build` +
`next start`, Postgres on 55435), signed in, seeded the example project, and screenshotted all 24
mockup screens against every implemented route.

## Decisions Soroush made, 2026-09-20

| Question | Answer |
|---|---|
| Priority | App shell first |
| The home page's fabricated proof | Build the sections with obviously-labelled example data |
| A second co-founder on `/about` | Not current; omit the name |
| The three `/careers` openings | Not real; closed |
| `/pricing` | Build now at the mockup's prices, and build Stripe underneath. He supplies the product ids and API key |

## What was written

`docs/epics/plan-mockup-parity.md` (the programme) and six epic files — EPIC-023, EPIC-024,
EPIC-016b, EPIC-072b, EPIC-070, and EPIC-025 written-but-unscheduled. Then EPIC-023 implemented.

## Decisions taken while building

1. **The proxy forwards the path.** A Next.js layout gets the params of its own segment and no
   deeper, and `app/app/layout.tsx` sits at `/app`, so it never sees `[promptId]`. Four options
   were weighed in `plan-EPIC-023.md`; the proxy already parses `pathname` on every `/app/*`
   request, so forwarding it as `x-41p-path` is three lines. The rejected alternative was a second
   rail in a nested layout, nested inside the first.
2. **Four groups, not the mockup's three.** §4.1 of the report. The mockup only ever draws one
   record because it only ever draws one screen.
3. **The disclosure's copy is `compact`.** Drops the email so the address appears once in the
   document at any width.
4. **`.app-shell-main` is a block.** The flex column was a real bug; see below.

## What took longer than expected

**Sixteen e2e failures across three distinct causes**, and every one of them was worth having:

- Two were the product stranding somebody (the rail losing the prompt at Connect; no route from a
  prompt to its project). Fixed in the product, not the test.
- One was a genuine layout bug: `margin: 0 auto` inside a flex column sizes to content, so every
  page in the app shrank to its own width. Found by a test written two epics ago for something else.
- The rest were tests correctly encoding the old chrome, plus **three wrong instruments of my own**
  — a cache assertion React cannot satisfy outside a render, a row measurement using top edges on a
  centred row, and the same measurement counting `display: none` children as rows.

**Twenty minutes lost to port 3000.** Something was already serving it and Playwright's
`reuseExistingServer` is true locally, so the suite drove a different app against this database and
seven specs failed with `no verification row found`. `E2E_PORT=3210` from then on. This is exactly
the contention `PROCESS.md` already names, and I walked into it anyway.

## The lesson worth keeping

**A test that fails because the product changed is not automatically a test to update.** Of the
thirteen that failed on the first full run, two were reporting a dead end I had just built and one
was reporting a layout bug. The default reflex — re-point the locator, move on — would have shipped
all three. What separated them was asking, for each failure, *what would a person hitting this
actually experience*, before touching the assertion.

The corollary, which cost me three rounds: **when an instrument disagrees with the thing it
measures, the instrument is the more likely suspect, and proving which takes a measurement rather
than an edit.** `names.test.ts` was rewritten to state what it cannot prove rather than to assert
something convenient, and `auth.spec.ts`'s row check was only right on the fourth attempt, after I
stopped guessing and dumped the boxes.

## Open at the end of the session

`node scripts/gates.mjs ci` on this commit; the Linux visual baselines; the layout's query count.
Report §9 has all five, with what each would take.
