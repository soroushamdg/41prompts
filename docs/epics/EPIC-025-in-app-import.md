<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# EPIC-025: Import, inside the product

Stage: 2 · late entry, 2026-09-20 · Depends on: EPIC-023 · Size: **M**

**Written, deliberately not scheduled.** Sequence in `docs/epics/plan-mockup-parity.md`.

## Why it is written but not scheduled

The mockup draws nine app screens. Eight are chrome and composition over surfaces the product
already has — EPIC-023 and EPIC-024 take those. **`app:import` is the one that is a genuinely new
surface**, and it is the only one that adds a path *into* the product rather than dressing one that
exists.

It is unscheduled because it should be decided after EPIC-023 and EPIC-024 land, when the shell it
hangs off exists and the blok card it reuses has its final shape. Scheduling it now would mean
designing a page against two surfaces that are about to change underneath it.

## Why it is worth having

`/decompile` is public, account-free and complete — it is EPIC-013's page and Stage 1's whole wedge.
What it cannot do is **end anywhere**. A signed-in engineer who pastes a prompt gets findings and
then has to retype the result into a new project by hand, because nothing turns a decompile into
bloks in a workspace.

The mockup's Import screen is that ending: the same source map and findings, plus a KPI strip and a
single primary action, **"Create project from bloks"**.

## Goal

A signed-in user can paste a prompt inside the product and come out the other side with a project
whose canvas holds the bloks the decompiler found, each carrying its verbatim source span.

## Scope

1. **`/app/import`**, in the rail's `WORKSPACE` group where EPIC-023 left a link pointing at the
   public decompiler.

2. **The mockup's KPI strip**: bloks, fragmented rules, findings (with the high count), and word or
   token count. Every number from the real decompile result; no number that is not.

3. **The source ↔ bloks split**, reusing `/decompile`'s components rather than copying them. That
   page already solves hover linking, pinning, the leading markers and the accessibility corrections
   `docs/design/README.md` lists — one tab stop per blok with arrow keys inside, keyboard pin from
   the span side.

4. **The findings panel**, reusing `lib/site/finding-copy.ts` and `/decompile`'s severity rendering.

5. **`Create project from bloks`** — one action that writes a project, a prompt and the bloks with
   their ranges, then lands on the new canvas. **The span is stored verbatim** (`CLAUDE.md` rule 3),
   and the ranges are the decompiler's ranges, unmodified.

6. **CRLF carried, not normalised.** EPIC-013 measured what normalising costs: a range expected at
   offset 27 arrives at 25. The decompiler already handles it; the write path must not undo it.

## Out of scope

- **Changing `/decompile`.** It stays public, account-free and exactly as it is. This page reuses
  its components; it does not replace it or move it behind auth.
- **Re-importing into an existing prompt**, merging, or diffing an import against a canvas.
- **Uploading a file**, importing from a URL, or importing more than one prompt at a time.
- **Any change to the segmenter, the classifier, the clusterer or the detectors.** `packages/core`
  is not touched.
- **Lessons.**

## Acceptance criteria

- [ ] `/app/import` renders the KPI strip, the split and the findings from one real decompile, with
      every number derived. Evidence: test names plus a screenshot.
- [ ] Hover and keyboard linking work in both directions, one tab stop per blok. Evidence: test
      names.
- [ ] `Create project from bloks` writes a project, a prompt and N bloks, and lands on the canvas
      with N cards. Evidence: the drive.
- [ ] **Every stored span is byte-identical to the pasted source's range**, including CRLF, tabs,
      emoji and RTL. Evidence: four fixtures, the set EPIC-016 used for the ask bar.
- [ ] Compiling the created prompt reproduces the source's content for the spans that carry text.
      Evidence: test name.
- [ ] The decompiler's components are **imported, not copied** — no second implementation of the
      source map. Evidence: `pnpm dead-code` plus a test asserting the shared module.
- [ ] No sideways scroll at 390px; 44px targets.
- [ ] All gates green per package; `gates.mjs ci` green before merge.
- [ ] The built app driven in a browser, paste to canvas, screenshots in the report.
- [ ] Report and session log written.

## Notes for the implementer

- The mockup's Import screen is lines 1100–1140; its source-map data and fragment superscripts are
  at 1480–1512. `docs/design/41prompts-decompiler.html` is the canonical prototype for the
  algorithms and its sample prompt has **known findings and known fragment counts** — those are
  fixtures, per `docs/design/README.md`.
- The sixth refusal of a second copy is the one that matters here. This repository has refused a
  duplicate implementation five times (EPIC-053's generator, EPIC-057's rate limiter, among them).
  Reuse `/decompile`'s components or explain in the report why they could not be reused.
- `CLAUDE.md` rule 3 is the correctness bar: **the compiler never emits a paraphrase of user text**,
  and a blok stores the verbatim span. An import that "cleans up" whitespace has broken the product.
