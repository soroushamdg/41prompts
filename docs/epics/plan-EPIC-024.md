<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# Plan — EPIC-024: App page composition

Written 2026-09-20, against `docs/epics/CURRENT.md`, after reading the code the epic describes.

## What reading the code changed before a line was written

The epic as written had eight scope items. **Two were already built**, and finding that out cost
twenty minutes against however long it would have taken to rebuild them badly:

- **Blok kind colour shipped in EPIC-021a decision 6.** `--color-kind-*` × 6 in `tokens.css`,
  resolved onto `--blok-kind` in `recipes.css`, painted only inside `:hover`, `:focus-visible` and
  `[data-selected]`, with `blok-card.test.tsx` failing if a card at rest paints one. The palette is
  already drawn from blue/violet/magenta/clay and explicitly away from green/red/amber.
  **`docs/design/README.md` is the stale artefact**, still recording the debt as unassigned.
- **The drift banner already says "edited by hand" and "Update from blok".**

Both are corrected in the epic file. The remaining work is composition.

## The one hard problem: making a blok card compact without losing anybody's text

`blok-editor.tsx` holds one rule, in bold, and it is the right one:

> **The server's value is never written back into the field.** […] The field belongs to the person
> typing in it, and a component that adopts a server value mid-sentence deletes the end of that
> sentence.

A compact card collapses that field into a summary line. So collapsing is a second way to take text
off the screen, and it has to be at least as safe as the rule above.

**The rule: a card may collapse only when its text is on the server.** Concretely, `BlokEditor`
already tracks `idle | saving | saved | failed`. Collapse is allowed when the editor is `saved`, or
`idle` **with text identical to what was loaded**. It is refused while `saving`, while `failed`, and
while `idle` with unsaved edits — in those states the card stays open and says why.

That makes the failure mode "the card would not close", which is visible and recoverable, rather
than "my paragraph is gone", which is neither.

Two consequences:

- The collapse decision lives in `BlokEditor`, which owns the save state. The card asks; the editor
  answers. Nothing above it gets to guess.
- **A test drives the refusal**, not just the happy path: type, collapse before the debounce, assert
  the card is still open and the text still there.

## Order of work

Each step is independently correct and independently committable.

1. **Projects card grid.** Self-contained, no interaction risk. `listProjects` gains Pass / Runs /
   Cost in **one** query (a `LEFT JOIN` over `suite_runs`, grouped), with `—` where there are no
   runs. A test counts the queries the way `names.test.ts` counts, so "one query, not N+1" is
   asserted rather than intended.
2. **The editor split.** One bordered card, two panes, the mockup's `1.05fr 1fr`, each pane
   scrolling inside itself rather than the page. Compiled pane gains the token and cost readout —
   **from the real compiled string and EPIC-042's real price table, or absent.**
3. **Compact blok cards**, with the collapse rule above. The riskiest step, taken third so the two
   cheap wins are already banked.
4. **One `+ Add blok` with a kind picker**, replacing six buttons.
5. **Checks and Providers tabs.**
6. **`docs/design/README.md`'s stale paragraph.**

## Files

**Changed**
- `apps/web/lib/canvas/queries.ts` — `listProjects` returns metrics.
- `apps/web/app/app/projects/page.tsx` + a new `project-card.tsx`.
- `apps/web/app/app/pr/[promptId]/editor.tsx`, `canvas.tsx`, `blok-editor.tsx`, `compiled-pane.tsx`,
  `workbench.tsx`.
- `packages/ui/src/canvas.css`, `recipes.css`.
- `docs/design/README.md`.

**New**
- `apps/web/app/app/pr/[promptId]/checks-tab.tsx`, `providers-tab.tsx`.
- `apps/web/lib/canvas/metrics.ts` + test.
- `scripts/drive-epic-024.mts`.

## Decisions taken before writing code

1. **Cost is shown only where it is real.** The mockup prints `$0.0031/run` on the compiled pane and
   `Cost $0.37` on a project card. `results.costCents` is real and populated by actual runs; a
   *predicted* per-run cost for an unrun prompt is not, and would be the same class of invention as
   the rail's `4,120 runs left`. So: a project's cost is the sum of what its runs actually cost, and
   the compiled pane shows **tokens** — countable from the string — and a per-run cost **only** if
   the prompt has a model pinned and a price row for it.
2. **A card is one tab stop.** `docs/design/README.md`'s accessibility correction. The source map
   already does this; the canvas does not, and the four controls below each card are why.
3. **Move/pin/delete move inside the card's chrome** but stay real buttons reached by Tab, with the
   arrow-key accelerator `canvas.tsx` already implements. Rule 12: a drag that only works with a
   mouse fails, and would pass a careless review.
4. **The Checks tab reads, it does not write.** Authoring a check is editing its `expected` blok,
   which the canvas already does. A second editing surface for the same row is the duplicate this
   repository has refused six times.

## Risks

- **`canvas.spec.ts` encodes the current shape** — `.canvas-list > li`, `Add context`, the control
  row. Some of it will legitimately need amending; the epic says to name each amendment rather than
  quietly rewrite the file. The same is true of `runs-helpers.ts`'s `addBlok`, which **every other
  spec depends on**, so it changes once and carefully.
- **Height parity between the two panes** is what the compact card is for. If cards stay tall the
  split will still look wrong, so the screenshot is the check, not the CSS.
- **EPIC-023's query measurement is not yet a before/after.** This epic adds a query to
  `/app/projects`; take the delta while the instrument is fresh.
