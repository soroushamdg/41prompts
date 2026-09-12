# CURRENT

**EPIC-021a is the current epic.** A mirror of `docs/epics/EPIC-021a-canvas.md`; when the two
disagree, that file wins.

Stage: 2 · Depends on: EPIC-020, EPIC-003, EPIC-002 · Size: M

## Goal
A signed-in person creates a project, creates a prompt in it, and edits that prompt as a canvas of blok cards:
add, edit, reorder, delete. The bloks persist. This is the first epic where someone's work is stored and can be
lost, which changes what "correct" means.

## Why this one is different
Everything before this was derived from input the user still has. From here, the product holds the only copy of
something a person made. Two consequences run through the decisions below: nothing silently discards typing, and
every write is attributable to a user and scoped to their project.

## Decisions (do not re-litigate)
1. Data model in `packages/db`: `projects` (already stubbed in EPIC-002, filled in here), `prompts`, `bloks`.
   A blok row carries id, prompt id, kind, verbatim text, order, timestamps. Ids per `CLAUDE.md`: `proj_` + 4 hex,
   `pr_` + 8 hex; blok ids are **minted once and never recomputed** ; `blok_` + 16 hex ; and a blok imported
   from a decompile keeps the decompiler's content-derived id as its first value. (Amended 2026-09-12: as first
   written this said blok ids are the content-derived ids EPIC-011a produces, "stable across recompiles". They
   are stable across recompiles of the *same text*, which is what makes them right for a decompile and wrong for
   a row somebody edits: the id changes the moment the text does, orphaning the row's rank, its hand edit and its
   history on every keystroke. EPIC-020 settled the same question for `PromptBlok.id` and for the same reason.
   Minting once keeps what decision 1 was reaching for ; an id that survives a recompile ; without the id moving
   when a person types.)
2. **Ordering is an explicit column**, not array position and not a float that eventually collides. Use a
   fractional-index or an integer rank with a documented rebalance; whichever, reordering one card writes one row.
   Say which and why in the report.
3. **Every query is scoped by owner.** A prompt is reachable only through its project, and a project only by its
   owner. A test attempts to read another user's prompt by id and gets a 404, not a 403 ; the existence of the id
   is not disclosed.
4. **Autosave, not a save button.** Editing a blok's text writes after a debounce; the card shows saved state in
   words, never by colour alone (rule 10, and green is reserved regardless). A failed write is visible and the
   text stays in the field; it is never replaced by a stale server value.
5. **Carried from EPIC-020, and this epic's highest-risk requirement**: adding a blok to a prompt that has
   hand-edited spans must not silently discard the hand edit. The failure is invisible ; the pane recompiles, the
   text looks plausible, and someone's typing is gone. The named test is "a hand edit survives adding an unrelated
   blok". `docs/epics/notes-EPIC-021b.md` holds the two candidate resolutions; pick one, implement it, and say why
   in the report. EPIC-021b builds the pane, but the canvas is where a blok gets added, so the guarantee starts
   here.
6. **Blok category colour** (debt reassigned from EPIC-020, which had UI out of scope): the six kinds get their
   category colours in `packages/ui`, applied **only during interaction** ; hover, focus, selection ; never as a
   persistent tint (`docs/design/README.md`). The persistent distinction stays the ink marker and the kind's name
   as text, as EPIC-013 shipped. Green, red and amber remain reserved for pass, fail and drift and appear nowhere
   on this route.
7. Cards show: kind, the blok's text (editable), its summary with its source, and range count when greater than
   one. The canvas groups by kind with a source-order toggle, matching what EPIC-013 shipped for the decompiler.
8. **Deleting a blok asks once and is undoable for the length of the session**, because a blok is someone's
   writing. Undo restores order as well as text.
9. Server actions, not a REST API. Validation at the boundary; a blok's text is stored verbatim with no
   normalisation, no trimming, no CRLF conversion (EPIC-013's lesson).
10. `/app/projects`, `/app/p/<projectId>`, `/app/pr/<promptId>`. All under the app host, all behind auth, none
    indexable.
11. Vocabulary: blok, canvas, Draft. Never "block", "card type", "label".

## Scope
- `packages/db`: three tables plus migration; owner-scoped query helpers; a seed script.
- `apps/web`: project list and create; prompt list and create; the canvas route with add, edit, reorder, delete,
  undo; autosave with visible state; empty states from the illustration system.
- `packages/ui`: `BlokCard` gains editing, the interaction-only category colour, and the kind marker; whatever
  else the canvas needs, added there rather than inline.
- Tests: owner scoping, autosave including a failed write, reorder writing one row, delete and undo, the
  hand-edit survival test from decision 5, and a canvas of 60 bloks rendering and reordering without visible lag.

## Out of scope
- The compiled pane, span linking, drift display, update from blok. (EPIC-021b.)
- Variables. (EPIC-022.)
- Checks, runs, providers. (Stage 3.)
- Versions, history, diff. (EPIC-040.)
- Sharing a prompt with another user, teams, permissions beyond ownership. (Cut for v1.)
- Importing a decompile into a project. (EPIC-021b or later; note it, do not build it.)

## Acceptance criteria
- [ ] A signed-in user creates a project and a prompt, adds four bloks of different kinds, reorders them, edits
      one, deletes one, and undoes the delete; all of it persists across a reload. Evidence: one e2e test.
- [ ] Another user requesting that prompt by id gets 404. Evidence: test name.
- [ ] Reordering one card writes exactly one row; the ordering scheme and its rebalance are documented. Evidence:
      query log and the README section.
- [ ] Autosave: text survives a reload; a failed write shows a message and leaves the typed text in the field.
      Evidence: two test names, the second with the write rejected.
- [ ] **A hand edit survives adding an unrelated blok.** Evidence: the named test and the chosen resolution
      explained in the report.
- [ ] Blok text is stored byte-for-byte, including CRLF, tabs, emoji and RTL. Evidence: four fixtures round-tripped
      through the database.
- [ ] Category colour appears only on hover, focus or selection; a test fails if a card carries a category colour
      at rest. Evidence: test name.
- [ ] No green, red or amber token is used on any `/app` route in this epic. Evidence: the grep.
- [ ] A 60-blok canvas renders and reorders with no interaction slower than 100 ms. Evidence: timing.
- [ ] Axe clean in both themes; full keyboard operation including reorder; 44px targets; reduced-motion end
      states. Evidence: four test names.
- [ ] Forbidden-word grep passes over every string on these routes.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm e2e`, `pnpm compliance`, `pnpm binary-files` clean.
- [ ] Deployed to staging and driven by hand once; screenshots of the canvas at both viewports in the report.
- [ ] Report and session log written; backlog updated.

## Notes for the implementer
- Decision 5 is the one to build first and the one to write the test for before the feature. Everything else in
  this epic is recoverable; that one loses work.
- Keyboard reorder is a real requirement, not a checkbox: drag-and-drop that only works with a mouse fails rule 12.
  The ARIA pattern for a reorderable list is `aria-describedby` instructions plus arrow-key movement with a live
  region announcing the new position.
- `docs/design/41prompts-full-mockup.html` is the spec for the canvas, corrected by `docs/design/README.md` ;
  including the correction EPIC-020 added, that the mockups are the spec for the interface and not for the
  compiled string.
- If a criterion is impossible, write `docs/epics/BLOCKER-EPIC-021a.md` and stop.
