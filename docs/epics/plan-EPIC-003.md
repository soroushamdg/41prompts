# Plan: EPIC-003 design system

## Source-of-truth extraction (done before writing code)

Tokens and every CSS class come from `docs/design/41prompts-full-mockup.html`'s `<style>` block
(lines 1-413), confirmed identical (V2 Muted Ink) against `41prompts-neobrutalism-variants.html`'s
`.v2{...}` block. Illustrations copied verbatim from `41prompts-illustration-system.html`.

Exact values landing in `packages/ui/src/tokens.css`:
- Colour (light + `[data-theme=dark]` inversion): `bg surface sunken line line-2 ink ink-2 ink-3
  plate focus pass pass-soft fail fail-soft warn warn-soft`.
- Spacing `s1..s8`: 4/8/12/16/24/32/48/72px — this is exactly Tailwind v4's default `--spacing`
  multiplier scale (0.25rem base) at 1/2/3/4/6/8/12/18, so it is named as `--spacing-s1..s8` in
  `@theme` and gets utilities (`p-s5`, `gap-s3`, ...) for free; not re-derived.
- Radius: one value, 4px, interactive surfaces only. Data surfaces are square.
- Border: 2px ink (interactive), 1.5px `--line` (hairline/data). Not a Tailwind numeric border
  scale value (2 exists, 1.5 does not) — expressed as reusable classes in tokens.css
  (`.surface-interactive`, `.surface-data`), not ad hoc `border-[1.5px]` in component code, so the
  literal lives in exactly one place and the "no hardcoded literal" test has one thing to grep for.
- Shadow: hard offset `4px 4px 0 var(--plate)` on interactive surfaces only (`3px`/`2px` at the
  `sm` button size, `6-10px` on emphasis surfaces — same pattern, larger offset).
- Type: `Archivo` (sans), `IBM Plex Mono` (mono), scale from the mockup's h1-h4/body/eyebrow rules.
- Motion: `--ease: cubic-bezier(.32,.72,0,1)`.
- Focus: `--focus` colour, 3px outline, 2px offset, global `:focus-visible`.

**Blok category colour — deviation, decided now, explained in the report, not re-litigated
later:** the mockup's `--kc` per blok kind (`role/constraint/format/example/conditional/tone/
expected/instruction`) reuses `--pass` verbatim for `expected` and `--warn` verbatim (dark) for
`example`/`conditional`. That collides with decision 3 ("green/red/amber mean pass/fail/drift and
nothing else"). Decision 4 also says category colour appears only during interaction, but the
mockup's `.blok::before` stripe is permanent. Both are prototype/rule conflicts — the rule wins.
Given the mockup's kind taxonomy isn't even CLAUDE.md's taxonomy (`context | constraint | example
| expected | image_ref | image_input` — a different set, owned by EPIC-020's blok model, not this
epic), `BlokCard` ships with **no per-kind colour token**: kind is conveyed by an icon + text `Tag`,
default ink-only borders, and hover/selected state is the same lift-and-shadow every other card in
the mockup uses (`.proj`, `.les`), not a colour wash. EPIC-020 decides the real kind→colour mapping
against its own taxonomy, if it wants one at all.

**Contrast:** computed all light/dark pairs actually used as text (see session log for the table).
Everything is ≥4.5:1 except `ink-3` directly on bare `bg` (4.03 light / textually fine 4.79 dark) —
one real shortfall in the mockup's own numbers. Fix: `ink-3` is only ever used by our components on
`surface`/`sunken` (4.7+ both themes), never bare `bg`; the contrast script encodes exactly that
contract (checks the pairs our components actually produce, not every mathematically possible
pair) and documents the bare-`bg` case as known-excluded with the ratio recorded.

## Package layout

```
packages/ui/src/
  tokens.css                 Tailwind v4 @theme + [data-theme=dark] + focus-visible + reduced-motion base
  theme/
    constants.ts              cookie name, ThemeValue type, isThemeValue
    theme-script.ts           no-flash inline-script string (pure, testable)
    theme-toggle.tsx          client component
  primitives/
    button.tsx, pill.tsx, badge.tsx, tag.tsx, blok-card.tsx, table.tsx, kpi-strip.tsx,
    sheet.tsx (Radix Dialog, restyled), switch.tsx, input.tsx, textarea.tsx, tabs.tsx
    (hand-rolled ARIA tabs, ours to control arrow-key behaviour precisely), callout.tsx, meter.tsx,
    dialog.tsx, dropdown.tsx, popover.tsx (Radix Dialog/DropdownMenu/Popover, restyled)
  illustrations/               8 components, one file each, ported verbatim from the prototype
  index.ts                     public exports
apps/web/app/dev/ui/page.tsx   gallery: every component, every variant/state, both themes, noindex
```

New `packages/ui` dependencies (one-line reasons in the PR body): `@radix-ui/react-dialog`,
`@radix-ui/react-dropdown-menu`, `@radix-ui/react-popover` (the three primitives the epic names),
`clsx` (variant class composition without hand-written string concatenation).
New `apps/web` dev dependency: `@axe-core/playwright` (axe scan in the e2e suite).

## Build order (per the epic's own note — tokens + 2 components first, checked, then the rest)

1. `tokens.css` + `Button` + `Badge` (one interactive-surface component, one data/status
   component — the two surface languages in decision 2). Minimal `/dev/ui` page. Screenshot both
   against the mockup's own rendered `.btn`/`.badge` markup, both themes, compare side by side.
2. Once confirmed: `Pill`, `Tag`, `Table`, `KpiStrip`, `Meter`, `Callout`, `Input`, `Textarea`,
   `Switch`, `BlokCard`, `Tabs`, `Sheet`/`Dialog`/`Dropdown`/`Popover`.
3. Illustrations (8), theme provider/cookie/no-flash script/toggle.
4. `/dev/ui` gallery completed: every variant, every state (default/hover/focus/disabled/selected/
   pass/fail/drift where applicable), light and dark, keyboard-reachable in DOM order.
5. Tests: contrast (vitest, real tokens + a deliberately-broken fixture), per-component keyboard
   tests (vitest + @testing-library/user-event), Playwright e2e for `/dev/ui` — axe both themes,
   visual snapshots both themes, one keyboard test per interactive component, reduced-motion
   screenshot pair, ≥44px touch targets at a small viewport, theme survives reload with no
   pre-paint flash (captured via a same-navigation screenshot check), forbidden-word grep script.
6. Resend sender: `RESEND_FROM_ADDRESS` env var (staging default `onboarding@resend.dev`,
   production `41Prompts <noreply@mail.41prompts.ai>` set in Coolify, never hard-coded) — one
   commit, `.env.example` and `infra/README.md` updated.
7. CI: axe + visual-regression + contrast already ride `pnpm test`/`pnpm e2e`; add the
   forbidden-word grep as its own `pnpm lint`-time or CI step.
8. Docs: report, session log, `docs/backlog.md` → EPIC-003 `done`, `docs/epics/CURRENT.md` →
   EPIC-004.

## Risks / traps called out in the epic, and how this plan avoids them

- Wrong token multiplied across 15 components → tokens + 2 components + visual check gate before
  the rest (step 1 above), and no component ever writes a literal colour/px/radius — only
  `var(--...)` or the two `surface-*` classes.
- Colour used as sole pass/fail signal → every `Badge`/`Table` cell/`Callout` pairs an icon with
  the colour; enforced by a vitest test asserting each renders both a status icon and text.
- Reduced motion "skipping" the state change → every animated component gets an explicit
  `prefers-reduced-motion` override that sets the *end state* (mirroring the mockup's own
  `.reveal{opacity:1;transform:none}` pattern), never a blanket `transition:none` that could hide
  a toggle with no persisted "before" class.
