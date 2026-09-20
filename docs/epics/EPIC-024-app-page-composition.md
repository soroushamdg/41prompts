<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# EPIC-024: App page composition — the cards, the split, and the two missing tabs

Stage: 2 · late entry, 2026-09-20 · Depends on: EPIC-023 · Size: **M**

Sequence and rationale in `docs/epics/plan-mockup-parity.md`.

## Why this row

Every app page works. Several are laid out as long forms where the mockup draws dense two-pane
cards, and driving the built app makes the gap plain:

- **Projects** is a `<ul>` of links (`app/app/projects/page.tsx`). The mockup is a 1/2/3-column card
  grid, each card carrying Pass, Runs and Cost.
- **The Blok Editor** renders the compiled pane as a small box beside a canvas that runs 1,500px
  down the page — every blok an always-open textarea with four buttons stacked underneath it,
  outside the card. The mockup is one bordered `.split` card, two panes of equal height, with
  compact blok cards: a kind tag, a summary line, a meta row, and a coloured left edge.
- **Two of four tabs ship.** `workbench.tsx` says so, and says why: *"Assertions is Stage 3 and
  Providers is Stage 4, and a disabled tab that does nothing is a worse promise than an absent
  one."* Both stages are `done`. The reason expired and nothing noticed.
- **Blok kind colour has never shipped.** EPIC-003 deviation 1; reassigned to EPIC-020, which could
  not take it; then to EPIC-021a/021b, which did not.

## Goal

The app's pages are laid out as the mockup lays them out — a project card grid, a two-pane editor of
compact cards, four tabs — with blok kind colour finally shipped on a palette that does not collide
with pass, fail or drift.

## Scope

1. **Projects as a card grid.** The mockup's `.projgrid` / `.proj`: name, sub-line
   (`Draft v7 · Live v6 · 6 bloks`), and a metric row of Pass / Runs / Cost.

   **Every metric is derived or absent.** Pass rate is already derived (EPIC-040); runs count and
   `costCents` are on `results`. A project with no runs shows `—`, never a zero dressed as a
   measurement. `listProjects` gains the aggregate in one query, not N+1.

2. **The Blok Editor as the mockup's `.split`.** One bordered card, two panes, `1.05fr 1fr` above
   1000px and stacked below. Compiled pane keeps its `read-only` pill and gains the mockup's token
   and cost readout — **derived from the real compiled string and the real price table, or absent.**

3. **Compact blok cards.** Kind tag, the blok's text, a meta row, a 5px coloured left edge. Editing
   opens in place rather than every card being a live textarea. Move, pin and delete become controls
   **within** the card's chrome, not four buttons below it. One tab stop per card with arrow keys
   inside — `docs/design/README.md`'s accessibility correction, which the source map already honours
   and the canvas does not.

4. **One `+ Add blok` with a kind picker**, replacing six `Add <kind>` buttons. The six kinds are
   `context | constraint | example | expected | image_ref | image_input`.

5. **Blok kind colour, and the palette decision.** The mockup's `--kc` reuses `--pass` for
   `expected` and `--warn` for `example`, which `CLAUDE.md` rule 10 forbids. Ship a five-kind
   palette that avoids the three reserved hues, measured against WCAG AA in both themes with
   `packages/ui/src/contrast.ts` — the same instrument that settled `--color-ink-3`. Colour appears
   **only during interaction**, never persistently (`docs/design/README.md`), and never alone:
   the kind tag's text is the accessible answer.

6. **The Checks tab.** The mockup labels it `Assertions`; ADR-003 forbids that word in UI strings
   and `docs/design/README.md` already says build "checks". Lists the prompt's checks, each with its
   owning blok and its plain-phrase kind — the eight names `CLAUDE.md` fixes.

7. **The Providers tab.** Which models this prompt runs against, from EPIC-042's seven pinned
   models, with a link to Settings → Providers for keys.

8. **The drift banner, in ADR-003's words.** The mockup writes
   *"Blok 4 edited by hand · compiler released this block · Reconcile"*. Build
   *"Blok 4 edited by hand · the compiler released this span · **Update from blok**"*.

## Out of scope

- **The rail and the top bar.** EPIC-023.
- **The Runs results page.** It is already the closest page to the mockup — KPIs, both pivots, the
  heatmap, the failure detail, "Create constraint from this failure". Do not touch it.
- **Deploy's "Apps calling this prompt"** and **Connect's "apps resolving"**. No CDN.
- **Connect's Python and Swift tabs.** Stage 5b shipped a Python SDK; a second language tab on the
  Connect page is its own small row, not this one.
- **Team and Billing settings tabs.**
- **Any change to what gets compiled, stored or published.** This epic is layout and labels.
  `docs/design/README.md`: where a prototype implies something about the bytes, decide it on its own
  terms — and here, do not decide it at all.

## Acceptance criteria

- [ ] Projects renders as a grid at 1, 2 and 3 columns across the mockup's breakpoints, and a
      project with no runs shows `—` for all three metrics. Evidence: test names plus screenshots.
- [ ] The project metrics come from **one** query, asserted. Evidence: test name.
- [ ] The editor renders as one `.split` card with two panes of equal height at 1440px. Evidence:
      screenshot.
- [ ] A blok card is **one** tab stop, with arrow keys moving within it. Evidence: test name.
- [ ] Reorder, pin, edit and delete all still work by keyboard and by touch after the rework.
      Evidence: the existing `canvas.spec.ts` passing unchanged where it can, and named amendments
      where it cannot.
- [ ] The kind palette passes WCAG AA in both themes, **measured**, with the numbers in the report.
      No kind colour equals `--color-pass`, `--color-fail` or `--color-drift`. Evidence: a
      `contrast.test.ts` case per kind per theme, and a test asserting the three-way inequality.
- [ ] Kind is never conveyed by colour alone. Evidence: test name.
- [ ] The Checks tab lists every check with its owning blok, named by the eight plain phrases.
      Evidence: test name.
- [ ] The Providers tab lists the pinned models. Evidence: test name.
- [ ] The drift banner says "edited by hand" and "Update from blok". Evidence:
      `pnpm forbidden-words` output and a test asserting the two strings.
- [ ] No `/app` route scrolls sideways at 390px. Evidence: `overflow.ts` over every app route.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm compliance`, `pnpm dead-code` green per
      package; `node scripts/gates.mjs ci` green before merge.
- [ ] The built app driven in a browser, screenshots in the report.
- [ ] Report and session log written.

## Verification

As EPIC-023's block, with `scripts/drive-epic-024.mts`. The drive must **build a prompt from an
empty canvas** — add one blok of each kind, reorder two, edit one by hand, and read the result in
the compiled pane — rather than reading a seeded one.

## Notes for the implementer

- The mockup's CSS: `.projgrid`/`.proj` at lines 175–185, `.split`/`.pane`/`.panebar` at 187–196,
  `.compiled`/`.sp` at 198–206, `.canvas`/`.blok`/`.add` at 208–216, `.tabs` at 170–173.
- **`--kc` is the trap.** Read `[data-k=…]` at mockup lines 24–31 before designing: `expected` is
  `#0B5C2E`, which is `--pass` exactly, and `example` is `#8A5A00`, which is `--warn` exactly.
  Copying them ships a rule violation that no test currently catches. Write the test that catches
  it in the same commit as the palette.
- The five kinds needing colour are `context`, `constraint`, `example`, `expected` and the two image
  kinds. The mockup also draws `role`, `format`, `conditional`, `tone` and `instruction` — those are
  the **decompiler's** classifier labels, not blok kinds, and they belong to `/decompile`'s own
  palette. Do not conflate the two sets.
- A blok stores the verbatim span (`CLAUDE.md` rule 3). Changing a card's chrome must not change a
  single byte of what it holds; the compiled output before and after this epic is byte-identical,
  and the report should say so with a hash.
- `workbench.tsx`'s comment names the label trap for the third tab. Meet it before writing the
  label rather than after.
