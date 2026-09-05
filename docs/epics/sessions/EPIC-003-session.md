# EPIC-003 session log

**Date.** 2026-09-05.

**Prompt sent.** Same autonomy as EPIC-002: plan into `docs/epics/plan-EPIC-003.md`, proceed
immediately, implement, self-review, push, open the PR, squash-merge once CI is green — one
batched pause reserved for anything mutating the staging/production box (nothing in this epic
needed one). Commit the advisor's `EPIC-003-design-system.md` and the `docs/backlog.md` EPIC-004
note as-is first, then point `CURRENT.md` at EPIC-003. Read the epic file, `docs/design/README.md`,
and the three prototypes it names before writing anything. Build tokens plus two components first,
put them on `/dev/ui`, compare against the mockup, only then build the rest. Fold in, one commit:
production's Resend sender moves to `mail.41prompts.ai`, staging stays `onboarding@resend.dev`,
driven by an env var. Finish with report, session log, backlog status, `CURRENT.md` → EPIC-004.

**Plan summary.** Written into `docs/epics/plan-EPIC-003.md` before any code, after reading the
epic, `docs/design/README.md`, `41prompts-full-mockup.html`'s full `<style>` block,
`41prompts-neobrutalism-variants.html` (confirmed V2 Muted Ink identical to the full mockup's own
`:root`), and `41prompts-illustration-system.html`: extract every token value verbatim, flag the
blok-category-colour conflict up front (decision 3/4 vs the mockup's own `.blok`/`--kc` rules) and
resolve it by shipping no per-kind colour at all, build Button+Badge first and check them against
the mockup with a real Playwright screenshot before building the other thirteen components, centre
every literal colour/radius/shadow in `tokens.css`/`recipes.css` (not scattered through component
files) specifically so the "no hardcoded literal" acceptance criterion is mechanically checkable.

**Decisions made and why.**
- **`packages/ui` moved from `NodeNext` to `esnext`/`bundler` module resolution**, same fix
  EPIC-002 already found for `packages/db` — Turbopack can't resolve `.js`-suffixed relative
  imports pointing at `.ts`/`.tsx` source when consumed as raw source via `transpilePackages`.
  `packages/ui` had never actually been imported by anything before this epic (same as `db` before
  EPIC-002), so the bug hadn't surfaced yet. `core`/`cli`/`sdk-ts` keep `NodeNext` — genuinely
  published.
- **Every component recipe lives in `recipes.css` as a hand-written class, not Tailwind utility
  classes inside the `.tsx` files.** Considered building everything from Tailwind utilities (more
  idiomatic for a Tailwind v4 project) but the two surface languages need literal values Tailwind
  doesn't model natively (1.5px hairline border, hard-offset shadows) — centralising them in one
  CSS file is what makes `token-contract.test.ts`'s grep-based "no literal" check possible at all,
  and matches the mockup's own class-based CSS almost 1:1, which made porting values mechanical
  rather than a re-interpretation.
- **Radius applied to every interactive surface (`BlokCard`, `KpiStrip`, `Sheet`, `Dialog`,
  `Dropdown`, `Popover`, `Switch`), not just `Button`/`Pill` the way the mockup literally does it.**
  The mockup is internally inconsistent (`.btn` gets 4px, `.card`/`.blok`/`.kpis`/`.tw`/`.sheet`
  get none despite the same border+shadow treatment); the epic's own Scope section states the rule
  directly ("one value, interactive surfaces only"), so applied it uniformly rather than
  reproducing the prototype's inconsistency component-by-component. Documented as a deviation in
  the report rather than silently picked.
- **`--color-ink-3` nudged in both themes** (`#77736a`→`#6f6b62` light, `#807d76`→`#817e77` dark) —
  not a judgement call, a machine one: axe-core's `color-contrast` rule flagged the mockup's
  literal values as real "serious" failures once actually rendered (an unselected `Tab` on bare
  `bg`, an `eyebrow` caption on `surface`), both a hair under the 4.5:1 AA bar. Verified the exact
  ratio with a small Python script before touching the token, and re-verified with axe after.
- **`Sheet` captures its return-focus target during render, not in a `useEffect`.** Radix's own
  automatic close-focus-return only works through a rendered `Dialog.Trigger` (populates a
  `triggerRef` nothing else sets); `Sheet` is opened from an arbitrary caller-owned button with no
  `Trigger`. First attempt (a `focusin` listener gated on the `open` prop) was provably racy —
  Radix's own focus-scope-mount effect (a descendant) always runs before this component's effect
  reacting to the same `open` change, so the listener's closure was still stale when Radix moved
  focus in. Second attempt (same listener, filtering by "is the event target inside a dialog")
  fixed most of it but still raced on `<body>` transiently receiving focus during unmount. Landed
  on capturing `document.activeElement` synchronously during the render where `open` flips
  false→true (before React touches the DOM for that commit at all) — no effect, no race window.
  Confirmed clean across 6+ repeated trials after; the two earlier attempts were each flaky in
  different, reproducible ways before that.
- **`packages/ui` gets no SPDX header comment at all**, matching `packages/db`'s existing
  convention (proprietary packages carry none — only `packages/core` does, being public). First
  draft invented a `SPDX-License-Identifier: NOASSERTION` comment for the new CSS files; caught by
  checking sibling proprietary packages before committing, removed.
- **ADR-003 vocabulary corrections extended to every new UI string, not just the ones the epic
  file names.** `docs/design/README.md`'s corrections list covers "labelled"→"named" and
  "enum"→"one of the allowed values" for prose, but the forbidden-word list itself (`label`,
  `assertion`, `drifted`, ...) also caught several of this epic's own component *prop names*
  (`Kpi.label`, `MeterProps.label`, `TabItem.label`, `TabsProps.label`) — renamed all of them
  (`title`/`description`/`text`/`name` respectively) rather than treating the rule as UI-copy-only,
  since only `assertion`/`artifact` carry an explicit "(UI only)" carve-out in CLAUDE.md's list.

**What took longer than expected.**
- **The Dropdown keyboard test's flakiness took the longest single stretch of this session to
  actually root-cause**, because the obvious hypotheses were each wrong: not a fixed-timing race
  (still hadn't resolved after 4+ seconds of polling in the failing case), not
  `document.hasFocus()` (measured `true` in both the passing and failing runs), not page/context
  state leaking between tests (proved isolated with an explicit `window.__marker` check), not
  specific to what the *preceding* tests did (reproduced with nine no-op dummy tests standing in
  for the real ones). Bisected down to: sheer count of prior `page.goto()` calls in the same
  worker process, on both this machine's host Chromium and inside the Linux Playwright container
  independently. Once isolated to "Radix's auto-focus-first-item hand-off is just measurably
  slower under this specific load, not broken," the fix was to test the actual invariant (arrow
  keys reach every item, from either legitimate starting state) instead of the exact timing.
- **Generating a Linux visual-regression baseline from a macOS session.** Needed for the "committed
  and passing in CI" acceptance criterion, since CI runs `ubuntu-latest` and this machine doesn't —
  a locally-generated `darwin` baseline would never match. Used Docker (already installed) rather
  than skip the criterion or fudge a tolerance threshold: copied the repo into
  `mcr.microsoft.com/playwright:v1.63.0-noble` (not bind-mounted — a first attempt at bind-mounting
  risked corrupting this session's own macOS `node_modules` with Linux binaries), fresh
  `pnpm install` inside for real Linux native binaries (esbuild, lightningcss), dev server started
  inside, snapshots generated, copied back out, container and image removed. Along the way, found
  and fixed a real (if cosmetic-turned-real) issue this surfaced: a Chromium screenshot-capture
  side effect (`caret-color:transparent` injected into text inputs) was triggering a genuine
  hydration-mismatch warning that Next's dev-mode error indicator rendered as a floating badge on
  top of the gallery in every snapshot — fixed with a scoped `suppressHydrationWarning` plus
  `devIndicators: false`, then regenerated the baselines a final time.
- **The exact contrast bar for `--color-ink-3`.** First treated it as a relaxed "3:1 large-text/
  UI-component" tier (tertiary label chrome, never body copy) to explain away a light-mode
  bare-`bg` shortfall that no shipped component actually exercises — reasonable in isolation, but
  axe-core doesn't grant that exemption to real small bold caption text, and a *second*, actually-
  rendered instance (dark `ink-3` on `surface`) failed the same way. Recomputing precisely
  (Python, sRGB relative luminance) rather than continuing to argue for a relaxed policy showed the
  fix needed was tiny (1–8 hex units), so took that instead of the exemption.

**Verification output (tail).** Full transcript in
`docs/epics/reports/EPIC-003-report.md`'s Verification section. Short form: `pnpm test` — 7
packages green (`packages/ui`: 5 files, 64 tests); `pnpm typecheck` — 7 packages green; `pnpm
lint` — turbo lint (7 packages) + `pnpm boundaries` (`no dependency violations found`) + `turbo
boundaries` (`Checked 101 files in 7 packages, no issues found`) + the new `forbidden-words` step,
all clean; `pnpm --filter @41prompts/ui run contrast` — 16 pairs × 2 themes, all pass; local macOS
`playwright test dev-ui` (excluding the two Linux-only visual-regression tests) — 13/13, stable
across repeated runs; the same 15 tests including visual regression — 15/15 inside the Linux
container, stable across 3 repeats plus a `--repeat-each=2 ×3` stress batch after the Dropdown fix;
a real `DEPLOY_ENV=production next build && next start` confirming `/dev/ui` 404s in production
and `/` still serves 200.

**Open questions.**
- Blok category colour is unshipped (see the report's deviation 1 and "Open questions" section) —
  EPIC-020 needs to pick a real per-kind mapping against its own taxonomy, or confirm ink-only is
  permanent.
- `Table`'s per-cell pass/fail is colour + differing numbers, not colour + icon — flagged as a
  judgement call in the report rather than assumed obviously correct against rule 10's letter.
