<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# EPIC-016d: The landing page, everything that needs nothing else

Stage: 1 · follow-on to EPIC-016c, 2026-09-21 · Depends on: EPIC-016b, EPIC-016c · Size: **M**

Sequence and the full count in `docs/epics/plan-landing-parity.md`. Soroush, 2026-09-20:
**the landing page and the platform are both to match the mockup, in design and in functionality.**

## Why this row

`plan-landing-parity.md` counted **twenty-three** remaining differences between
`docs/design/41prompts-full-mockup.html`'s home page and the built one, by rendering both at 1440px
and comparing element by element. Four of them needed a word from Soroush because each publishes
something about the company or reverses a decision he made himself.

**He answered all four on 2026-09-21**, and the answers collapse EPIC-016e into this epic:

| # | question | answer |
|---|---|---|
| B7 | the trust row — NORTHWIND, OAKLINE, MERIDIAN AI, CASTELL, BLUEPRINT | **Leave it out.** No change; the row was never built. |
| D1 | the three proof counters | **Keep the three true sentences.** No change; `HomeProof` stands. |
| B2 | the hero headline | **Restore the mockup's** — *"Stop guessing which prompt works."* |
| C2 | persistent blok kind colour | **EPIC-021a's palette, made persistent.** Not the mockup's literal hexes. |

Two of the four are "build nothing", which is why there is no EPIC-016e. The other two are in scope
below.

## Goal

The home page is the mockup's home page everywhere the mockup does not depend on a page that does
not exist yet — nav, hero, the product shot's pane bar, persistent blok kind colour, the three-step
strip, the closing band and the footer blurb — and the four differences Soroush decided are settled
his way.

## Scope

### 1. Nav (A1, A4, A5, A6)

- `Product` becomes the first section link, pointing at `/`. Its `SiteNavCurrent` is `home`, because
  that is the page it marks.
- Order: **Product · Features · Delivery · Docs · Decompiler**. The mockup's order with `Pricing`
  and `Learn` absent for EPIC-016's original reason — *a nav link to a 404 is worse than no nav* —
  and `Decompiler` last, which is where the built nav already puts it.
- **`Decompiler` moves from `NAV_ALWAYS_LINKS` into `NAV_SECTION_LINKS`**, so it collapses below
  900px with the rest of the group. Below 900px the nav then carries exactly what the mockup's
  carries: the logo, Theme, Sign in, Start free. `NAV_ALWAYS_LINKS` is deleted rather than left
  empty (`pnpm dead-code`).
- `Sign in` becomes a bordered `.btn .btn-sm`, as the mockup draws it. `Go to dashboard` takes the
  same treatment when a session exists.
- **`Start free`** — `.btn .btn-sm .btn-pri`, to the app host's `/sign-up`. **Signed-out only**: a
  reader who already has an account is offered `Go to dashboard` instead, and two primary buttons
  competing for one person is not what the mockup draws either.

### 2. Hero (B1, B2, B3, B4, B5, B6)

- **Eyebrow** — *"The workbench for the prompt layer"*, the mockup's, verbatim.
- **Headline** — *"Stop guessing which prompt works."* Soroush, 2026-09-21, reversing his own
  decision of 2026-09-11. `page.test.tsx`'s pin moves with it and records who moved it.
- **Lede** — the mockup's, verbatim.
- **The paste box stays exactly where it is**, first action, above the fold at 375×812. It is the
  product's real first action and the mockup's `Paste a prompt, free` button is a link to the same
  place with less of it done.
- **`No credit card` pill** in the ask bar's foot row, beside the note. **The dot is ink, not
  `--pass`** — the mockup paints it green, and rule 10 says green means pass.
- **`See the workbench`** — a secondary link under the ask bar. **To `/features`, not to the app.**
  The mockup sends it to the signed-in editor, which for this page's audience is a sign-in wall; the
  page that answers the button's promise without an account is `/features`, and `Start free` is the
  control that asks for an account.
- **The Ask-AI bar** — `ASK AI` prefix, an input, `Ask →`, with the mockup's rotating placeholder
  (five questions, 3400ms). It opens the same dialog the existing chips open, pre-filled with what
  was typed. Nothing of ours is called, exactly as `ask-chip.tsx` already guarantees.
- **The four suggestion chips** under the bar, the mockup's four questions.

### 3. The product shot's pane bar (C1, F1)

Inside the existing `<Example>`:

- Compiled pane: a `read-only` pill and `1,284 tok`, the mockup's literal, as sample data.
- Canvas pane: the blok count, **derived from the array that renders the cards**, and a
  `Run 5 checks` control, the count derived from `RUN_ROWS`.
- **`Run 6 assertions` becomes `Run N checks`.** ADR-003 forbids the other word and
  `pnpm forbidden-words` fails the build on it.
- **The run control is a `<span>`, not a `<button>`.** It is a picture of a control; a button nobody
  can press is a promise to a keyboard reader this page cannot keep — the rule `capability-rotator`'s
  `BlokCard as="div"` already follows.

### 4. Blok kind colour, persistent (C2)

Soroush's answer: **EPIC-021a's six-hue palette, made persistent.** Not the mockup's `--kc`, whose
`expected` is `--color-pass` exactly and whose `example` is `--color-warn` exactly.

- `.blok-card[data-kind]` grows the mockup's 5px leading rail at rest, painted `var(--blok-kind)`.
- The kind's `.tag` inside a kinded card takes the kind's colour for its border and its text.
- **Measured before shipped**: every one of the twelve values clears 4.5:1 against `surface`, `bg`
  and `sunken` in both themes (worst 5.97:1). `CONTRAST_PAIRS` is raised from the 3:1 UI tier to the
  4.5:1 text tier and extended to all three grounds, because the colour now carries text.
- A card with **no** `kind` is byte-identical to today, so `/dev/ui`'s committed baselines do not
  move.
- Colour is still never the only signal: the glyph and the kind's name as text are unchanged.
- `blok-card.test.tsx`'s rest guard is **rewritten, not deleted** — it asserted the old contract and
  must assert the new one, with the reserved-token guard kept exactly as it is.
- `docs/design/README.md`'s "Blok category colour" paragraph is updated in the same commit.

### 5. The three-step strip (D2)

Renamed to the mockup's **Decompile · Assert · Ship**, with the mockup's three paragraphs.

### 6. The closing band (D4, heading only)

Heading and lede to the mockup's. The second button, `See pricing`, needs `/pricing` and is
**out of scope** — EPIC-070.

### 7. The footer blurb (E cosmetics)

*"The workbench for the prompt layer. Made in Montréal."* The `©` line keeps `41Prompts Inc.`,
which is more correct than the mockup's now that the entity exists.

### 8. The two Linux visual baselines

`landing-light-linux.png` and `landing-dark-linux.png` regenerated in
`mcr.microsoft.com/playwright:v1.63.0-noble`. They **will** move.

## Out of scope

- **The trust row** (B7) and **the three counters** (D1). Soroush decided both on 2026-09-21: leave
  them out, keep the three registry sentences. Nothing is built for either.
- `Pricing` in the nav, the footer and the closing band's second button — **EPIC-070**.
- `Learn` in the nav, the lessons teaser and `Lessons` in the footer — **Stage 7**.
- `Blog` in the footer — **EPIC-073**. `About` and `Careers` — **EPIC-072b**.
- The run demo's *"Six checks"* heading, which already stands over five rows. Pre-existing, the
  mockup's own copy, and not this epic's to re-decide. Named in the report.
- Every `/app` route. Persistent kind colour reaches them through `packages/ui`, which is the point,
  but no page composition changes.

## Acceptance criteria

- [ ] **A1** The nav's first section link is `Product`, points at `/`, and carries
      `aria-current="page"` on the home page. `site-chrome.test.tsx`.
- [ ] **A2** Nav order is Product · Features · Delivery · Docs · Decompiler, and every one of them
      answers 200. `site-pages.spec.ts`.
- [ ] **A3** At 375px the nav is one row, has no horizontal scroll, and every control clears 44px —
      logo, Theme, Sign in, Start free. `landing.spec.ts`.
- [ ] **A4** `Sign in` is a bordered button; `Start free` is the primary and renders **only** when
      signed out; `Go to dashboard` replaces both when signed in. `site-chrome.test.tsx`, both
      states.
- [ ] **B1** The hero carries the mockup's eyebrow, headline and lede verbatim. `page.test.tsx`.
- [ ] **B2** The ask bar and its submit are still fully visible without scrolling at 1280×800 and at
      375×812. `landing.spec.ts`, unchanged assertions.
- [ ] **B3** The hero carries the `No credit card` pill and the `See the workbench` link, and the
      pill's dot paints no reserved hue. `page.test.tsx` + the reserved-colour guard.
- [ ] **B4** The Ask-AI bar submits the typed question into the existing dialog, from the keyboard
      alone, and its placeholder rotates — and stops rotating once it is focused or has a value.
      `ask-bar.test.tsx` for the handoff, `landing.spec.ts` for the rotation.
- [ ] **B5** Four suggestion chips under the bar; seven `.ask-chip` triggers on the page in total.
      `page.test.tsx`.
- [ ] **C1** The compiled pane shows a `read-only` pill and a token count; the canvas pane shows the
      blok count and `Run 5 checks`; both counts are derived from the arrays that render the cards
      and the rows, and the run control is not a `<button>`. `page.test.tsx`.
- [ ] **C2** `pnpm forbidden-words` passes, and the rendered page contains no `assertion`.
- [ ] **D1** A blok card with a kind paints its rail and its tag at rest; one without a kind is
      byte-identical to before. `blok-card.test.tsx`.
- [ ] **D2** Every kind colour clears 4.5:1 against `surface`, `bg` and `sunken` in both themes, and
      `contrast.test.ts` fails if one stops doing so.
- [ ] **D3** No kind rule reaches for `--color-pass`, `--color-fail` or `--color-warn`.
      `blok-card.test.tsx`, unchanged.
- [ ] **E1** The strip reads Decompile · Assert · Ship; the closing band and the footer blurb are
      the mockup's. `page.test.tsx`.
- [ ] **E2** `/` has no axe violation in either theme, at both viewports. `landing.spec.ts`.
- [ ] **E3** No reserved hue outside a marked example, and the guard's positive control still fires.
      `landing.spec.ts` + `reserved-colour.spec.ts`.
- [ ] **E4** The two Linux baselines are regenerated and the visual suite is green on Linux.
- [ ] **F1** `node scripts/gates.mjs ci` green on the commit, with its closing block read and
      reported.
- [ ] **F2** The page driven by hand in a browser against the **built** app, screenshots in
      `docs/epics/reports/screenshots/EPIC-016d/`.

## Verification

```
pnpm test && pnpm typecheck && pnpm lint
pnpm forbidden-words
node scripts/gates.mjs ci
# the drive, watched:
npx turbo run build --filter=@41prompts/web
pnpm --filter @41prompts/web start --port 3131 &
npx tsx scripts/drive-epic-016d.mts
```

Linux baselines:

```
docker run --rm -v "$PWD":/w -w /w mcr.microsoft.com/playwright:v1.63.0-noble \
  bash -lc 'corepack enable && pnpm install --frozen-lockfile && pnpm e2e --update-snapshots landing.spec.ts'
```

## Notes for the implementer

- **`landing.spec.ts`'s "is the only call to action above the fold" changes, and that is a
  reversal.** EPIC-016 decision 2 said the ask bar is the only promoted action above the fold;
  `Start free` in the nav is a second one. Soroush's parity instruction of 2026-09-20 is newer.
  Update the assertion to the decided set and say so in the comment — do not delete the test.
- **The `site-pages.spec.ts` nav walk must scope to `a.site-nav-link`.** `Product` points at `/` and
  so does the logo, so an unscoped `[href="/"]` count is 2.
- `page.test.tsx`'s `EXPLAINED_NUMBERS` covers the page **with marked examples removed**. Everything
  new in the shot is inside the `<Example>`; everything new in the hero has no digits. If that stops
  being true, the number is listed with a reason or it does not ship.
- `NOT_TRUE_YET` runs over the **full** text, examples included. None of the new copy may say
  `lessons`, `trusted by`, `per seat` or a customer count.
- `page.test.tsx` asserts `text` does **not** match `/\bLearn\b/i`. No new copy may say it.
- The Ask-AI bar is a new client component. `ask-chip.tsx` already owns the dialog and the four
  destinations — extend it, do not write a second copy.
