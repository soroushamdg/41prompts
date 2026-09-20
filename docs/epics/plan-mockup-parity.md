<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# Mockup parity: the programme

**Written by Claude Code in the advisor's chair, 2026-09-20**, after a full read of
`docs/design/41prompts-full-mockup.html` (24 screens) against the built app driven in a browser
(`next build` + `next start`, every route, signed in, example project seeded).

Soroush's decision, 2026-09-20: **the landing page and the platform are both to match the mockup,
in design and in functionality.** This file is the sequence. Each row below is an epic file beside
it; run them one at a time, `PROCESS.md`'s loop, one branch each.

## What the survey found

The product is **not behind on the mockup's features** — it is ahead of it in places (`/features`
lists 21 shipped capabilities against the mockup's 12; the Runs results page has pivots, a
keyboard-navigable heatmap and typed inputs the mockup never drew). What is missing is **chrome and
composition**, in three clusters:

1. **The app shell does not exist.** The mockup's 216px left rail and sticky top bar were never in
   any epic's Scope — the word "rail" appears nowhere in `roadmap.md`, `backlog.md` or any of the 44
   epic files. `apps/web/app/app/layout.tsx` says *"it is where the rail goes when Stage 3 builds
   it"*; Stage 3's epics never listed it and are all `done`. A dropped handoff, not a refusal.
2. **The home page is five sections against the mockup's twelve.** EPIC-016 scoped it as exactly
   *"Nav, hero, three-step strip, CTA and footer"* and put social proof out of scope; EPIC-072 then
   refused to touch it — *"Changing the home page beyond its nav and footer. EPIC-016 owns it."* So
   **no epic has ever owned building the mockup's home page.** A planning gap, written down twice.
3. **Five marketing pages are refused with reasons** (EPIC-072 §Out of scope). Four of those reasons
   are now answered by Soroush, 2026-09-20, and are scheduled below. `/learn` stays refused: it
   needs the Stage 7 lesson engine, which is six epics of its own.

A fourth, smaller cluster: **app page composition**. Every app page works; several are laid out as
long forms rather than as the mockup's dense two-pane cards. Projects is a `<ul>` where the mockup
has a card grid. The Blok Editor's four-tab strip ships two — `workbench.tsx` says *"Assertions is
Stage 3 and Providers is Stage 4"*, and both stages are `done`. Same dropped handoff as (1).

## The rulings this programme is built on (Soroush, 2026-09-20)

| Question | Ruling |
|---|---|
| Priority | **The app shell first.** |
| The home page's fabricated proof | **Build the sections with obviously-labelled example data.** |
| A second co-founder on `/about` | **Not a current co-founder. Omit the name.** |
| The three `/careers` openings | **Not real. Closed.** |
| `/pricing` | **Build it now at the mockup's prices, and build Stripe underneath it.** Soroush supplies the product ids and the API key. |

## The sequence

| # | Epic | Size | Depends on | What is true after |
|---|---|---|---|---|
| 1 | **EPIC-023** App shell | M | 021a, 055 | Every signed-in page has the rail and the top bar; you can reach Runs, Versions, Deploy and Connect without going back through a prompt page. |
| 2 | **EPIC-024** App page composition | M | 023 | Projects is a card grid; the Blok Editor is the mockup's two-pane split with compact cards; the Checks and Providers tabs exist; bloks carry their kind colour. |
| 3 | **EPIC-016b** The home page, in full | M | 072 | The home page is the mockup's home page, with every illustrative surface labelled as an example. |
| 4 | **EPIC-072b** About and Careers, honest | S | 072, 016b | Both pages exist and say only what is true. |
| 5 | **EPIC-070** Stripe and the pricing page | M | 072b | Three tiers, checkout, portal, webhooks, quotas. The per-seat price stops being a denied claim because it becomes an enforced one. |
| — | **EPIC-025** In-app Import *(proposed, not scheduled)* | M | 023 | The decompiler has a home inside the product, with the mockup's findings panel and "Create project from bloks". |

`EPIC-025` is written but deliberately **unscheduled**: it is the one mockup app screen that is a
genuine new surface rather than chrome, and it should be decided after 023 and 024 land, when the
shell it hangs off exists. `/learn` and the in-app Lessons screen stay out; Stage 7 owns them.

## Three constraints that will bite, and where each is handled

These are mechanical. They will fail the build if a later session forgets them.

### 1. A test fails on the mockup's marketing copy, by design

`apps/web/lib/site/claims.test.ts`'s `NOT_TRUE_YET` denylists eleven patterns read off the mockup —
`per seat`, `$29 / month`, `SOC 2`, `lessons`, `SSO`, `audit log`, `co-founders?`, `trusted by`, a
customer count, and two more. Each pattern is paired with a **control**: the mockup's own sentence,
asserted to still match, so nobody can quietly narrow a pattern to nothing.

It applies to the **claims registry** (`claims.ts`), not to every string on a page. A claim is *a
sentence a reader could hold us to*. Headings and link text are ordinary JSX.

- **EPIC-016b** must not register a claim about lessons, a customer count or a trust badge. It does
  not need to: its sections are illustrations, and the epic says so.
- **EPIC-072b** writes `/about` without the word `co-founder` and without `our team`. "Founder" does
  not match `/\bco-founders?\b/`; `our team` does match, so the page says "41Prompts" or "I", not
  "our team".
- **EPIC-070** is the one that *removes* a pattern. Once Stripe enforces $29/$79, the per-seat price
  is true, and the denylist row and its control row are deleted together in the same commit, with
  the reason in the commit message. That is the test working, not the test being worked around.

### 2. The mockup's vocabulary is forbidden by ADR-003

The mockup says **block, assertion, drifted, Reconcile, enum, sha, json_schema, Override with a
reason, labelled**. `pnpm forbidden-words` fails the build on those in UI strings, and
`docs/design/README.md` already holds the translation: *span, check, edited by hand, Update from
blok, one of the allowed values, version id, Publish anyway, named*.

**Design fidelity is not copy fidelity.** Take the mockup's layout, tokens, density, states and
motion. Take its copy only where ADR-003 permits it. Every epic below repeats this in its Notes
because it is the single most repeatable way to fail one of these.

Two specifics worth naming now:

- The mockup's editor tab is **"Assertions"**. Build **"Checks"** (EPIC-024).
- The mockup's drift banner says **"Reconcile"**. Build **"Update from blok"** (EPIC-024).
- The mockup's version pill says **"v7 · unsaved"** in amber. Build **"Draft v7 · Live v6"** in
  neutral ink — amber means drift and nothing else (EPIC-023).

### 3. Colour is not free, and blok kind colour is an open debt

`CLAUDE.md` rule 10 and `docs/design/README.md`: *green, red, amber mean pass, fail, drift. Nothing
else may use them.* The mockup's `--kc` blok-kind palette **reuses `--pass` and `--warn` verbatim**
(`[data-k=expected]{--kc:#0B5C2E}` is `--pass`; `[data-k=example]{--kc:#8A5A00}` is `--warn`).

EPIC-003 recorded this as deviation 1 and left blok kind colour unshipped. The debt was assigned to
EPIC-020, which could not take it (its scope excluded all UI), and then to EPIC-021a/021b, which did
not. **EPIC-024 takes it**, and it needs a new palette that carries five kinds without touching the
three reserved hues, measured against WCAG AA in both themes the way `--color-ink-3` was. That is a
design decision with a measurement, not a taste call, and it belongs in the epic's report.

## What this programme does not do

- **`/learn`, the in-app Lessons screen, and the lesson engine.** Stage 7, EPIC-060 to 064.
- **`/blog`.** Six fabricated posts in the mockup; EPIC-073 owns real content from real run data.
- **The mockup's trust-logo row** (NORTHWIND, OAKLINE, MERIDIAN AI, CASTELL, BLUEPRINT). Invented
  companies. A row of fake logos is the one thing on the home page that cannot be rescued by
  labelling it an example, because its whole function is to say *these are real*. EPIC-016b leaves
  it out and says so.
- **"Apps calling this prompt"** on Deploy, and **"apps resolving"** on Connect. Both need CDN
  access logs, which need a CDN, which needs Soroush's Cloudflare bucket. EPIC-051 and EPIC-055 both
  ruled an empty table is a claim rather than a neutral absence; that ruling stands.
- **Team and Billing settings tabs.** Team needs roles, which nothing has. Billing arrives with
  EPIC-070 and is scoped there.
