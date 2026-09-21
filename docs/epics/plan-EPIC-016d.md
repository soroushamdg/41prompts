<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# Plan — EPIC-016d: the landing page, everything that needs nothing else

Read against the code, not from memory: `apps/web/app/page.tsx`, `home-sections.tsx`,
`site-chrome.tsx`, `ask-chip.tsx`, `example-surface.tsx`, `lib/site/links.ts`, `claims.ts`,
`not-true-yet.ts`, `page.test.tsx`, `site-claims.test.tsx`, `packages/ui/src/landing.css`,
`recipes.css`, `tokens.css`, `contrast.ts`, `primitives/blok-card.tsx`, `e2e/landing.spec.ts`,
`e2e/site-pages.spec.ts`, `e2e/reserved-colour.ts`, and the mockup's home screen (lines 418–625 of
`docs/design/41prompts-full-mockup.html`).

## What is already true, so it is not rebuilt

- The product shot, run demo, failure attribution, provider comparison, five-tab rotator and proof
  band are all built and merged (EPIC-016b, 016c).
- `.pill` and `.pill-dot` already exist in `recipes.css`, unused on this page.
- `.btn`, `.btn-sm`, `.btn-pri` already exist and already match the mockup's `.btn.sm.pri`.
- `ask-chip.tsx` already owns the dialog, the editable textarea and the four destinations.
- `--color-kind-*` already exists in both themes and is already resolved onto `--blok-kind` per kind.
- `Example` + `withoutExamples` already carry the "figures inside a picture are sample data" rule.

## The order of work, and why this order

Each step ends green on `pnpm test && pnpm typecheck && pnpm lint` before the next begins. The two
that can move the visual baselines (hero, kind colour) come **before** the baseline regeneration,
which is last.

### Step 1 — blok kind colour, persistent (scope 4)

First, because it is the only step that reaches outside `apps/web` and the only one whose gate is a
measurement rather than a string.

1. `packages/ui/src/contrast.ts` — the six kind pairs move from `minRatio: 3.0` against `surface`
   only, to `minRatio: 4.5` against `surface`, `bg` **and** `sunken` (18 pairs). The comment above
   them changes from "never text" to what it now is, with the measured worst case.
2. `packages/ui/src/recipes.css`:
   - `.blok-card[data-kind]` gets `position: relative` and a `::before` rail — 5px, inset from the
     card's own border the way the mockup's `.blok::before` is — painted `var(--blok-kind)`.
   - `.blok-card[data-kind] .tag` takes `border-color` and `color` from `var(--blok-kind)`.
   - The interaction rule on `.blok-card-rail` stays: the glyph still brightens on hover.
   - The comment block above it is rewritten; it currently argues for interaction-only.
3. `packages/ui/src/primitives/blok-card.test.tsx` — the `describe` block is rewritten:
   - "has a rule for each of the six kinds" — unchanged.
   - "paints with the category colour only under :hover…" — **replaced** by "paints the rail and the
     kind tag at rest, and only on a card that declares a kind", asserted on the stylesheet the same
     way.
   - "a card at rest carries no category colour in its own markup" — **replaced** by "a card with no
     kind carries no `data-kind`, so nothing can key on it", which is the property that keeps
     `/dev/ui`'s baselines still.
   - "never reaches for a reserved token" — **unchanged**. This is the rule 10 guard and it is the
     reason the answer was EPIC-021a's palette.
4. `docs/design/README.md`'s "Blok category colour" paragraph — updated, with the date, who decided,
   and the measurement. `Do not copy --kc` stays; it is still true and is now the *reason* the
   palette that became persistent is ours.

**Risk:** `/dev/ui`'s gallery renders `BlokCard` without a `kind`, so its two Linux baselines must
not move. Checked by reading `gallery-client.tsx` (no `kind` prop) and guarded by the rewritten test.

**Risk:** the `/app` canvas and `/decompile` render kinded cards, so their appearance changes. That
is the point of the answer, and `canvas.spec.ts` / `decompile.spec.ts` carry no colour assertion at
rest — but they do carry the reserved-colour probe, which the palette cannot trip.

### Step 2 — the nav (scope 1)

1. `lib/site/links.ts`:
   - `NAV_SECTION_LINKS` becomes `[Product → /, Features, Delivery, Docs, Decompiler]`.
   - `NAV_ALWAYS_LINKS` is deleted; `NAV_LINKS` becomes `NAV_SECTION_LINKS`.
   - The doc comment records why `Decompiler` moved and why `Pricing`/`Learn` are still absent.
2. `app/site-chrome.tsx`:
   - the always-block goes; `Sign in` becomes `.btn .btn-sm`, `Go to dashboard` the same.
   - `Start free` — `.btn .btn-sm .btn-pri`, `${appOrigin()}/sign-up`, rendered only when signed out.
3. `packages/ui/src/landing.css` — `.site-nav .btn` already exists for `min-height`; it needs the
   nav's controls to stay one row at 375px. Measured in the browser during the drive, not guessed.
4. `app/site-chrome.test.tsx` — `Product` first with `aria-current` on home; `Start free` present
   signed out and absent signed in; `Sign in`/`Go to dashboard` still exactly one of two.
5. `e2e/site-pages.spec.ts` — the nav walk scopes to `a.site-nav-link`, because `Product` and the
   logo share `href="/"`.
6. `e2e/landing.spec.ts` — the 375px target list gains `Start free` and keeps `Decompiler` **out**
   (it collapses below 900px now); the one-row assertion is unchanged and is the one that matters.

### Step 3 — the hero (scope 2)

`app/page.tsx` and a new `app/ask-bar.tsx`.

Order in the markup, which is the mockup's with the paste box inserted where the mockup puts its
primary CTA:

```
eyebrow → h1 → lede → paste box (+ No credit card pill in its foot) → See the workbench
       → Ask-AI bar → four suggestion chips
```

`ask-bar.tsx` is a client component and exports `AskBar`. It reuses `ask-chip.tsx`'s dialog by
lifting `AskDialog` out of `AskChip` — one dialog implementation, two triggers — rather than
copying it. The placeholder rotation lives in a `useEffect` with a 3400ms interval that:

- does not start under `prefers-reduced-motion: reduce`;
- skips a tick while the input is focused or has a value (the mockup's own rule);
- is cleared on unmount.

`landing.css` gains `.hero-eyebrow` spacing, `.askbar-pill`, `.hero-secondary`, `.askbar2`
(the Ask-AI bar; `.askbar` is taken by the paste box) and `.asksugg`.

**Risk — the fold.** The eyebrow adds roughly 30px above the ask bar at 375px, and the new headline
is shorter than the one it replaces (33 characters against 66), so the net is expected to be
negative. `landing.spec.ts`'s two above-the-fold assertions are the gate and are not relaxed.

**Risk — `.btn-pri` above the fold.** `Start free` is a second promoted action, which reverses
EPIC-016 decision 2. The assertion is updated to the decided set with the reversal in its comment.

### Step 4 — the shot's pane bar, the strip, the band, the footer (scope 3, 5, 6, 7)

All copy and markup, all inside files already open.

- `home-sections.tsx` — `.shot-panebar` replacing the two `.shot-panetitle` paragraphs; the pill, the
  token count, the derived blok count, the `Run N checks` span.
- `page.tsx` — the strip's three titles and paragraphs; the closing band's heading and lede.
- `site-chrome.tsx` — the footer blurb.
- `page.test.tsx` — the hero pin moves, the chip count goes 3 → 7, the pane-bar strings are asserted,
  the strip and band strings are asserted.

### Step 5 — the drive, then the baselines

`scripts/drive-epic-016d.mts`, watched, against the built app: the IDE preview pane, a visible
browser, `DRIVE_HEADLESS=1` honoured, no `page.pause()`. It signs in as nobody — this is the
signed-out home page — but it **does** check the signed-in nav by minting a magic-link token from
the local database the way `apps/web/e2e/publish-db` does, because `Start free` disappearing is an
acceptance criterion and only a session can show it.

Baselines last, in `mcr.microsoft.com/playwright:v1.63.0-noble`, after everything else is green.

## What I expect to go wrong

1. **The 375px nav.** Five controls where there were four. If it wraps, the answer is the mockup's —
   tighten the gap below 560px — not dropping a control.
2. **`page.test.tsx`'s numbers rule.** `1,284` is inside the `<Example>` and is therefore invisible
   to it. If the shot's markup is restructured so the pane bar lands outside the figure, every digit
   in it becomes an unexplained number. The figure wraps the whole shot today and must keep doing so.
3. **`NOT_TRUE_YET` over the Ask-AI bar's five rotating placeholders and four chip questions.** Each
   is scanned as rendered text. None may say `lessons`, `trusted by`, `per seat` or a count.
4. **`/\bLearn\b/i`** — `page.test.tsx` asserts the page never says it. Easy to reintroduce in a
   placeholder question.
5. **axe on the Ask-AI bar.** An input with a visible `ASK AI` prefix needs a real label; the prefix
   is decorative and the label is `sr-only`, as the paste box already does.

## Definition of done for this plan

Every acceptance criterion in `docs/epics/EPIC-016d-landing-parity.md` ticked with evidence;
`node scripts/gates.mjs ci` green on the commit with its closing block reported; the drive
screenshotted into `docs/epics/reports/screenshots/EPIC-016d/`; report and session log written;
`git merge --no-ff` into local `main`. Nothing pushed.
