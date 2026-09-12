# EPIC-020: Blok model and per-blok compiler
Stage: 2 · Depends on: EPIC-011b · Size: M

## Goal
Bloks become editable objects that compile into one prompt, per blok, deterministically, cached by content hash.
Changing one blok changes exactly one span of the output. A span can be edited by hand, and the product knows the
difference between "this span is what the blok compiles to" and "a person changed this and the blok has moved on".

## Why this is the hardest epic left
Everything in Stage 1 was read-only: text in, findings out, nothing to keep consistent. This epic introduces two
representations of the same thing ; the blok set and the compiled prompt ; that must stay reconciled while a user
edits either one. Drift is not an edge case here; it is the normal state a few seconds after someone types. Get
the model wrong and every epic after this inherits it, including the frozen artifact format in EPIC-050.

## Decisions (do not re-litigate)
1. `packages/core`, pure, deterministic, zero dependencies (rules 1, 2, 11).
2. **The blok set is the source of truth.** The compiled prompt is derived. A hand-edited span is an exception the
   model records, never a second source of truth that has to be merged back.
3. `compile(bloks: Blok[], options): Compiled` where
   `Compiled = { text: string; spans: Span[] }` and
   `Span = { blokId: string; start: number; end: number; hash: string; state: "compiled" | "edited by hand" }`.
   Offsets are UTF-16 code units into `text`, same convention as EPIC-010, and the spans tile `text` exactly with
   no gaps and no overlaps ; asserted as an invariant.
4. **Per-blok compilation with content-hash caching** (rule 4). `hash` is over the blok's verbatim text, its kind
   and the compiler version. Recompiling with one blok changed touches exactly one span; a test proves the other
   spans are byte-identical and their hashes unchanged.
5. **The compiler never paraphrases** (rule 3). A blok's text is emitted verbatim. What the compiler decides is
   ordering, separators, and the rendering of structure ; never wording. A summary never reaches the output; the
   placeholder test from EPIC-011b becomes a real one here.
6. **Expected bloks emit no text.** They compile to checks, which this epic models as a typed list on `Compiled`
   but does not execute. A prompt whose bloks are all `expected` compiles to an empty string and a list of checks,
   and that is correct, not an error.
7. **Edit by hand**: `editSpan(compiled, blokId, newText)` returns a new `Compiled` where that span's `state` is
   `"edited by hand"`. The span keeps the hash it was compiled from, so the product can tell whether the blok has
   changed since. Two different things must be distinguishable: the span differs from the blok's compiled output,
   and the blok itself has changed since the edit.
8. **Update from blok**: `updateFromBlok(compiled, blokId)` recompiles that one span and returns it to
   `"compiled"`. Nothing else moves. This is the only way back; there is no merge.
9. **Drift is a query, not a state machine.** `drift(compiled, bloks): DriftReport` compares hashes and reports
   which spans are stale. No background process, no invalidation events, no subscriptions. A pure function called
   when the UI needs to know.
10. Ordering is explicit and stored on the blok set, not implied by array position in a database row. Reordering
    bloks changes the compiled text and every affected span's offsets, and nothing else.
11. Vocabulary (ADR-003): `Draft`, `Live`, `edited by hand`, `update from blok`. Never "override", "reconcile",
    "drifted", "promote".

## Scope
- `packages/core/src/compile/`: `compile.ts`, `types.ts`, the span-tiling invariant, the hash function, the
  compiler version constant, `edit-span.ts`, `update-from-blok.ts`, `drift.ts`, a `README.md` explaining the two
  representations and why the blok set wins.
- Blok model extensions needed to compile: stable id, kind, verbatim text, order. Persisted shape for EPIC-021a to
  read, but no database work here beyond the schema types; the Drizzle tables land in EPIC-021a.
- Artifact schema v0 in `packages/core/src/artifact/schema.ts`, marked explicitly as **not frozen until Stage 5a**
  and carrying a version field from the first line.
- Fixtures: a five-blok prompt with a committed compiled snapshot; a multi-range blok compiling into one span; a
  prompt of only `expected` bloks; a prompt with one hand-edited span; a reorder fixture. Property tests for the
  tiling invariant and for one-blok-changes-one-span over generated blok sets.

## Out of scope
- Any UI, canvas, or compiled pane. (EPIC-021a, EPIC-021b.)
- Database tables, CRUD, projects. (EPIC-021a.)
- Variables and `{{placeholder}}` extraction. (EPIC-022.)
- Executing checks. (EPIC-030.)
- Versions, diffing, history. (EPIC-040.)
- Publishing, Live, the CDN. (Stage 5a.)

## Acceptance criteria
- [ ] `compile`, `editSpan`, `updateFromBlok`, `drift` and their types exported from `packages/core`; zero new
      dependencies. Evidence: `package.json` diff.
- [ ] Spans tile the compiled text exactly ; no gaps, no overlaps, first starts at 0, last ends at `text.length` ;
      over every fixture and 1,000 generated blok sets. Evidence: test name.
- [ ] Changing one blok's text recompiles exactly one span: every other span is byte-identical and keeps its hash.
      Evidence: test name and the fixture diff.
- [ ] Reordering bloks changes offsets and nothing else: the same spans, same hashes, new positions. Evidence:
      test name.
- [ ] A hand-edited span reports `state: "edited by hand"`, and the product can distinguish "this span differs
      from what the blok compiles to" from "the blok changed after the edit". Evidence: two test names.
- [ ] `updateFromBlok` returns exactly that span to `"compiled"` and touches nothing else. Evidence: test name.
- [ ] `drift` is pure: 100 calls on the same input return identical reports, and it reads no clock, no global and
      no IO. Evidence: test name.
- [ ] A prompt of only `expected` bloks compiles to an empty string plus a list of checks, without throwing.
      Evidence: fixture and snapshot.
- [ ] No summary text appears in any compiled output; the EPIC-011b placeholder test is now real and fails if a
      summary is emitted. Evidence: test name.
- [ ] The compiler emits blok text verbatim: a property test over generated bloks asserts every blok's text
      appears in the output unmodified. Evidence: test name.
- [ ] `schema.ts` carries a version field and a comment saying it is not frozen until Stage 5a. Evidence: the file.
- [ ] Determinism: 100 compiles of the same blok set produce byte-identical output including hashes. Evidence:
      test name.
- [ ] 200 bloks compile in under 50 ms, reported with headroom. Evidence: timing.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm compliance`, `pnpm binary-files` clean.
- [ ] Report and session log written; backlog updated.

## Verification
```
pnpm --filter @41prompts/core test
pnpm compliance
```

## Notes for the implementer
- Write the tiling invariant before the compiler, as the false-merge fixture came before the merge rule. It is the
  property that every later epic silently depends on.
- The distinction in criterion 5 is the one to get right and the easiest to blur: "the span no longer matches the
  blok" and "the blok changed since someone edited this span" are different facts and the UI shows different
  things for each. If your model cannot express both, the model is wrong.
- `docs/design/41prompts-full-mockup.html` shows the compiled pane and its states; take the behaviour, and note
  in the report anywhere the mockup implies something this model cannot represent.
- Resist adding a state machine. Drift is derived from hashes on demand; the moment it becomes stored state, two
  things can disagree about it.
- If a decision here cannot be made deterministic, write `docs/epics/BLOCKER-EPIC-020.md` and stop.
