# Design prototypes

These HTML files are the UI specification. They are static, self-contained, and open in any browser. Claude Code
reads them to know what a screen looks like, how it behaves, and which tokens it uses. When an epic and a prototype
disagree, the epic wins; say so in the report.

| File | What it specifies | Canonical for |
|---|---|---|
| `41prompts-full-mockup.html` | The whole product: website (Home, Features, Delivery, Pricing, Learn, Docs, About, Security, Changelog, Blog, Guides, Careers, Contact, Sign in, Sign up) and app (Projects, Blok Editor, Import, Runs, Versions, Deploy, Connect, Lessons, Settings). Design tokens in `:root` and `[data-theme=dark]`. Motion patterns. Ask-AI handoff. | Every page. Extract tokens from here for `packages/ui`. |
| `41prompts-decompiler.html` | Working decompiler: deterministic segmentation, clustering into multi-range bloks, diagnostics, source map with hover linking, leading markers, pin, dim. The JS is a reference implementation of the algorithms for `packages/core`. | EPIC-010 to 013 |
| `41prompts-style-comparison.html` | Why the Resolution style was chosen; the `★ Resolution` and `★ Resolution dark` tabs are the system. Other tabs are rejected alternatives. | EPIC-003 rationale only |
| `41prompts-neobrutalism-variants.html` | Six variants; V2 Muted Ink is the app, V5 Soft is lesson mode, V1 Full Send is marketing-only. | EPIC-003, EPIC-060 |
| `41prompts-illustration-system.html` | Eight SVG illustrations, `currentColor`, 2px strokes, empty states only. Copy the SVGs verbatim. | Empty states in any epic |
| `41prompts-logo-v2.html` | Logo with the 41 → AI outline morph; the point arrays and lerp are the implementation. Static filled plate for favicon. | EPIC-016 |

## Rules the prototypes encode

- Green, red, amber mean pass, fail, drift. Nothing else may use them.
- Interactive elements: 2px ink border, hard offset shadow. Data surfaces: hairline, no shadow, no radius.
- Highlight is ink inversion, not a colour.
- Blok category colours appear only during interaction, never persistently.
- Light and dark are designed in parallel from one token set; dark shadows are dark grey plates, not black.
- `prefers-reduced-motion` collapses every animation to its end state.
- No "label", "pointer", "artifact", "promote" in UI copy. Say version, Live, Publish, Undo.

## How to use them

Open the file in a browser and interact. Read the CSS custom properties before writing any component. When porting
an algorithm from the decompiler prototype, port its tests too: the sample prompt in it has known findings and
known fragment counts, and those become fixtures.

## Corrections after the September review (these override the prototypes)

Vocabulary (ADR-003): the prototypes say "block", "assertion", "labelled", "enum", "json_schema", "drifted",
"Reconcile", "Override with a reason", "sha". Build with: span, check, named, "one of the allowed values",
"valid JSON shape", "edited by hand", "Update from blok", "Publish anyway", "version id".

Colour: the prototypes use amber for "unsaved" and for cost deltas. Amber means drift only. "Unsaved" and cost
deltas use neutral ink.

Version state: one vocabulary everywhere: "Draft v7" and "Live v6". Not "v7 · unsaved", not "v7 · current".

Accessibility the prototypes get wrong and the build must get right: one tab stop per blok in the source map with
arrow keys inside, not one per span; keyboard pin from the span side; real ARIA tabs; heatmap cells as focusable,
labelled buttons with a shape difference; pass/fail icons alongside colour; `aria-valuetext` on sliders; 44px
touch targets; reduced motion shows the end state of the hero and the logo, it does not skip them.

**The prototypes are the spec for the interface, not for the compiled string (EPIC-020, 2026-09-12).**

This is the correction that outlives the argument that produced it. A prototype specifies what a
screen looks like and how it behaves. It does **not** specify the bytes the product sends to a model,
even where it appears to — and the compiled pane is exactly such a place, because it *displays* a
string the model also *reads*, and those two readers want different things.

The first real case: `41prompts-full-mockup.html` joins compiled spans with `join('\n')` (line 1471).
Read as a specification of the compiled prompt, that means a single newline between bloks. EPIC-020
shipped it that way and then measured it. **A single newline makes a blok boundary indistinguishable
from a newline inside a blok's own text** — a list blok followed by an example blok runs together
with nothing marking where one stops — and on the committed corpus that is 25 of 160 bloks, reaching
**14 of the 27 multi-blok prompts**. It was reverted to a blank line.

Two things about that failure are worth keeping:

- **Nothing could catch it.** Spans carry their offsets, so the pane, attribution and drift were all
  correct, and the whole suite passed under both separators. The loss was in the string the model
  reads, which no assertion in this codebase looks at. A degradation no test can see is the kind to
  be conservative about.
- **A blank line in a pane and a blank line in a prompt are not the same decision.** The mockup's
  author was choosing pane density. Nobody was choosing what a model sees, because the pane is where
  a prototype's attention naturally stops.

So: take behaviour, layout, tokens, states and copy from the prototypes. Where a prototype implies
something about **what gets sent, stored, or published**, treat it as an illustration and decide it
on its own terms — then say so in the report, as EPIC-020's §6.2 does.

**`--color-ink-3` (EPIC-003, accepted).** The mockup's literal values — light `#77736a` on `bg`/`surface`/
`sunken`, dark `#807d76` on the same — fail WCAG AA: axe-core's `color-contrast` rule measured 4.03:1 and 4.485:1
against the 4.5:1 bar on real rendered text (an unselected `Tab`, an `eyebrow` caption), not a subjective read.
`packages/ui`'s nudged values win: `#6f6b62` (light) / `#817e77` (dark). Blok category colour staying unshipped
(EPIC-003's deviation 1 — the mockup's `--kc` reuses `--pass`/`--warn` verbatim, conflicting with "green/red/amber
mean pass/fail/drift and nothing else") is also accepted; That debt was assigned to EPIC-020, which
could not take it: EPIC-020's scope puts "any UI, canvas, or compiled pane" explicitly out of scope,
and it shipped 2026-09-12 without touching colour. **It passes to EPIC-021a/EPIC-021b**, which build
the canvas the mapping would appear on.
