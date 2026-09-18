<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: Apache-2.0
-->

# EPIC-021b report — The compiled pane

Date: 2026-09-12 · Branch `epic/021b-compiled-pane`

---

## 1. The four state sentences

> *"Write the four state sentences before building anything and put them in the report; I will rule
> on the wording. If two come out nearly identical, say so."*

Written first, in commit `31f7de5`'s successor, before any pane code existed.

### The four

| # | `state` | differs | changed | badge | the sentence |
|---|---|---|---|---|---|
| 1 | compiled | no | no | — | *(nothing)* |
| 2 | edited by hand | yes | **no** | `edited by hand` | **You wrote this span. Update from blok replaces it with what the blok says.** |
| 3 | edited by hand | yes | **yes** | `edited by hand · blok changed` | **You wrote this span, and its blok has changed since. Update from blok replaces it with the blok's new wording; check the card first.** |
| 4 | compiled | yes | **yes** | `out of date` | **This span is what its blok said before it changed. Update from blok brings it up to date; nothing you wrote is lost, because you wrote none of it.** |

Each sentence ends by saying **what the button does to you**, because that is the only thing the
reader is actually deciding. The states differ in consequence, not just in fact.

### On whether 2 and 3 are too close — asked for, and answered honestly

They share a subject ("You wrote this span") because **that half is the same fact**, and saying it
differently would be a distinction where there is none. The second clause is where they part.

**The distinction is real, and here is the sharpest form of it.** In both, pressing *Update from
blok* destroys writing — that is not the difference. The difference is what you get back:

- **State 2:** what you get back is *exactly what you saw before you started typing*. You already
  know what you are trading for.
- **State 3:** what you get back is **something you have never seen** — the blok moved while your
  edit sat there. You should look at the card before pressing, and in state 2 you need not.

So the honest summary is: **the states are distinct but the gap is narrow, and it is narrow in a
specific way.** Same action, same destruction, different *result*.

**Ruled 2026-09-12: they stay separate**, with both sentences edited — *"the blok's new wording;
check the card first"* and *"nothing you wrote is lost, because you wrote none of it."* Soroush's
reason, which is a better statement of the gap than the one above: it is
**"you will get back what you already know" against "look before you press"**. The second clause of
each sentence now carries exactly that, and state 4 says outright why pressing it is free.

### A fifth cell that is deliberately silent

The model has **five** reachable cells, not four. The one the table above omits:

| `state` | differs | changed | |
|---|---|---|---|
| compiled | **no** | **yes** | the blok's *kind* changed and its text did not |

The span's hash is stale; its text is right. **It renders exactly like state 1 and says nothing**,
because there is nothing the reader can do about it and nothing they would lose by ignoring it. That
is a deliberate silence, not a missing sentence — `docs/epics/notes-EPIC-021b.md` §2 called it the
same way, and this is the one place the pane knowingly shows fewer states than the model holds.

It does mean the criterion "a test fails if two states produce the same text" is satisfied for the
four in the table and *deliberately violated* by this fifth cell, which produces the same output as
state 1. The test asserts the four are distinct and asserts this fifth one is silent on purpose.

### Colour

**Amber ⟺ `blokChangedSinceSpan`.** States 3 and 4 carry it; state 2 must not, because a hand edit
whose blok has not moved is not drift (decision 4, and rule 10). No state is carried by colour alone
— every one of them has the badge and the sentence above.

---

## 2. Acceptance criteria, with evidence

Finished 2026-09-14. Section 1 above was written on 2026-09-12 and is unchanged; everything below is
the rest of the epic, closed out under Soroush's ruling that 021b is finished properly rather than
having a report written around it.

- [x] **One element per span, each carrying its blok id and state.**
      `compiled-pane.spec.ts` › *renders one element per span, each carrying its blok id and state* —
      asserts `data-blok` matches `^blok_[0-9a-f]{16}$` and `data-presentation` on every span, and
      that an `expected` blok adds no span (EPIC-020 decision 6).
- [x] **Hover, focus and tap link in both directions; pinning survives pointer-away; `Escape` and a
      second tap unpin.** Four tests: *hovering a span surfaces its card*, *hovering a card
      highlights its span*, *pinning survives the pointer moving away*, *Escape and a second tap both
      unpin*.
- [x] **Offsets map correctly to the DOM for CRLF, tabs, emoji and RTL; the highlighted characters
      are exactly the span.** Two layers, because the criterion has two claims in it.
      **Model:** `lib/canvas/compiled-view.test.ts` › *offsets map to the DOM for every shape*, the
      four fixtures, plus *concatenating every piece rebuilds the whole prompt* and *holds when a
      blok's own text contains the separator*.
      **DOM, added 2026-09-14:** `compiled-pane.spec.ts` › *a pinned span of &lt;shape&gt; text
      highlights exactly its own characters*, ×4. This is the half that was missing: the model tests
      assert `piece.text`, which is a different claim from what a rendered, pinned element contains.
      EPIC-013 got offset mapping wrong twice in opposite directions and the model was right both
      times.
      **What the CRLF row does not cover, stated rather than implied.** A `<textarea>` normalises
      `\r\n` to `\n` in its value — measured, not assumed — so **raw CRLF cannot reach a blok through
      the UI at all.** That row exercises the multi-line shape and the separator boundary; a blok
      holding real CRLF arrives by import and is covered at the model level and by `toDisplayText`.
      A fixture named "CRLF" that silently tests LF would be exactly the over-claim this epic's notes
      warn about.
- [x] **All four states render with distinct sentences; a test fails if two produce the same text.**
      `compiled-view.test.ts` › *gives the four visible states four distinct sentences and four
      distinct badges*, and *says something for every state a reader can act on, and nothing for the
      ones they cannot*. The four strings are in §1. The fifth cell is deliberately silent and §1
      says why.
- [x] **Amber appears only on the drift state.** `compiled-view.test.ts` › *treats only the
      blok-has-changed states as drift*; `span-state.test.tsx` › *gives the drift class only to the
      two states where the blok has changed* and *agrees with isDriftPresentation, which is the
      single definition*. State 2 — hand-edited, blok unchanged — must not carry it, and a test fails
      if it does.
- [x] **No state is conveyed by colour alone.** `span-state.test.tsx` › *renders nothing at all for
      the in-step state* and *puts the action beside the sentence*; every visible state has a badge
      and a sentence.
- [x] **Editing marks the span edited by hand at the moment of editing; text stored verbatim.** Two
      tests: *marks the span edited by hand at the moment of the edit*, *stores the text verbatim — no
      trimming, no normalisation*.
- [x] **"Update from blok" returns exactly that span and touches no other; undo restores the hand
      edit including its retained hash.** Two tests: *returns exactly that span to compiled and
      touches no other*, *undo restores the hand edit*. Plus *offers no bulk update anywhere on the
      route* (decision 5).
- [x] **A hand edit survives adding an unrelated blok, driven through the pane.**
      `compiled-pane.spec.ts` › *a hand edit survives adding an unrelated blok*. Decision 6 holds
      from the pane's side with nothing extra: the hand edit lives on the blok row, so adding a blok
      is one INSERT that writes no other row. The pane needs nothing beyond what the row gives it.
- [x] **Copy produces byte-identical text, compared against `compile()`.** *copy produces exactly
      what the model would receive, separators included*. **Changed 2026-09-14**: it compared against
      a hardcoded `"…\n\n…\n\n"`, which asserts today's `BLOK_SEPARATOR` — a value that has already
      changed once (`compile@2`, 2026-09-12). It now calls `compile()` and compares to its output, as
      the criterion asks. A literal expectation is the same failure as a convenience reload, wearing
      different clothes.
- [x] **Axe clean in both themes; full keyboard operation; 44px targets; reduced-motion end states.**
      Four tests: *axe is clean on the pane in the light theme* / *…dark theme*, *every span is
      reachable and pinnable by keyboard alone*, *the pane's controls clear 44px on a phone*,
      *reduced motion shows end states rather than skipping them*.
- [x] **Forbidden-word grep passes.** `Forbidden-word grep clean (packages/ui/src, apps/web/app, apps/web/lib)`.
- [x] **`pnpm test`, `typecheck`, `lint`, `e2e`, `compliance`, `binary-files` clean.** §3.
- [~] **Deployed to staging and driven by hand; screenshots of all four states.** Driven, and the
      screenshots are in §4 — but **three states, not four.** State 4 is not reachable through the UI
      as the app is built, because the page recompiles every non-hand-edited span on each render.
      Split rather than ticked, because half of it genuinely happened and the other half describes a
      state the running product cannot be in. §4 has the mechanism and §6 the ruling it needs.
- [x] **Report and session log written; backlog updated.** This file,
      `docs/epics/sessions/EPIC-021b-session.md`, and the backlog row.

## 3. Verification

```
e2e        156 passed, 4 skipped, 0 failed   (against the BUILT app)
           compiled-pane.spec.ts alone: 22 passed (18 before; +4 DOM shape fixtures)
test       8 checked, 8 passed    (throwaway container, no PARTIAL)
typecheck  8 checked, 8 passed
lint       11 checked, 11 passed  (incl. dependency-cruiser, turbo boundaries, forbidden words)
```

## 4. The staging hand-drive

Driven 2026-09-14 on `app.staging.41prompts.ai` at `d4df9b7`, signed in through the magic-link
mechanism `PROCESS.md` now records. Screenshots in `docs/epics/reports/screenshots/EPIC-021b/`.

| what | result |
|---|---|
| four spans render for four bloks | **PASS** |
| state 2 reached: `data-presentation="edited"` | **PASS** |
| distinct presentations on one screen | **PASS** — `["in-step","edited","edited-changed","in-step"]` |
| every non-silent state carries words, not colour alone | **PASS** |
| `Copy prompt` present | **PASS** |
| update from blok returns that span to compiled | **PASS** |
| undo restores the hand edit | **PASS** |

`60-four-states.png` shows all three visible treatments at once: state 1 with no badge and no
sentence, state 2 with a grey `edited by hand` badge and its sentence, state 3 with an **amber**
`edited by hand · blok changed` badge, its own sentence and an amber left border. **Amber appears
exactly once on the page, on state 3** — decision 4 and rule 10, visible rather than asserted.

### The criterion says four states and I drove three. Here is why, and it is not a shortcut

**State 4 — "out of date": nobody typed here and the blok changed — is not reachable through the UI
as the app is currently built.** It is not a missing screenshot; it is a state the running product
cannot be in.

The model defines it as a *stored compiled span* whose text no longer matches its blok
(`compiledView(compile(OLD), movedBloks)` in `compiled-view.test.ts` › *4 · out of date*). But
`app/app/pr/[promptId]/page.tsx` calls `compiledForBloks(found.bloks)` on **every render**, so a span
nobody has hand-edited is always recompiled from the current blok text and is `in-step` by
construction. Only hand edits are persisted; there is no stored stale compiled span for a live prompt
to disagree with. The drive proves this rather than assuming it: changing blok 4's text under an
untouched span produced `in-step`, not `out-of-date`.

**So this half of the criterion is left unticked above rather than ticked on three-quarters of the
evidence.** State 4 is covered by `compiled-view.test.ts` at the model level, where it is
constructible, and it becomes reachable in the product when something stores a compiled artefact and
compares it against moved bloks — which is EPIC-040's versioning and EPIC-050's build artefact, not
this epic.

### Ruled, 2026-09-14: not a defect, and no machinery

**Soroush's ruling: the model expresses four states and the product reaches three, and that is
correct behaviour rather than a gap to close.** EPIC-020 modelled two genuinely different facts —
`differs` and `changed` as independent booleans — and the product currently exercises three of the
four combinations because recompiling on render is the right thing for a live editor to do. The
criterion is amended in `EPIC-021b-compiled-pane.md` to say so, this criterion stays **split**, and
the backlog row becomes `done` on that basis.

**No path to state 4 is to be built unless a later epic needs one.** It becomes reachable when
something stores a compiled artefact and compares it against moved bloks — EPIC-040's versioning and
EPIC-050's build artefact. Until then, building a way to reach it would be machinery whose only
purpose is to satisfy a screenshot.

## 5. What was already built, and what this session added

The pane itself shipped on 2026-09-12 and its behaviour was correct; what was missing was evidence
for four criteria and the two documents. Stated plainly because "finish the epic" and "write the
report" are different jobs and only one of them was outstanding for most of it:

- **Added:** the four DOM-level highlight-exactness fixtures, and the copy test's comparison against
  `compile()` instead of a literal.
- **Fixed on the way, as its own PR (#73):** BUG-021b-compiled-pane-stale — a blok's span rendered
  empty until the page was reloaded, hidden by a `page.reload()` in this file's own `addBlok` helper.
  Found by the helper audit, not by driving.
- **Unchanged:** every other criterion was already met by tests that existed; §2 names each one
  rather than asserting the set.


## 6. For the advisor

1. ~~**State 4 is unreachable in the product today.**~~ **Ruled 2026-09-14** — see §4. Not a defect,
   no machinery, criterion amended and split, row `done`.
2. **Two layout observations from the 2026-09-14 drive**, offered as observations and not defects:
   the `Edit by hand` buttons stack in a column under the compiled text with nothing tying each to
   its span, so which button belongs to which is not visible until a span is pinned; and the `example`
   span renders centre-aligned while its neighbours are left-aligned. Both are in
   `60-four-states.png`.
