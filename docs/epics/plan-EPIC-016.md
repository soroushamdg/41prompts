# Plan — EPIC-016: Landing page v1

## What this page has to do

One reader: an AI engineer who owns a production prompt. One job: get them from the headline into
`/decompile` with their own prompt in under thirty seconds, without asking them for anything.

Everything below is subordinate to that. The page has no second goal.

## The decided position, and what it costs the mockup

`docs/design/41prompts-full-mockup.html` is the spec for the home page, and **the epic overrides it in
five places**. Recording them here so the report does not have to re-derive them:

| The mockup has | The epic says | Result |
|---|---|---|
| Tool-led hero: *"Stop guessing which prompt works."* | Lead with the failure | New headline, five drafted |
| An **Ask AI** bar (chat handoff) | The ask bar is *"a textarea that submits straight to `/decompile`"* | Same slot, different thing entirely |
| `.trust` row: NORTHWIND, OAKLINE, MERIDIAN AI… | Decision 4: no logos | Cut |
| `.proof` counters: 1,240,000 decompiled, 38%, 4s | Decision 4: no invented counts | Cut |
| Nav: Product · Features · Delivery · Pricing · Learn · Docs, plus **Start free** | Decision 2: sign in small, sign up not promoted; those pages are EPIC-072 | Nav is logo · Decompiler · Sign in · theme |
| Rotator, model-comparison tables, lessons grid, "Run 6 assertions" | None of it exists | Cut |

What survives from the mockup: the token set, `.hero`/`.lede`/`.eyebrow` shapes, the `01/02/03`
`.strip` (its structure, not its copy), the closing centred CTA, and the footer grid.

## The headline

Five drafted, one shipped, four listed with reasons in the report for Soroush to approve or replace.

**Shipping:** *A prompt change ships. Nothing checks it. You find out from a user.*

Three beats: the event, the gap, the consequence. It is a sequence of facts about how prompts ship —
no threat, no claim about the reader's team being careless — and the middle beat is literally the
product: the thing we find is a rule that nothing checks.

Rejected, with reasons, in the report.

**Subhead** (names bloks and checks, promises nothing Stage 1 cannot do):
*Paste one here. It comes back as named bloks, with every rule that nothing checks called out. No
account, and nothing is stored.*

## The hard part: getting the text to `/decompile`

The criterion is *"submitting it lands on `/decompile` with the text intact, including CRLF, tabs,
emoji and RTL"*. This is EPIC-016's equivalent of EPIC-013's offset mapping — the place it will
actually go wrong — so it gets decided before anything is styled.

`MAX_INPUT_BYTES` is **100 KB**. That rules out most of the obvious transports:

| Transport | Why not |
|---|---|
| `GET /decompile?prompt=…` | **Privacy.** The prompt lands in browser history, the `Referer` of any outbound click, proxy access logs, and — once EPIC-015 wires PostHog — in analytics. A page that says "nothing is stored" must not put the prompt in a URL. Also breaks past ~8 KB. |
| Cookie | 4 KB, and it rides on every subsequent request. |
| `POST` to the page | App Router pages cannot read a request body; a `route.ts` cannot share a path with a `page.tsx`. |
| `sessionStorage` + client nav | Needs JS on the critical path and loses the paste without it. |
| A row in `decompiles` | That is storage, and the page's copy says there is none. |

**Chosen: a single-use in-process handoff.** A Server Action on `/` takes the text, puts it in a
bounded in-memory map under a random opaque id with a 60-second TTL, and redirects to
`/decompile?start=<id>`. `/decompile` pops the id (deleting it) and renders the result server-side on
first paint. The id is opaque; the prompt is never in a URL, a cookie, a log or a database.

Known limit, stated in the report rather than hidden: this is per process, so a second web container
would miss. Same seam as EPIC-014's in-memory rate limiter and the same fix. A miss is not an error
page — `/decompile` renders its normal empty state with one calm line.

**Four fixtures** (the criterion's evidence), each asserting the text arrives byte-identical after the
browser's own CRLF normalisation: CRLF line endings, tabs, emoji (astral plane), RTL (Arabic with
bidi marks).

## Build order

1. **Handoff + `/decompile` entry** — the risky part first, with its four fixtures, before any CSS.
2. **Logo** (`packages/ui`) — `LogoMark`, the point arrays copied verbatim from the prototype.
3. **Landing page** — nav, hero + ask bar, strip, CTA, footer, and `landing.css` in `packages/ui`.
4. **Sign in / sign up** — style the existing `SignInForm`; no flow changes.
5. **Legal stubs** — one route, four paths.
6. **Metadata** — title, description, canonical, OG image, `robots.ts`, `sitemap.ts`.
7. **Tests** — unit, e2e, axe, keyboard, 44px, snapshots.
8. **Staging** — deploy, screenshots at 1280×800 and 375×812, Lighthouse.

## Pieces

### `packages/ui`
- `primitives/logo-mark.tsx` — the 41 → AI morph. Point arrays and the lerp copied verbatim from
  `docs/design/41prompts-logo-v2.html`; **take the prototype's shapes, not its event model**. The
  epic says once on load, not on a loop. With JS off it renders a static 41, which is the prototype's
  own stated degradation.
  - **Ambiguity to flag, not to silently resolve:** "runs once on load" plus "reduced motion shows the
    end state". The morph's end state is `AI`, and a logo that settles on "AIprompts" is not the
    brand. Reading it as a round trip — 41 → AI → 41, once — makes both sentences true and keeps the
    mark correct at rest. Implemented that way; listed as an open question.
- `landing.css` — `.nav`, `.hero`, `.askbar`, `.strip`, `.cta-band`, `.foot`, `.auth`. Tokens only;
  `token-contract.test.ts` fails a literal hex or px.

### `apps/web`
- `app/page.tsx` — server component, no `"use client"` anywhere on the critical path.
- `app/start-actions.ts` — `startDecompile`.
- `lib/landing/handoff.ts` — the store. Pure, testable, bounded.
- `app/legal/[slug]/page.tsx` — four stubs from one table.
- `app/robots.ts`, `app/sitemap.ts`, `app/opengraph-image.tsx`.
- `app/decompile/page.tsx` — accepts `?start=`.

## Truth audit (decision 4 / criterion 10)

Every claim on the page gets checked against what is deployed today, and the report carries the list.
The three that need care:

- *"No account, and nothing is stored"* — true on `/decompile` until the reader asks for a link.
  The page must not say it in a way that also covers sharing.
- *"free"* — true; there is no billing.
- The three-step strip's step 3 ("fix it before it ships") describes something the product **cannot do
  yet**. Rewritten to describe what the reader does with what they are shown, not what we do for them.

No testimonial, no logo, no counter, no "trusted by", no "limited beta", no countdown.

## Risks

1. **The handoff missing on a second container.** Bounded: calm empty state, not an error.
2. **Lighthouse performance ≥90 on staging.** The page is server-rendered with one small inline
   script for the logo; fonts are already self-hosted by `next/font` with `display: swap`. The OG
   image is `opengraph-image.tsx` (generated at build, never on the critical path).
3. **Snapshots must be generated on Linux**, per EPIC-003's Docker procedure, or CI will never match.
4. **`/sign-in` and `/sign-up` against staging with Google and GitHub** needs OAuth apps configured
   for the staging hostname. If they are not, that is a human step — record it, do not fake the
   evidence.
