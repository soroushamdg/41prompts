<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# Plan — EPIC-016c: The rotator, as the mockup draws it

Written 2026-09-21, against `docs/epics/EPIC-016c-rotator-parity.md`, after reading the mockup's
rotator in all three of its layers — the CSS that fixes its geometry, the `R` array that holds its
content, and the IIFE that decides its behaviour.

## The decision that is not mine

**Reserved colour on the home page.** Two of the mockup's five illustrations paint `--pass` and
`--fail`. `landing.spec.ts` forbids all three reserved hues anywhere on `/`, and has since
EPIC-016.

The guard is broader than `CLAUDE.md` rule 10, which says those three hues mean pass, fail and
drift and nothing else may use them — here they mean pass and fail, so this is the rule's intended
use rather than an exception to it. But narrowing a guard is exactly how a guard stops guarding, so
it is not a thing to do quietly on the way to something else.

| | If Soroush says **narrow the guard** | If Soroush says **keep it monochrome** |
|---|---|---|
| The Test panel | `badge-pass` ×2, `badge-fail` ×1, a `--fail` meter | ink badges, ink meter, the figures doing the work |
| The Publish panel | a stopped `deploy-row-fail`, a passing `deploy-row-pass` | ink rows, ✓/✕ glyphs doing the work |
| The guard | `no reserved colour **outside** a marked example`, plus a control proving one outside still fails | unchanged |
| Fidelity | matches the mockup | matches the mockup's layout, not its colour |

**Everything else in this epic is identical either way**, so this does not block starting — steps 1
to 4 of the order of work below are colour-free and the illustrations are step 5.

**The recommendation is to narrow it.** Rule 10's sentence is about meaning, and these two panels
mean exactly what the hues mean. "Pass/fail is never shown by colour alone" stays satisfied: every
badge carries its figure and every gate row carries its glyph and its words.

## What is being changed, in one paragraph each

**Behaviour.** Two edits to `capability-rotator.tsx`. The `takenOver` state goes away and the click
handler restarts the timer instead of killing it; hover and focus keep pausing it. An
`IntersectionObserver` at threshold `0.2` gates the timer on visibility — intersecting starts it if
it is not running, leaving stops it, and neither resets the index. Both are the mockup's, with the
pause kept because the mockup has no pause and WCAG 2.2.2 wants one.

**Copy.** Four headings become the mockup's verbatim. The Test panel's claims move from
`expected-bloks-are-checks` + `judge-pinned` to `expected-bloks-are-checks` + `every-run-recorded`,
which is what the mockup's paragraph for that panel actually says.

**Illustrations.** Five, each two elements, each inside an `<Example>` with its own caption. **They
are assembled from components that already exist** — `.blok-card`, `.badge-*`, `.meter-track`,
`.deploy-row-*` — which is the single most important constraint in this epic: none of them needs
new CSS beyond layout, and an illustration built from the real component is a picture of the
product rather than a drawing of one.

**Motion.** The mockup staggers the panel's contents in with `.pop` at 90ms per item as a panel
paints. CSS animation keyed off the panel, resting style as the end state, as everything else on
this page. Under reduced motion it is complete and in place, not absent.

## What the mockup decided that this deliberately does not take

Each of these is the prototype being wrong rather than the build being behind, and each already has
a document saying so. They are listed here because "same as the mockup" is the instruction, and
these are the four places that instruction is not followed.

1. **"Learn by breaking things", and nine lessons.** None exist; `lessons?` is denylisted with a
   control; Stage 7 owns them. Deliver stays.
2. **A tablist with no tabs in it.** `docs/design/README.md` lists real ARIA tabs among the
   prototypes' errors.
3. **A reduced-motion sweep that shows nothing.** `animation: none` over a `width: 0` base is a
   skip, and `docs/design/README.md` says reduced motion shows the end state. Ours stays full.
4. **"Assertions", and `data-k="format"` / `data-k="role"`.** ADR-003 forbids the first;
   `plan-mockup-parity.md`'s own notes warn that the second pair are the decompiler's classifier
   labels and not blok kinds.

## Order of work

1. **Behaviour first**, because it is small, it is testable without any of the rest, and it is the
   half that can be shipped if the colour question takes time to answer. Restart-on-click, then the
   visibility gate, each with its e2e test.
2. **Headings and the claims re-pairing.** Pure copy; `page.test.tsx` and `claims.test.ts` cover it.
3. **The Deliver illustration**, which is the one the mockup does not hand us and therefore the one
   to design first rather than last.
4. **The four ported illustrations**, colour-free parts first.
5. **Colour**, once ruled: either the two panels take `--pass`/`--fail` and `landing.spec.ts`'s
   guard is narrowed **with its positive control in the same commit**, or they stay ink.
6. **Motion**, and the reduced-motion end states for all five panels.
7. Then: baselines, drive, report, `gates.mjs ci`, merge.

## Risks, and the two that are near-certain

- **The visual baselines will move**, and this time there is no arguing about it: the panel gains
  content in every state. That is the Docker container procedure again — `COPYFILE_DISABLE=1` on
  both sides of the `tar`, `find /repo -name "._*" -delete` inside, and the throwaway Postgres
  reached by its **bridge IP**, because `host.docker.internal` resolves to IPv6 in that image and
  will not reach a port published on IPv4. EPIC-016b's commit `547e946` has the whole recipe.
- **The panel's `min-height` is load-bearing.** The mockup fixes it at 280px so the page does not
  jump as tabs change. Five illustrations of different heights is exactly what that number is
  defending against, and the epic's Notes cap each at two elements for the same reason. Measure the
  tallest and the shortest at 1440px and at 390px, and say both in the report.
- **`page.test.tsx` counts figures.** It asserts four; it becomes nine. That count is deliberate —
  it is what would catch a marker being dropped — so it moves with a reason, not with a `>=`.
- **Lighthouse.** Five illustrations is more DOM, not more JavaScript; the `IntersectionObserver` is
  a few lines inside a component that already hydrates. The number is measured either side anyway,
  and EPIC-016b's §2 already records that this instrument's spread on this machine is wider than
  changes of this size — so the report says that again rather than claiming a delta it cannot see.

## What this does not touch

The shot, the run demo, the attribution section, the provider comparison, the proof row, the hero
and the nav. EPIC-016b shipped all of them and none is reopened. The one thing outside the rotator
that moves is EPIC-016b's report §8 item 2 — `data-example="true"`, which nothing reads — because
it is two lines in a file this epic is already editing and a third epic for it would be silly.
