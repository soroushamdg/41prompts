# EPIC-030: core — checks and deterministic graders
Stage: 3 · Depends on: EPIC-020 · Size: M

**Written 2026-09-14 by Claude Code**, because Stage 3 has no epic files yet and `PROCESS.md` has the
advisor write them. Written from `docs/roadmap.md`'s EPIC-030 entry, ADR-003, and what EPIC-020
actually shipped — which turns out to matter, because the roadmap's version of this epic was drafted
before `Check` existed.

## Goal
An expected blok becomes a check that can be executed, and executing one against a model's output
produces a result that says pass, fail, or "nobody can tell yet" — never a guess dressed as an
answer.

## What EPIC-020 already built, so this epic does not rebuild it

Read before planning. All of this exists and is tested:

- **`CheckKind`, `CHECK_KINDS`, `CHECK_KIND_PHRASES`** — the eight, with a compile-time
  exhaustiveness guard that stops compiling if the type and the list disagree, and ADR-003's phrases
  verbatim.
- **`Check { id, blokId, text, kind? }`** — content-derived stable id, the owning blok, the blok's
  verbatim text, and the kind *when one can honestly be named*.
- **`checkKindFor(text)`** — derives the kind from `detect/rule-shapes.json`, the same committed map
  EPIC-012b's detector uses, and returns `undefined` when no shape matches.
- **`Compiled.checks`** — an expected blok emits no text and contributes a check.

`Check` is marked **provisional** in its own comment: *"EPIC-030 owns the real check model and may
narrow or replace this."* This epic is where that is settled.

## Scope
- `packages/core`: check **parameters** — the number behind a word limit, the list behind allowed
  values — derived from the blok's verbatim text, with derivation allowed to fail.
- `packages/core`: `grade(check, output)`, pure and deterministic, one grader per kind.
- `packages/core`: the result schema — per-check outcome, evidence, and a run-level summary that can
  express a partial pass without ambiguity.
- `packages/core`: the suggestion engine for expected text that matches no shape.
- Tests: five positive and five negative per grader, the Northwind derivation fixture, and the
  properties below.

## Out of scope
- **Calling a model.** EPIC-031 runs prompts; this epic grades a string somebody else obtained.
- **The judge.** Kindless checks are EPIC-033's work. This epic must make room for them and must not
  invent a ninth kind to cover them.
- **Any UI.** EPIC-032 shows results.
- **Persistence.** No schema, no migration. Results are values.

## Decisions (do not re-litigate)
1. **The eight kinds from ADR-003 and no others.** Not seven, not nine, not a `judge` kind sneaked in
   as a ninth. `CLAUDE.md` records what the last casual treatment of this list cost.
2. **`grade()` is pure and deterministic**: same check and same output, same result, forever. No
   clock, no randomness, no locale, no IO, no network, and no dependency — `packages/core` has zero
   dependencies and this does not change that.
3. **Three outcomes, not two, and the third is not a failure.** A check that cannot be graded
   deterministically is **not graded**; it is not a pass and it is not a fail. Reporting it as either
   is the ambiguity this epic exists to avoid — a fail blocks a publish for something nobody asserted,
   and a pass claims evidence that does not exist.
4. **A failure attributes to exactly one blok.** `Check.blokId` is single and non-optional, and stays
   that way. One expected blok may yield more than one check; a check never comes from more than one
   blok, and never from none.
5. **Evidence is a substring of the output or a stated fact about it, never a paraphrase.** The same
   rule the compiler lives under: the product does not put words in anybody's mouth.
6. **A pattern supplied by a person is not run naively.** `matches_pattern` executes text a user
   wrote; catastrophic backtracking would make `grade()` non-terminating, which breaks decision 2
   before it breaks anything else.
7. **Params derivation may fail, and failing is not an error.** "Reply in at most 80 words" yields a
   limit; "reply briefly" does not. The second is `not_graded`, not a crash and not a default.

## Acceptance criteria
- [ ] `grade()` is pure: called twice with the same arguments it returns deeply equal results, and
      `packages/core` still declares zero dependencies. Evidence: a property test and the existing
      boundary lint.
- [ ] Every one of the eight kinds has a grader, and adding a ninth `CheckKind` fails to compile
      until it has one. Evidence: the exhaustiveness construction and a test naming all eight.
- [ ] Five positive and five negative cases per grader. Evidence: test counts per kind.
- [ ] A check whose kind cannot be named, or whose params cannot be derived, grades as **not graded**
      — distinct from pass and from fail in the schema, not merely by convention. Evidence: test
      names, and a type that makes the three states exhaustive.
- [ ] A run summary distinguishes "everything passed" from "nothing could be checked". Evidence: a
      test asserting the two produce different summaries.
- [ ] Every result carries the `blokId` of exactly one blok, and that attribution survives a
      recompile. Evidence: two test names.
- [ ] `matches_pattern` terminates on a known catastrophic pattern within a bounded step count.
      Evidence: a test with a pattern that would hang a naive implementation.
- [ ] Evidence strings are substrings of the output or stated facts about it, never generated prose.
      Evidence: a test asserting each grader's evidence appears in its input or names a measurement.
- [ ] No internal identifier reaches a display string; phrases come from `CHECK_KIND_PHRASES`.
      Evidence: the forbidden-word grep and a test.
- [ ] `pnpm test`, `typecheck`, `lint`, `e2e`, `compliance`, `binary-files` clean.
- [ ] Report and session log written; backlog updated.

## Verification
`pnpm test && pnpm typecheck && pnpm lint`. **No browser drive**: this epic ships no route and no
component, so `PROCESS.md`'s drive rule has nothing to drive. Say so in the report rather than
leaving the criterion looking skipped.

## Notes for the implementer
- `checkKindFor` returning `undefined` is the load-bearing case, not the edge case. Design the result
  schema around it first and the eight graders second.
- The suggestion engine is for expected text that matches no shape. It suggests; it does not
  silently become a check.
- ADR-004 (artifact v0) already exists and `packages/core/src/artifact/schema.ts` is frozen once
  Stage 5a begins — not yet, but check whether a result shape wants to be artifact-compatible before
  inventing a second vocabulary for the same thing.
