# EPIC-003 report: Design system

Branch `epic/003-design-system`. 2026-09-05.

**Status: done.** Tokens, all fifteen scoped components, the eight illustrations, the theme
provider/cookie/toggle, and the `/dev/ui` gallery are built and verified in both themes; every
acceptance criterion has a passing automated check. See "Deviations from the mockup" below for
the handful of places the source-of-truth prototype lost to either this epic's own stated rules
or a real, machine-verified accessibility failure — each one is small (a single hex nudge, a
prop rename) and explained.

## Built

Followed the plan (`docs/epics/plan-EPIC-003.md`): tokens + two components (Button, Badge) first,
checked against the mockup side by side, then the rest.

- **`packages/ui/src/tokens.css`** — every colour/spacing/radius/motion token from the mockup's
  `:root`/`[data-theme=dark]`, as Tailwind v4 `@theme` custom properties (`--color-*` generate
  `bg-*`/`text-*`/`border-*` utilities for free; `--spacing-s1..s8` matches Tailwind's own default
  0.25rem scale at multipliers 1/2/3/4/6/8/12/18, so it was named rather than re-derived). Border
  widths and shadow offsets aren't Tailwind-namespaced concepts (no 1.5px border scale value, no
  hard-offset shadow scale) — plain custom properties, consumed only through the two
  `.surface-interactive`/`.surface-data` classes and the component recipes below, never inline.
- **`packages/ui/src/base.css`** — global reset (box-sizing, body background/font/typography
  scale) and the reduced-motion backstop, ported from the mockup's own two-layer strategy: every
  animated component declares its own explicit end-state override under
  `prefers-reduced-motion: reduce` (decision 6 — the state change must stay observable), and this
  file's blanket rule only stops transition/animation *duration* everywhere else, exactly like the
  mockup's own closing `@media(prefers-reduced-motion:reduce){*{transition:none!important;...}}`.
- **`packages/ui/src/recipes.css`** — every component's structural/interactive CSS, hand-written
  from the mockup's own class rules (`.btn`, `.blok`, `.kpis`, `.tw`, `.sheet`, ...), renamed only
  where ADR-003 requires it. Centralising every literal here (rather than scattering Tailwind
  arbitrary-value utilities through fifteen component files) is what makes the "no component
  hard-codes a literal" acceptance criterion checkable by grep at all.
- **Fourteen primitives** (`packages/ui/src/primitives/`): `Button`, `Pill`, `Badge`, `Tag`,
  `BlokCard`, `Table`, `KpiStrip`, `Meter`, `Switch`, `Input`, `Textarea`, `Tabs`, `Callout`,
  `Dialog`/`Dropdown`/`Popover` (Radix `react-dialog`/`react-dropdown-menu`/`react-popover`,
  restyled to the tokens above — the epic's "shadcn primitives" instruction, implemented directly
  against Radix rather than through the shadcn CLI, which just copies the same primitives in with
  its own styling that we'd immediately replace), `Sheet` (built on `Dialog`, not a second
  focus-trap implementation).
  - `Tabs` is hand-rolled, not Radix: real ARIA tabs pattern, roving `tabindex`, arrow keys,
    Home/End, one tab stop for the whole list (README correction).
  - `BlokCard` is a real `<button>`, not a `div` with `onClick` — every blok in a canvas is
    keyboard-reachable by construction, not by convention.
  - `StatusIcon` + every `Badge`/`Callout` render an icon *and* text — enforced by
    `badge.test.tsx`/`callout.test.tsx`, not just eyeballed (decision 3 / rule 10).
- **Eight illustrations** (`packages/ui/src/illustrations/`), ported verbatim (same paths, same
  `currentColor`/CSS-variable classes) from `41prompts-illustration-system.html`.
- **Theme** (`packages/ui/src/theme/`): `THEME_COOKIE_NAME`/`isThemeValue`, `themeInitScript`
  (a pure string — testable with `new Function(...)`, not JSX — for the no-flash blocking script),
  `ThemeToggle` (client component, flips `data-theme` and writes the cookie directly). Wired into
  `apps/web/app/layout.tsx`: server reads the cookie via `next/headers` and renders `data-theme`
  directly when present (zero JS, zero flash); the blocking script only ships for a visitor with
  no cookie yet, and only then, computing from `prefers-color-scheme`.
- **`packages/ui/src/contrast.ts`/`contrast.test.ts`/`contrast-cli.ts`** — WCAG contrast checker
  over the token pairs components actually produce (not every mathematically possible pair —
  `--line` is a decorative hairline, never text). `pnpm --filter @41prompts/ui run contrast`
  prints a human-readable pass/fail table for both themes (output below); the vitest suite runs
  the same check against the real `tokens.css` and, separately, against a deliberately-broken
  fixture to prove the checker actually fails things.
- **`packages/ui/src/token-contract.test.ts`** — 43 generated tests (one per source file) asserting
  no `.ts`/`.tsx` file under `packages/ui/src` and no `.css` file holds a raw hex colour outside
  `tokens.css` itself, and that every `border-radius`/`box-shadow` in the CSS recipes is built from
  `var(--radius-*)`/`var(--shadow-offset*)`+`var(--color-plate)`, never a literal.
- **`apps/web/app/dev/ui/`** — `page.tsx` (server component: `noindex` metadata, `notFound()` when
  `DEPLOY_ENV=production` — confirmed by a real production build+start below) and
  `gallery-client.tsx` (client component: every primitive, every documented variant/state, both
  themes via the header `ThemeToggle`).
- **`apps/web/e2e/dev-ui.spec.ts`** — 15 Playwright tests: axe (both themes), visual-regression
  screenshots (both themes), one keyboard test per interactive component (Button, BlokCard,
  Switch, Tabs, Sheet, Dropdown, Popover, ThemeToggle), a reduced-motion screenshot-equivalent
  check (Switch's thumb still moves, `transition-duration` is `0s`), a no-flash/cookie-persistence
  check, and a ≥44px touch-target sweep at a 375px viewport.
- **`scripts/forbidden-words.mjs`**, wired into `pnpm lint` — ADR-003 vocabulary grep (comments
  stripped first, so its own documentation doesn't self-flag; `<label>`/`aria-label`/`aria-
  labelledby`/`htmlFor` exempted as real platform APIs, not product vocabulary) over
  `packages/ui/src`, `apps/web/app`, `apps/web/lib`.
- **Resend sender env var** (folded in per the prompt, one commit): `RESEND_FROM_ADDRESS`, read at
  runtime in `apps/web/lib/email.ts`, falling back to the sandbox address when unset. `.env.example`
  and `infra/README.md`'s "Auth secrets" section updated — production sets
  `41Prompts <noreply@mail.41prompts.ai>` in Coolify once that domain is verified in Resend;
  staging leaves it unset and keeps the sandbox fallback.
- **`docs/epics/CURRENT.md`**, **`docs/backlog.md`** — already pointed at EPIC-003 / marked
  `current` before this session (advisor-authored, committed as-is per the prompt); this session
  flips the backlog status to `done` and repoints `CURRENT.md` at EPIC-004.

## Deviations from the mockup (the epic's own rule, or a real accessibility failure, wins)

1. **Blok category colour — not shipped.** The mockup's `--kc` per blok kind reuses `--pass`
   verbatim for `expected` and (dark) `--warn` verbatim for `example`/`conditional` — a direct
   conflict with decision 3 ("green/red/amber mean pass/fail/drift and nothing else"). Decision 4
   also says category colour appears only during interaction; the mockup's `.blok::before` stripe
   is permanent. The mockup's own kind taxonomy (`role/constraint/format/example/conditional/tone/
   expected/instruction`) isn't even CLAUDE.md's (`context | constraint | example | expected |
   image_ref | image_input`) — that belongs to EPIC-020's blok model. `BlokCard` ships with no
   per-kind colour token at all: kind is conveyed by `Tag`'s text, default ink-only borders, and
   hover/selected state is the same lift-and-shadow every other card uses (`.proj`, `.les`), not a
   colour wash. EPIC-020 decides the real mapping, if it wants one.
2. **`--color-ink-3` nudged in both themes.** Axe-core's `color-contrast` rule (not a subjective
   call — a machine check this epic requires be clean) flagged the mockup's literal values as real
   "serious" failures once actually rendered as real text: light `#77736a` on bare `--bg` is
   4.03:1 (an unselected `Tab` sits directly on the page background); dark `#807d76` on `--surface`
   is 4.485:1 (an `eyebrow` caption on a card). Both need 4.5:1. Nudged to `#6f6b62` (light) /
   `#817e77` (dark) — one-to-eight hex units per channel, clears 4.5:1 everywhere the token is
   actually used (`bg`/`surface`/`sunken`, both themes; see the contrast table below) and is not
   perceptibly different from the source value.
3. **Radius applied to every interactive surface, not just `Button`/`Pill`.** The mockup itself is
   inconsistent here — `.btn` gets `border-radius:4px` but `.card`/`.blok`/`.kpis`/`.tw`/`.sheet`
   (all 2px-ink-border-plus-hard-shadow "interactive" surfaces by decision 2's own definition) get
   none. The epic's Scope section states the rule directly: "Radius: one value, interactive
   surfaces only. Data surfaces are square." Applied that literally and uniformly
   (`BlokCard`/`KpiStrip`/`Sheet`/`Dialog`/`Dropdown`/`Popover`/`Switch` all get `--radius-card`)
   rather than reproducing the mockup's own inconsistency component-by-component.
   `Table`/`data-table-wrap` stays square (a data surface, hairline, no shadow) even though the
   mockup's own `.tw` gives it the interactive treatment — same reasoning, decision 2 over the
   prototype.
4. **ADR-003 vocabulary corrections applied to every new UI string touched in this epic**, per
   `docs/design/README.md`'s "Corrections after the September review": "Category in allowed enum"
   → "Category is one of the allowed values"; every "assertion" (field name, column header, table
   caption) → "check"; a Badge's "drifted" example text → "drift" (the noun is sanctioned by the
   epic's own scope line — "Badge with icon variants (pass ✓, fail ✕, drift !)" — the adjective
   `drifted` is the literal forbidden word); "labelled bloks" → "named bloks". Component prop names
   using the word `label` were renamed too, since ADR-003's word list has no "UI-only" carve-out
   for `label` the way it does for `assertion`/`artifact`: `Kpi.label`→`title`,
   `MeterProps.label`→`description`, `TabItem.label`→`text`, `TabsProps.label`→`name`. The literal
   `aria-label`/`aria-labelledby`/`htmlFor` attributes and the `<label>` element itself are real,
   unrenameable platform accessibility APIs, not product vocabulary, and are the one thing the
   grep script explicitly exempts.

## Acceptance criteria

- [x] Every mockup token exists in `packages/ui`; a test fails on a hard-coded literal. Evidence:
      `token-contract.test.ts`, 43 tests, below.
- [x] `/dev/ui` renders every component/variant in both themes. Evidence: screenshots below +
      committed Playwright snapshots.
- [x] Visual regression snapshots for `/dev/ui`, both themes, committed and passing in CI.
      Evidence: `apps/web/e2e/dev-ui.spec.ts-snapshots/gallery-{light,dark}-linux.png`, generated
      inside `mcr.microsoft.com/playwright:v1.63.0-noble` (matching CI's `ubuntu-latest` platform
      exactly, not this session's own macOS host — see "Generating Linux baselines" below), and
      re-verified passing against those exact files afterward.
- [x] Axe clean on `/dev/ui`, both themes. Evidence: 2 passing tests below (one real failure found
      and fixed along the way — see deviation 2 above).
- [x] Contrast script passes; fails when a token is deliberately broken. Evidence: CLI output
      below (real run, all pass) + `contrast.test.ts`'s "flags ink-on-bg when ink is changed to
      equal bg" test (broken-fixture run).
- [x] Every interactive component fully keyboard-operable, visible focus ring; Tabs is real ARIA
      tabs with arrow keys. Evidence: 8 keyboard tests below, one per component.
- [x] `prefers-reduced-motion: reduce` renders the end state, doesn't skip the state change.
      Evidence: `reduced motion: Switch...` test (thumb still visibly moves position,
      `transition-duration` computes to `0s`) + the CSS pattern applied to every other animated
      component.
- [x] Touch targets ≥44px at the small breakpoint. Evidence: `touch targets` test, 375px viewport,
      below.
- [x] Theme survives reload, no flash on first paint. Evidence: `theme persists across reload...`
      test (a `41p-theme=dark` cookie renders `data-theme="dark"` in the raw server HTML with no
      client script shipped) below.
- [x] Badge and every pass/fail surface carry icon + text, never colour alone. Evidence:
      `badge.test.tsx`/`callout.test.tsx`, below.
- [x] Forbidden-word grep over `packages/ui` strings/identifiers passes. Evidence: `pnpm lint`
      output below (wired in as its own step, not a one-off manual grep).
- [x] `pnpm test`/`typecheck`/`lint` green; dependency-cruiser confirms no public package imports
      `packages/ui`. Evidence: below. (The existing `pnpm boundaries` rule already asserts this —
      `core`/`cli`/`sdk-ts` may import only each other/Node builtins/their own deps, never
      `packages/db`/`packages/ui`/`apps/*` — no new rule needed, it already ran clean before and
      after this epic's changes.)
- [x] Report and session log written; backlog updated.

## Structural things this epic had to work out, not just build around

1. **`packages/ui` needed the same `NodeNext`→`esnext`/`bundler` module-resolution fix EPIC-002
   found for `packages/db`.** Turbopack can't resolve `.js`-suffixed relative imports pointing at
   `.ts`/`.tsx` source when a package is consumed as raw source via `transpilePackages` (rather
   than published/built). `packages/db`/`apps/worker` already carry this fix; `packages/ui` hadn't
   been imported by anything before this epic (same as `db` before EPIC-002), so the bug hadn't
   surfaced. Changed `packages/ui/tsconfig.json`'s `module`/`moduleResolution` to
   `esnext`/`bundler` and stripped `.js` from every internal relative import — `core`/`cli`/
   `sdk-ts` keep `NodeNext` since they're genuinely published and need real Node ESM resolution.
2. **`apps/web` never actually depended on `@41prompts/ui`** — `next.config.ts`'s
   `transpilePackages` listed it pre-emptively (EPIC-000), but no `package.json` dependency
   existed. Added `"@41prompts/ui": "workspace:*"`.
3. **The no-flash theme script needs `suppressHydrationWarning` on `<html>`, scoped to exactly
   that element.** The blocking script (necessarily) mutates `data-theme` before React hydrates
   when there's no cookie yet, which is an intentional, expected mismatch between the SSR HTML and
   the DOM at hydration time — not a real bug, but React warns about it by default the same way it
   would warn about any other attribute mismatch.
4. **Radix Dialog's automatic close-focus-return only works through a rendered `Dialog.Trigger`**
   (it populates a `triggerRef` that `onCloseAutoFocus` reads; nothing sets it otherwise). `Sheet`
   is opened from an arbitrary caller-owned button with no `Trigger` in sight (the "create
   constraint from failure" pattern), so it had to track this itself: capture
   `document.activeElement` *during render*, on the transition where `open` flips false→true (not
   in an effect — Radix's own `FocusScope` moves focus into the dialog via an effect nested inside
   this component, which React always runs before this component's own effect could react to the
   same state change, so an effect-based capture is provably always one render too late), then
   hand it back via `onCloseAutoFocus`. Verified with a dedicated repro script before landing on
   this fix; two earlier attempts (a `focusin` listener gated on `open`, then the same listener
   filtered by "is the target inside a dialog") were each provably racy for different reasons
   before the render-phase-capture version ran clean across dozens of repeated trials.
5. **Radix DropdownMenu's "auto-focus the first item on open" hand-off measurably slows down the
   more pages a single headless Chromium process has already opened in one test run** — reproduced
   deterministically (sheer count of prior `page.goto()` calls in the same worker, unrelated to
   what those pages did) on both this session's macOS host and inside the Linux Playwright
   container; confirmed via a bisecting repro script that it isn't a fixed delay (still hadn't
   landed after 4+ seconds in the failing case) and isn't about `document.hasFocus()` (true in both
   the passing and failing case). Real users never accumulate "nine prior automated page loads in
   one browser process" — this is a test-runner artifact, not a product defect — but the *actual*
   keyboard behaviour underneath is correct either way: pressing `ArrowDown` from the not-yet-
   auto-focused container state correctly reaches the first item, same as pressing it from the
   auto-focused state reaches the second. Rewrote the test to assert that real invariant (arrow
   keys reach and move between every item, regardless of exactly when Radix's convenience
   auto-focus lands) instead of hard-coding the auto-focus timing as if it were part of the
   contract. Stable across 3 full-file repeats + a `--repeat-each=2 ×3` batch after the fix.
6. **A Chromium screenshot-capture artifact, not a real bug:** taking a full-page screenshot while
   an `<input>`/`<textarea>` exists caused a client-only `style="caret-color:transparent"` (set by
   Chromium itself, not by any code in this repo) that never existed in the server-rendered HTML —
   a real hydration-mismatch warning, surfaced by Next's dev-mode error indicator as a floating "1
   Issue" badge sitting on top of the gallery (visible in the first draft of the visual-regression
   screenshots). Added `suppressHydrationWarning` to `Input`/`Textarea` (same category as #3 above)
   and separately set `devIndicators: false` in `next.config.ts` (the route badge itself also
   rendered on top of content even with nothing to report; Next's own docs confirm real compile/
   runtime errors still surface without it).

## Generating Linux baselines

This session's own machine is macOS; Playwright's visual-regression screenshots are inherently
platform-specific (font antialiasing differs), and CI runs `ubuntu-latest`. Rather than commit a
`darwin` baseline that would never match CI, or skip the criterion, this session used Docker (a
tool already on this machine) to generate the actual baseline CI will compare against:
`mcr.microsoft.com/playwright:v1.63.0-noble` (exact `@playwright/test` version match), repo copied
in (not bind-mounted, so the host's own `node_modules` — full of macOS-arm64 native binaries —
was never touched), `pnpm install` fresh inside the container for real Linux binaries, dev server
started inside the container, `playwright test dev-ui -g 'visual regression' --update-snapshots`,
resulting `gallery-{light,dark}-linux.png` copied back out. Container and image removed afterward;
nothing was left running or installed outside this repo's own tree.

## Verification

```
$ pnpm test          # 7 packages, all green (packages/ui: 5 files, 64 tests)
$ pnpm typecheck      # 7 packages, all green
$ pnpm lint           # turbo lint (7 packages) + boundaries + turbo boundaries + forbidden-words
✔ no dependency violations found (9 modules, 8 dependencies cruised)
Checked 101 files in 7 packages, no issues found
Forbidden-word grep clean (packages/ui/src, apps/web/app, apps/web/lib).

$ pnpm --filter @41prompts/ui run contrast
LIGHT … 16 pairs, all PASS (worst case 4.53:1 against a 4.5 bar; focus ring 5.72:1 against a 3 bar)
DARK  … 16 pairs, all PASS (worst case 4.55:1 against a 4.5 bar)

$ pnpm exec playwright test dev-ui        # local macOS run: 13/13 (visual regression needs the
                                            # committed *-linux.png baselines — see above; run
                                            # inside the same Playwright Linux container for the
                                            # full 15/15 including those two)
  ✓ axe: no violations in light theme
  ✓ axe: no violations in dark theme
  ✓ keyboard: Button / BlokCard / Switch / Tabs / Sheet / Dropdown / Popover / ThemeToggle (8)
  ✓ reduced motion: Switch still shows the state change, just without animating it
  ✓ theme persists across reload with no flash
  ✓ touch targets: every interactive control ≥44px at 375px viewport
  13 passed

# production build + boot, confirming /dev/ui's DEPLOY_ENV gate:
$ DEPLOY_ENV=production next build && next start
Route (app): ... ƒ /dev/ui ...   (dynamic, as expected — reads DEPLOY_ENV/cookies at request time)
$ curl -o /dev/null -w '%{http_code}\n' http://localhost:3100/dev/ui   # -> 404
$ curl -o /dev/null -w '%{http_code}\n' http://localhost:3100/         # -> 200
```

## Skipped (out of scope, per the epic)

Any product screen/page/route other than `/dev/ui`; the logo animation (EPIC-016); lesson-mode
styling beyond confirming V5 Soft exists as a named variant in the prototype (EPIC-060); charts,
heatmaps, diff views (Stage 3–4).

## Open questions for the advisor

1. **Blok category colour is unshipped** (deviation 1) — EPIC-020 (blok model) needs to either
   pick a real colour-per-kind mapping against its own taxonomy or confirm ink-only + text/icon is
   the permanent answer.
2. **`Table`'s per-provider-cell pass/fail is colour+number, not colour+icon** — the epic's rule 10
   example names `Badge` explicitly; a dense results matrix with an icon in every cell felt like it
   would defeat scannability at width, and the differing numbers (`40/40` vs `37/40`) are already
   non-colour information. Flagging this specific call rather than assuming it's obviously right.
