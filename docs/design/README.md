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

**`--color-ink-3` (EPIC-003, accepted).** The mockup's literal values — light `#77736a` on `bg`/`surface`/
`sunken`, dark `#807d76` on the same — fail WCAG AA: axe-core's `color-contrast` rule measured 4.03:1 and 4.485:1
against the 4.5:1 bar on real rendered text (an unselected `Tab`, an `eyebrow` caption), not a subjective read.
`packages/ui`'s nudged values win: `#6f6b62` (light) / `#817e77` (dark). Blok category colour staying unshipped
(EPIC-003's deviation 1 — the mockup's `--kc` reuses `--pass`/`--warn` verbatim, conflicting with "green/red/amber
mean pass/fail/drift and nothing else") is also accepted; EPIC-020 owns picking a real per-kind mapping, or
confirming ink-only is permanent.
