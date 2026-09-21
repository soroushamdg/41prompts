<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# EPIC-016c: The rotator, as the mockup draws it

Stage: 1 · follow-on to EPIC-016b, 2026-09-21 · Depends on: EPIC-016b · Size: **M**

Sequence and rationale in `docs/epics/plan-mockup-parity.md`. Soroush, 2026-09-21, having read what
the mockup decided and what EPIC-016b departed from: **build it the same as the mockup.**

## Why this row

EPIC-016b shipped the capability rotator and departed from `docs/design/41prompts-full-mockup.html`
in four places. Three of those departures are still right and are restated as constraints below —
they are ADR-003 and `docs/design/README.md` correcting the prototype, which is what those documents
are for. **The other four are this epic**, and each is a thing the mockup decided that the build
simply does not do:

1. **The panels have no illustration.** The mockup gives each of the five an `x` field — two blok
   cards, three model badges, two gate rows — and EPIC-016b shipped heading-and-paragraph only. Its
   report §8 item 1 says so and calls it reversible. This is that reversal.
2. **Clicking a tab stops the cycle for good**; the mockup restarts it.
3. **The timer runs whether or not the rotator is on screen.** The mockup's `IntersectionObserver`
   starts the cycle when it scrolls into view and stops it when it leaves, so a reader who scrolls
   down slowly still arrives at *Import*. EPIC-016b's report does not mention this; it was found
   answering a question after the merge.
4. **Two of the five headings were rewritten**, and one of them drifted away from what its panel
   says. The mockup's *"Test it on every model"* sits over three model badges; the build's *"Say
   what it has to do, then check that it does"* sits over nothing and pairs with claims about
   judging. The mockup's own pairing is more coherent and is restored.

## The one thing this epic cannot do without a ruling — **ruled, 2026-09-21**

> **Soroush, 2026-09-21: narrow the guard.** The illustrations paint `--pass` and `--fail` as the
> mockup does, and `landing.spec.ts`'s guard becomes *no reserved colour outside a marked example*,
> with its positive control in the same commit. Scope 5 below is therefore built in full, not in its
> ink variant. The question as it was put is kept below, because the argument is what makes the
> narrowing readable to whoever finds it next.
>
> **What the narrowing then found.** The guard had never matched anything: it compared a hex token
> against a computed `rgb(…)`, on four routes, since EPIC-016. That is written up in
> `apps/web/e2e/reserved-colour.ts` and in the report's §4.

**The mockup's third and fourth panels use `--pass` and `--fail` directly** — `badge p`, `badge f`,
`<i style="background:var(--fail)">`, a `.gate no` row. `landing.spec.ts` has forbidden all three
reserved hues **anywhere** on `/` since EPIC-016.

That guard is broader than the rule it enforces. `CLAUDE.md` rule 10 says green, red and amber mean
pass, fail and drift and **nothing else may use them** — and in these two panels they mean pass and
fail. It is correct usage, not an exception. The guard was written for a page that had no product
data on it, and this epic is the first time that stops being true.

**The proposal, and it is the epic's headline decision**: narrow the guard to *no reserved colour
outside a marked example*, with a positive control proving a reserved colour **outside** one still
fails. If Soroush would rather the page stayed monochrome, the illustrations render in ink and
everything else in this epic is unchanged — say so and scope 5 below drops to its ink variant.

## Goal

The rotator is the mockup's rotator: five panels that each show the product at that step of the
loop, a cycle that restarts when a reader chooses a tab and runs only while the section is on
screen, and the mockup's own headings wherever ADR-003 allows them.

## Scope

1. **Restart the cycle on click**, as the mockup does — `clearTimeout`, paint, start again.
   **Hover and focus still pause it.** That is not the mockup's (it has no pause), and it stays:
   WCAG 2.2.2 wants a mechanism to stop content that auto-updates, and pausing while the pointer or
   the keyboard is on the thing is the least intrusive one. In practice a click leaves the pointer
   on the tab, so the cycle resumes when the reader moves away — which is the behaviour the mockup's
   restart was reaching for.

2. **Run the timer only while the rotator is on screen.** An `IntersectionObserver` at threshold
   `0.2`, matching the mockup: intersecting starts the cycle if it is not already running, leaving
   stops it. It does **not** reset the index — scrolling back resumes where it was, and a reader
   who has not reached the section yet always finds it on *Import*.

3. **The mockup's headings, where ADR-003 permits them.** Verbatim: *"Paste what you already
   have"*, *"Build it out of parts"*, *"Test it on every model"*, *"Ship it without shipping
   code"*. The fifth is *"Learn by breaking things"* and is out — see Out of scope — so **Deliver
   keeps a heading of its own**: *"Your application reads it at runtime"*.

4. **Re-pair the panels' claims to their headings.** *Test* takes `expected-bloks-are-checks` and
   `every-run-recorded`, which is what the mockup's own paragraph says — cost and latency captured
   on every run. The other four are unchanged.

5. **Five illustrations, built from the design system's real components, not from new CSS.** Every
   class the mockup reaches for already exists, which is both less work and more honest — the
   illustration is the product's own interface rather than a drawing of it:

   | Panel | The mockup's `x` | Built from |
   |---|---|---|
   | Import | two blok cards, one flagged `conflict` | `.blok-card` + `.badge-neutral` / `.badge-fail` |
   | Compose | two blok cards, Context and Example | `.blok-card[data-kind]` |
   | Test | three model badges, one failing, then a meter | `.badge-pass` / `.badge-fail`, `.meter-track` |
   | Publish | two gate rows, one stopped | `.deploy-row` with `-pass` / `-fail` |
   | Deliver | *invented; the mockup's fifth is Lessons* | a `resolve()` snippet and the version it answered with |

6. **Each panel's illustration is inside an `<Example>`.** They carry figures — `40/40`, `0.94`,
   `81.7%` — and EPIC-016b's whole mechanism is that a figure is only renderable if it is marked.
   Only one panel is visible at a time, so only one marker is ever on screen.

7. **The panel's own entrance**, which the mockup stages: `.pop` with a 90ms-per-item delay as a
   panel paints. CSS, with the resting style as the end state, as everything else on this page.

## Out of scope

- **The fifth tab is still "Deliver".** The mockup's is *"Learn by breaking things — nine lessons
  that run inside the product"*. There are none, Stage 7 owns them, and `lessons?` is on the
  denylist with its own control. This is not reopened.
- **The ARIA stays real.** The mockup has `role="tablist"` and nothing inside it — no `role="tab"`,
  no `aria-controls`, no roving `tabindex`. `docs/design/README.md` lists real ARIA tabs among the
  things the prototypes get wrong and the build must get right.
- **The reduced-motion sweep stays at its end state.** The mockup sets `animation: none` over a
  `width: 0` base, so under reduced motion it shows **no** indicator — a skip, not an end state,
  and the same error `docs/design/README.md` already corrects for the hero and the logo. Ours
  renders full and continues to.
- **The mockup's words where ADR-003 forbids them.** *"Assertions on Claude"* is **"Checks on
  Claude"**. `data-k="format"` and `data-k="role"` are the **decompiler's** classifier labels, not
  blok kinds; the cards use the six real kinds.
- **Anything outside the rotator.** The shot, the run demo, attribution, the provider comparison
  and the proof row are as EPIC-016b shipped them.

## Acceptance criteria

- [ ] Clicking or arrow-keying a tab selects it **and the cycle continues** once the pointer and
      focus leave. Evidence: test names.
- [ ] Hover and focus pause it, and it resumes on leave. Evidence: test names.
- [ ] The timer does not run while the rotator is off screen, and a reader who has not scrolled to
      it finds it on *Import*. Evidence: a test that scrolls away, waits past one cycle, scrolls
      back and asserts the selection did not move.
- [ ] Each of the five panels renders an illustration, marked `Example`, with a caption naming what
      it is a picture of. Evidence: test names plus one screenshot per panel.
- [ ] Every figure inside a panel is inside its marker — the numbers rule still passes with the
      mutation control still firing. Evidence: `page.test.tsx`.
- [ ] The four ported headings match the mockup verbatim. Evidence: test names.
- [ ] No panel says "assertion", "lessons", or names a decompiler classifier as a blok kind.
      Evidence: `pnpm forbidden-words`, `claims.test.ts`, and a test naming the six kinds.
- [ ] Under `prefers-reduced-motion` a panel's illustration renders **complete and in place** —
      no stagger, nothing at opacity 0. Evidence: one screenshot per panel plus test names.
- [ ] Reserved colour: either the guard is narrowed with its positive control, or the illustrations
      are ink. Whichever Soroush rules, the decision and its control are in the report.
- [ ] `/` does not scroll sideways at 390px and the panel does not grow a horizontal scrollbar.
      Evidence: `overflow.ts` plus a test.
- [ ] Lighthouse `/` unchanged within the instrument's own spread; accessibility 100. Evidence:
      `scripts/lighthouse-site.mjs`, and the report states the spread as EPIC-016b's §2 does.
- [ ] Axe clean in both themes. Evidence: the run.
- [ ] The two `/` Linux visual baselines regenerated — **they will move.** Evidence: the container
      run, in compare mode afterwards.
- [ ] All gates green per package; `node scripts/gates.mjs ci` green before merge.
- [ ] The built page driven by hand, both themes, 1440px and 390px, screenshots in the report.
- [ ] Report and session log written.

## Verification

`scripts/drive-epic-016c.mts`, against the **built** app, watched. It must: let the rotator cycle
unattended through at least two tabs; click one and confirm the cycle comes back once the pointer
leaves; scroll the rotator out of view, wait past a cycle, scroll back and confirm the selection
did not move; screenshot all five panels; then reload with reduced motion forced and screenshot all
five again.

## Notes for the implementer

- The mockup: CSS lines 310–323, markup 513–522, behaviour 1708–1750. The `R` array at 1712 holds
  the five panels' headings, paragraphs and illustration markup verbatim.
- **Read EPIC-016b's report §8 first.** Items 1 and 4 are this epic; item 2 (`data-example="true"`
  is read by nothing) is a two-line tidy that belongs here rather than in a third epic.
- The illustrations are the one place this epic can quietly grow. Each is **two elements**, as the
  mockup's are. A panel that becomes a third picture of a canvas is worse than the paragraph it
  replaced.
- If a criterion is impossible or contradicts a rule in `CLAUDE.md`, write
  `docs/epics/BLOCKER-EPIC-016c.md` and stop.
