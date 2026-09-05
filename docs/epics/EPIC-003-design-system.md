# EPIC-003: Design system
Stage: 0 · Depends on: EPIC-000 · Size: M

## Goal
`packages/ui` holds the Resolution design system: one token set driving light and dark, and the base components
every later screen is assembled from, each keyboard-operable, touch-sized, screen-reader-correct, and
reduced-motion-safe. A gallery at `/dev/ui` proves it. No epic after this one invents a colour, a spacing value,
or a component.

## Source of truth
`docs/design/41prompts-full-mockup.html` for tokens and every screen; `docs/design/41prompts-neobrutalism-variants.html`
(V2 Muted Ink = app, V5 Soft = lesson mode, V1 Full Send = marketing only);
`docs/design/41prompts-illustration-system.html` for empty states, copied verbatim;
`docs/design/README.md` for the corrections that override the prototypes. When a prototype and this file disagree,
this file wins; say so in the report.

## Decisions (do not re-litigate)
1. Tokens live in `packages/ui` as Tailwind v4 `@theme` custom properties, defined once and inverted for
   `[data-theme=dark]`. Extract the exact values from the mockup's `:root`; do not re-pick colours by eye.
2. Two surface languages, as the prototypes encode: **interactive** elements get a 2px ink border and a hard
   offset shadow; **data** surfaces get a hairline, no shadow, no radius. A component is one or the other.
3. Green, red, amber mean pass, fail, drift, and nothing else (rule 10). Every pass/fail is also carried by an
   icon and text, never colour alone. Amber appears only in drift components; "unsaved" and cost deltas use
   neutral ink (README correction).
4. Highlight is ink inversion, not a colour wash. Blok category colours appear only during interaction.
5. Theme is chosen by the user and stored in a cookie, read server-side so the first paint is correct; default
   follows `prefers-color-scheme`. No flash of the wrong theme.
6. `prefers-reduced-motion` shows every animation's end state; it never skips the state change (rule 12).
7. Touch targets are at least 44px on small viewports for every interactive element; hover is never the only way
   to reach information.
8. Components are presentational and typed. No data fetching, no router, no application state in `packages/ui`.
9. `packages/ui` is proprietary and may never be imported by a public package (rule 11).
10. Vocabulary (ADR-003) applies to every string, prop name, and variant name: blok, span, check, version, Draft,
    Live, Publish, Publish anyway, Undo, edited by hand, update from blok. Never block, assertion, label, pointer,
    artifact, promote, enum, sha, reconcile, drifted.

## Scope
- Tokens: colour, ink, surface, spacing scale, radii, border widths, shadow offsets, typography scale, focus ring.
- Components: Button (variants and sizes), Pill, Badge with icon variants (pass ✓, fail ✕, drift !), Tag, BlokCard,
  Table, KpiStrip, Sheet, Switch, Input, Textarea, Tabs (full ARIA tabs pattern, arrow keys, `aria-controls`),
  Callout, Meter. shadcn primitives only for Dialog, Dropdown, Popover, restyled to these tokens.
- Motion primitives honouring reduced motion.
- Theme provider + cookie; `ThemeToggle`.
- The eight illustrations, copied verbatim, exposed as components for empty states.
- `/dev/ui` gallery in `apps/web`, every component in every variant and state, both themes; reachable on staging
  and in development, `noindex`, and not linked from any user-facing navigation.
- A contrast script in CI that fails on any token pair below WCAG AA for its use.

## Out of scope
- Any product screen, page, or route other than `/dev/ui`. (EPIC-013, EPIC-016, EPIC-021.)
- The logo animation. (EPIC-016.)
- Lesson-mode styling beyond noting V5 Soft exists. (EPIC-060.)
- Charts, heatmaps, diff views. (Stage 3–4, built from these tokens then.)

## Acceptance criteria
- [ ] Every token in the mockup's `:root` and `[data-theme=dark]` exists in `packages/ui`, with a test that fails
      if a component hard-codes a colour, spacing, or radius literal. Evidence: test name.
- [ ] `/dev/ui` renders every component and variant in both themes. Evidence: screenshots, light and dark.
- [ ] Visual regression snapshots for `/dev/ui` in both themes, committed and passing in CI. Evidence: job output.
- [ ] Axe clean on `/dev/ui` in both themes. Evidence: output.
- [ ] Contrast script passes; it fails when a token is deliberately broken. Evidence: both runs.
- [ ] Every interactive component is fully operable by keyboard, with a visible focus ring; Tabs implements the
      ARIA tabs pattern with arrow keys. Evidence: one test per component.
- [ ] With `prefers-reduced-motion: reduce`, animated components render their end state and the state change is
      still observable. Evidence: test name and a screenshot pair.
- [ ] Touch targets are ≥44px at the small breakpoint. Evidence: test name.
- [ ] Theme survives reload with no flash of the wrong theme on first paint. Evidence: test name.
- [ ] Badge and every pass/fail surface carry an icon and text, not colour alone. Evidence: test name.
- [ ] Forbidden-word grep over `packages/ui` strings and identifiers passes.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint` green; dependency-cruiser confirms no public package imports
      `packages/ui`.
- [ ] Report and session log written; backlog updated.

## Verification
```
pnpm test && pnpm typecheck && pnpm lint
pnpm e2e                       # /dev/ui axe + keyboard + visual regression
open http://localhost:3000/dev/ui
```

## Notes for the implementer
- Read the mockup's CSS before writing a single component; the values are decided, not up for interpretation.
- Build the tokens and two components first, put them on `/dev/ui`, and check them against the mockup side by side
  before building the other thirteen. A wrong token multiplied across fifteen components is the expensive mistake.
- Do not add a component that no epic has asked for.
- If a prototype conflicts with ADR-003 vocabulary or the colour rule, the rule wins; note it in the report.
