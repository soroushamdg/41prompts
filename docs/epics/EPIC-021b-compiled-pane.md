# EPIC-021b: The compiled pane
Stage: 2 · Depends on: EPIC-021a · Size: M

## Goal
The other half of the editor: the compiled prompt, read-only by default, with every span linked to the blok that
owns it. A span can be edited by hand and brought back with "update from blok". The pane tells the user, without
them having to work it out, which spans no longer match their blok and which bloks have moved on since someone
edited them.

## Why this is the epic where the model becomes visible
EPIC-020 built a model that distinguishes four states; EPIC-021a stored them. This epic is where a person sees
them and has to understand them in a second, without a legend. If the pane blurs two of those states into one
sentence, the model's precision was wasted and the user will be confused at exactly the moment they are trying to
recover their work.

## Decisions (do not re-litigate)
1. **Read-only by default.** The compiled text is derived; editing it is the exception, entered deliberately. A
   user who clicks into the pane and types has chosen to edit by hand, and the pane says so at that moment, not
   afterwards.
2. **Bidirectional linking, matching EPIC-013's decompiler**: hover or focus a blok card and its span highlights
   with a leading marker; hover a span and its card surfaces. Selecting pins. Keyboard: tab, `Enter` pins,
   `Escape` unpins. Touch is the default interaction, not a degraded hover. Highlight is ink inversion, never a
   colour wash.
3. **Four states, four sentences.** The model gives `differs` and `changed` as independent booleans plus the
   span's `state`. The pane must express all four reachable combinations distinctly (EPIC-020's report §8 has the
   table). In particular, "you edited this and the blok is unchanged" and "you edited this and the blok has
   changed since" are different situations with different next actions, and the mockup drew only one of them ;
   `docs/epics/notes-EPIC-021b.md` §2. Write the four sentences, put them in the report, and expect me to rule on
   the wording.
4. **Amber is drift and only drift** (rule 10). A span whose blok has changed since the edit is drift and may use
   amber; a hand-edited span whose blok is unchanged is not drift and may not. Neither state is ever carried by
   colour alone.
5. **"Update from blok" is per span, never global.** No "update all", no bulk reconcile. Each one is a separate
   decision because each one discards something a person wrote.
6. **Adding a blok to a prompt with hand-edited spans**: `notes-EPIC-021b.md` §1 recommends Candidate A, and
   EPIC-021a already implemented the structural version ; the hand edit lives on the blok row, so an insert
   cannot reach it. Confirm that holds from the pane's side, keep the named test, and say in the report whether
   the pane needs anything beyond what the row already gives it.
7. **Undo covers "update from blok"** for the length of the session, for the same reason delete is undoable in
   EPIC-021a: it destroys writing.
8. **Copy the compiled prompt** is a first-class action, because the whole point is that this text goes somewhere
   else. One control, copies exactly what the model would receive, byte for byte including the blank-line
   separators EPIC-020 settled on.
9. Layout follows EPIC-013: side by side above `md`, stacked below, source map reachable by scrolling rather than
   hidden behind a tab. Same accessibility bar throughout.
10. Vocabulary: span, compiled, edited by hand, update from blok, Draft. Never override, reconcile, drifted,
    promote, sync.

## Scope
- `apps/web`: the compiled pane on `/app/pr/<promptId>`, span rendering with per-span state, hover and focus
  linking in both directions, pin and unpin, hand editing, update from blok with undo, copy.
- `packages/ui`: whatever the pane needs; the four state treatments as components, not inline styles.
- Offset-to-DOM mapping for spans, with the same four text fixtures EPIC-013 used ; CRLF, tabs, emoji with
  combining characters, RTL ; asserting the highlighted characters are exactly the span.
- Tests: the four states each rendering their own sentence; update-from-blok returning one span and touching no
  other; undo restoring the hand edit; copy producing byte-identical text; the carried hand-edit survival test
  driven through the pane.

## Out of scope
- Variables. (EPIC-022.)
- Checks, runs, providers. (Stage 3.)
- Versions, history, diff, restore. (EPIC-040.)
- Publishing, Live, the CDN. (Stage 5a.)
- Importing a decompile into a project; still noted, still not built.
- Any "update all" or bulk operation.

## Acceptance criteria
- [ ] The pane renders the compiled prompt with one element per span, each carrying its blok id and state.
      Evidence: test name.
- [ ] Hover, focus and tap link in both directions; pinning survives pointer-away; `Escape` and a second tap
      unpin. Evidence: four test names.
- [ ] Offsets map correctly to the DOM for CRLF, tabs, emoji and RTL; the highlighted characters are exactly the
      span. Evidence: four fixtures.
- [ ] All four states render with distinct sentences, and a test fails if two states produce the same text.
      Evidence: test name and the four strings in the report.
- [ ] Amber appears only on the drift state; a test fails if a hand-edited-but-unchanged span carries amber.
      Evidence: test name.
- [ ] No state is conveyed by colour alone; each has text. Evidence: test name.
- [ ] Editing a span marks it edited by hand at the moment of editing, and the text is stored verbatim ; no
      trimming, no normalisation. Evidence: two test names.
- [ ] "Update from blok" returns exactly that span to compiled and touches no other span; undo restores the hand
      edit including its retained hash. Evidence: two test names.
- [ ] The carried requirement holds through the UI: a hand edit survives adding an unrelated blok, driven through
      the pane rather than the model. Evidence: e2e test name.
- [ ] Copy produces byte-identical text to what the model would receive, including separators. Evidence: test
      name comparing against `compile()` output.
- [ ] Axe clean in both themes; full keyboard operation; 44px targets; reduced-motion end states. Evidence: four
      test names.
- [ ] Forbidden-word grep passes over every string on the route.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm e2e`, `pnpm compliance`, `pnpm binary-files` clean.
- [ ] Deployed to staging and driven by hand; screenshots of all four states in the report.
- [ ] Report and session log written; backlog updated.

## Notes for the implementer
- Write the four sentences before building anything. If two of them come out nearly identical, the states are not
  as distinct as the model claims and that is worth saying rather than papering over.
- Offset-to-DOM mapping went wrong twice in EPIC-013, in opposite directions. Build the four fixtures first.
- The mockup drew one banner where the model has two states; take the interaction, not the state count, and note
  in the report where you deviated.
- `docs/epics/notes-EPIC-021b.md` is the starting point for decisions 3 and 6; it was written by the epic that
  found the problems.
- If a criterion is impossible, write `docs/epics/BLOCKER-EPIC-021b.md` and stop.
