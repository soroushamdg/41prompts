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
