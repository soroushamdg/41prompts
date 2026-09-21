<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# EPIC-016b: The home page, in full

Stage: 1 · late entry, 2026-09-20 · Depends on: EPIC-072 · Size: **M**

Sequence and rationale in `docs/epics/plan-mockup-parity.md`.

## Why this row

The mockup's home page has twelve sections. The built one has five, and **that is exactly what it
was told to have.** EPIC-016's Scope reads *"Nav, hero, three-step strip, CTA and footer"*, and its
Out of scope reads *"Testimonials, logos, counters, any social proof."* EPIC-072 then wrote, in its
own Out of scope: *"Changing the home page beyond its nav and footer. EPIC-016 owns it."*

So **no epic has ever owned building the mockup's home page.** Not a build failure — a gap between
two epics, each of which correctly stayed inside its own line.

What EPIC-016 was protecting against is still right and does not go away: *"Do not write copy that
promises anything Stage 1 cannot do."* When it was written, the editor did not exist. It does now,
and so do runs, attribution, versions, publishing and two SDKs — `/features` lists twenty-one
shipped capabilities, each citing the epic that shipped it. **The home page is the only page that
still describes the Stage 1 product.**

## The ruling this epic is built on

Soroush, 2026-09-20, asked which way to take the mockup's fabricated proof and chose:

> **Build the sections with obviously-labelled example data.**

That is the whole design constraint. The mockup's product shot, run table, attribution card and
rotator are *illustrations of an interface*, and an illustration labelled as one is honest. They
are built, and each carries a visible marker saying so.

Two things on the mockup's home page cannot be rescued that way and are **out of scope** below: the
trust-logo row, whose entire function is to assert that named companies are customers; and the
per-figure proof counters, for the same reason at one remove — a counter labelled "example" has no
rhetorical content left. See Out of scope for what replaces them.

## Goal

The home page is the mockup's home page: the product shot, the run demo, failure attribution, the
capability rotator, the provider comparison and the closing call — every illustrative surface
visibly marked as an example, and every factual sentence in the claims registry citing the epic
that shipped it.

## Scope

1. **Keep the hero exactly as it is.** The paste box is the product's actual first action and is
   better than the mockup's Ask-AI bar for that job. EPIC-016 drafted five headlines and shipped
   one; that work is not reopened.

2. **The product shot** — the mockup's `.shot`: a browser chrome bar, then the compiled pane beside
   the canvas, with the hover-linked span↔blok animation and a `Replay` control. Marked `Example`.

3. **"Watch it run"** — the results table with rows landing in sequence, meters filling, and the
   failing row flashing. Marked `Example`.

4. **Failure attribution** — the JSON output with the offending key highlighted, resolving to the
   expected blok card that owns it. This is the product's core argument and the mockup gives it two
   sections; one is enough.

5. **The capability rotator** — five tabs (Import, Compose, Test, Publish, Learn), auto-cycling at
   5s with the sweep indicator, clicking a tab stopping and restarting the cycle. **"Learn" becomes
   "Deliver"**: there are no lessons and the word is denylisted.

6. **The provider comparison** — the mockup's second two-column section. Marked `Example`.

7. **Ask-AI chips** lower on the page, through the existing `lib/landing/handoff.ts`, as
   `/features` already does.

8. **Motion, to `docs/design/README.md`'s correction**: `prefers-reduced-motion` shows **end
   states**, never skips them. The mockup gets this wrong for the hero and the logo; the build gets
   it right.

9. **Every factual sentence into `claims.ts`**, each naming its epic and an evidence path. Marker
   text and example data are not claims and do not belong there.

## Out of scope

- **The trust-logo row.** NORTHWIND, OAKLINE, MERIDIAN AI, CASTELL, BLUEPRINT are invented. A row of
  fake customer logos is the one element on this page that labelling cannot save, and
  `claims.test.ts` denylists `trusted by` / `used by` for exactly this.
- **The three proof counters** — *1,240,000 prompts decompiled*, *38% contain a contradiction*,
  *4s to roll back*. All three are invented, and a counter's whole function is to assert a real
  measurement. **Replaced by three true statements that need no number**, drawn from the claims
  registry. If Soroush would rather have the counters with an `Example` marker, that is a one-line
  change to this section and the epic should take it — but the recommendation is on the record.
- **The lessons teaser.** No lessons; `lessons?` is denylisted.
- **`/pricing`, `/learn`, `/about`, `/blog`, `/careers`.** EPIC-072b and EPIC-070 take three of
  them; Stage 7 and EPIC-073 keep the other two.
- **Any change to `/decompile`** or to the nav and footer.

## Acceptance criteria

- [ ] Every illustrative surface carries a visible `Example` marker that is in the accessibility
      tree, not a decorative caption. Evidence: a test asserting the marker for each of the four,
      and a control that fails if a marker is removed.
- [ ] No sentence on the page matches any `NOT_TRUE_YET` pattern. Evidence: `claims.test.ts` green,
      **and** a new case running the denylist over the home page's rendered text, not only over the
      registry.
- [ ] Every factual sentence is in `claims.ts` with an epic that has a report and an evidence path
      that exists. Evidence: the existing claims tests.
- [ ] Under `prefers-reduced-motion`, the shot, the run demo, the rotator and the counters render in
      their **end state** — the rotator on a panel, the meters filled, the rows landed. Evidence:
      one screenshot per surface plus test names.
- [ ] The rotator advances on a timer, stops on click, and every tab is reachable and operable by
      keyboard as a real ARIA tablist. Evidence: test names.
- [ ] The page does not scroll sideways at 390px and every control is a 44px target. Evidence:
      `overflow.ts` plus a test.
- [ ] Lighthouse on the built page: performance ≥90, accessibility 100, best practices ≥95, SEO 100.
      Evidence: `scripts/lighthouse-site.mjs` output. EPIC-072 measured 17 routes with a lowest
      score of 94; this page must not be the one that drops it.
- [ ] Axe clean in both themes. Evidence: the run.
- [ ] Visual-regression baselines regenerated **on Linux**, in
      `mcr.microsoft.com/playwright:v<version>-noble`. A `-darwin` baseline is not a baseline.
- [ ] `pnpm forbidden-words` passes over every string on the page.
- [ ] All gates green per package; `node scripts/gates.mjs ci` green before merge.
- [ ] The built page loaded in a browser at 1440px and 390px, both themes, screenshots in the
      report.
- [ ] Report and session log written.

## Verification

As EPIC-023's block, with `scripts/drive-epic-016b.mts` driving the **built** home page: replay the
shot, click through all five rotator tabs, open an Ask-AI chip, then reload with reduced motion
forced and screenshot every surface's end state.

## Notes for the implementer

- The mockup's home page is lines 380–520 (markup) and its motion is lines 1600–1720 (five
  self-contained IIFEs: scroll reveals, the hero sequence, the run demo, the counters, the rotator).
  The motion is good and can be ported nearly as written — but it is inline script in a static file,
  and this codebase server-renders with `ThemeToggle` as the only client component. Decide where the
  motion lives and **say so in the report**; a page that hydrates four widgets is a different page
  from the one EPIC-016 shipped and the Lighthouse number will say so.
- The `Example` marker is the whole ruling. Make it a shared component so all four surfaces carry
  the same one, and write the control test that fails when it is removed — EPIC-072's lesson was
  that an absence assertion needs a positive control or it silently stops asserting.
- `lib/site/claims.ts` is the registry and `lib/site/claims.test.ts` is the guard. Read both before
  writing a sentence. A claim is *a sentence a reader could hold us to*; headings and link text are
  ordinary JSX.
- The rotator's fifth tab is "Learn" in the mockup. Do not ship that word.
- If a criterion is impossible, write `docs/epics/BLOCKER-EPIC-016b.md` and stop.
