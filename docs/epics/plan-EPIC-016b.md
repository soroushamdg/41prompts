<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# Plan — EPIC-016b: The home page, in full

Written 2026-09-20, against `docs/epics/CURRENT.md`, after reading the guards this page has to pass.

## The one hard problem, and the answer

Soroush's ruling is **build the mockup's illustrative sections with obviously-labelled example
data**. The mockup's home page carries roughly thirty numbers — `40/40`, `37/40`, `81.7%`, `75%`,
`1,284 tok`, `$0.0031`, `1,240,000`, `38%`, `4s` — and almost all of them are in surfaces that are
pictures of the product rather than statements about it.

`apps/web/app/site-claims.test.tsx` has a rule that makes this a real problem rather than a
cosmetic one:

> Every number on every page, justified. A digit that appears has to be explained, or this fails and
> somebody has to say what it is.

Listing twenty run-demo figures in `EXPLAINED_NUMBERS` as "example data" would technically pass and
would gut the guard: the list stops being a set of facts about the product and becomes a place to
put anything inconvenient.

**The answer is already in the file.** `textOf` strips `<pre>` with this reason:

> Code samples are excluded by `textOf` stripping `<pre>`: a model id and a port inside a snippet are
> part of the sample, not claims about the product.

A number inside a surface explicitly marked `Example` is the same kind of thing. So:

1. The `Example` marker becomes a **component** that wraps its surface in a known container.
2. `textOf` strips that container, exactly as it strips `<pre>` and the notices page's package list,
   with the reasoning written beside the existing two.
3. Therefore **example data is only renderable if it is labelled**, because the guard fails on an
   unlabelled figure. The marker stops being decoration and becomes the mechanism.

The control matters more than usual here and is explicit in the acceptance criteria: a test that
moves a figure *out* of the marked container and asserts the guard fires. Without it, step 2 is an
exemption that could silently widen.

## What is built

Six sections, in the mockup's order:

| # | Section | Marked `Example`? |
|---|---|---|
| 1 | The product shot — browser chrome, compiled pane beside canvas, hover-linked, `Replay` | yes |
| 2 | "Watch it run" — the results table, rows landing, meters filling, failing row flashing | yes |
| 3 | Failure attribution — the JSON with the offending key, resolving to the blok that owns it | yes |
| 4 | The capability rotator — five tabs, 5s cycle, sweep indicator | no (its copy is claims) |
| 5 | The provider comparison — two columns | yes (the table) |
| 6 | Ask-AI chips, through the existing `lib/landing/handoff.ts` | no |

The hero is untouched. EPIC-016 drafted five headlines and shipped one; that work is not reopened.

## What is deliberately not built

- **The trust-logo row.** NORTHWIND, OAKLINE, MERIDIAN AI, CASTELL, BLUEPRINT are invented, and
  `claims.test.ts` denylists `trusted by` / `used by` for exactly this. A row of fake customer logos
  is the one element labelling cannot rescue: its whole function is to assert that named companies
  are customers.
- **The three proof counters** — *1,240,000 decompiled*, *38% contain a contradiction*, *4s to roll
  back*. Replaced by three true statements from the claims registry. A counter's entire rhetorical
  content is *this is a real measurement*; an `Example` marker on one is a contradiction in terms,
  where the same marker on a screenshot of a table is simply honest. **This is the one place the
  plan departs from a literal reading of the ruling, it is called out in the epic's Out of scope,
  and it is a one-line change to that section if Soroush wants the counters anyway.**
- **The lessons teaser.** No lessons, and `lessons?` is denylisted.

## Order of work

1. `<Example>` component + `textOf` exclusion + **the control test**. The guard first, so every
   section after it is built against a rule that already bites.
2. The three static illustrative surfaces (shot, attribution, provider table). No motion yet.
3. The rotator and the run demo — the two that move.
4. Motion, and `prefers-reduced-motion` end states for all of it.
5. Claims registry entries for every factual sentence; Ask-AI chips.

## Decisions taken before writing code

1. **Motion budget: where it lives decides the Lighthouse number.** The mockup's five motion
   effects are inline script in a static file. This codebase server-renders and has kept
   `ThemeToggle` as the only client component on the public site. EPIC-072 measured 17 routes with
   a lowest score of 94, and the home page must not be what drops it. So: CSS-only where possible
   (the rotator's sweep, the reveal), one small client component where it is not (the run demo's
   sequence), and **the report states what hydrates and what the number was before and after.**
2. **`prefers-reduced-motion` shows end states, never skips them.** The mockup gets this wrong for
   the hero and the logo; `docs/design/README.md` corrects it. Under reduced motion the rotator
   renders a panel, the meters render filled, the rows render landed.
3. **The rotator's fifth tab is "Deliver", not "Learn".** There are no lessons and the word is
   denylisted.
4. **Real ARIA tabs for the rotator**, per `docs/design/README.md`'s accessibility corrections —
   not the mockup's `aria-selected` on plain buttons.

## Risks

- **Lighthouse.** The one number this page can lose. Measured before and after, not assumed.
- **The visual baselines are on this page.** `landing.spec.ts`'s two `-linux.png` snapshots cover
  `/`, so unlike the last two epics these **will** move and must be regenerated in
  `mcr.microsoft.com/playwright:v1.63.0-noble`. That is expected work, not a failure.
- **`page.test.tsx` guards the home page** against customer counts and fabricated proof. It should
  stay green throughout; if it fires, the page is wrong, not the test.
