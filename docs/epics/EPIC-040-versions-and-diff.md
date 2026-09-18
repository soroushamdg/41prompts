<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: Apache-2.0
-->

# EPIC-040: versions and semantic diff
Stage: 4 · Depends on: EPIC-030, EPIC-032 · Size: M

**Written by Claude Code in the advisor's chair**, 2026-09-16, under `docs/PROCESS.md`'s amendment of
2026-09-15. The Goal, Tasks, Tests and Review lines below are `docs/roadmap.md`'s, unchanged;
everything else is this file's reading of them.

Unblocked by **GATE 3**, decided 2026-09-16: *Go for Stage 4, no loud launch*
(`docs/decisions/GATE-3.md`).

## Goal
A version is a snapshot of the blok set, and a diff between two versions says what a person
changed rather than which bytes moved.

## Scope

- **`prompt_versions`**: an immutable snapshot of a prompt's blok set, its compiled text and hash,
  a note, and the run that most recently graded it.
- **`diff(a, b)` in `packages/core`** → added, removed, changed, moved, and a compiled byte delta.
  Pure, deterministic, zero-dependency, like everything else in that package.
- **A version is minted on save and pinned before a run** — the two moments `docs/roadmap.md` names.
- **Pass rate per version**, answered from `suite_runs` and `suite_results` by joining, not by a
  column that can disagree with them.

## Out of scope

- **The Versions page. That is EPIC-041** — history, restore, A/B. This epic ships no route and no
  component, and its report says so in its own numbered section rather than leaving an unticked box.
- **Publishing, Live, and the Draft/Live pointer.** ADR-003's `Draft vN` / `Live vN` vocabulary is
  honoured by this epic's naming, but nothing here publishes anything; that is EPIC-050 and
  EPIC-051.
- **Restore.** EPIC-041. This epic must not make it hard, and must not build it.
- **The build artifact.** EPIC-050, and `packages/core/src/artifact/schema.ts` is on `CLAUDE.md`'s
  never-touch list once Stage 5a begins. It has not begun; this epic still does not touch it.

## The question this epic exists to answer well

**When is a version minted?**

`docs/roadmap.md` says *"version on save and before run"*, and taken literally the first half is
unusable. `apps/web/app/app/pr/[promptId]/blok-editor.tsx` autosaves on a debounce, so a paragraph
typed into one blok is a dozen saves. A dozen versions per paragraph is a history nobody can read,
and EPIC-041's whole value is that somebody reads it.

The answer this epic takes, and the acceptance criteria below are written against it:

1. **Nothing is written when nothing changed.** A save whose resulting blok-set hash equals the
   newest version's hash mints no row at all. This is free, it is exact, and it removes most of the
   volume on its own — a debounce tick that lands on identical text is common.
2. **The newest version is rewritten in place until something pins it.** Editing is one episode, not
   one row per keystroke pause. The newest version of a prompt is its open `Draft vN` and it absorbs
   further edits.
3. **A run pins the version it ran.** From that moment the row is immutable and the next save mints
   `Draft v(N+1)`. This is the property EPIC-041's A/B and EPIC-050's artifact both need, and it
   arrives without a timer, a background job or an arbitrary quiet window.

The result is **one version per episode of editing between runs**, which is the granularity a person
actually reasons in.

## Acceptance criteria

- [ ] **`prompt_versions` exists** with: prompt, ordinal `n` (the `N` in `Draft vN`), the blok-set
      snapshot, compiled text, compiled hash, note, `pinnedAt`, timestamps. Verified by the
      migration and by `packages/db`'s own tests.
- [ ] **A save that changes nothing writes nothing.** Two identical saves in a row leave one
      version row with one `updatedAt`. Verified by a test in `packages/db`.
- [ ] **A save that changes something rewrites the open draft**, and does not increment `n`.
      Verified by a test.
- [ ] **Triggering a run pins the version**, and the next save after it mints `n + 1`. Verified by a
      test in `apps/web` or `packages/db`, whichever owns the trigger path.
- [ ] **`diff(a, b)` classifies added, removed, changed and moved**, and returns the compiled byte
      delta. Fixtures per change type in `packages/core`.
- [ ] **A moved blok is reported as moved, never as removed plus added.** This is `docs/roadmap.md`'s
      named test and it gets its own fixture.
- [ ] **Pass rate per version is derived, not stored.** A query over `suite_runs` and
      `suite_results`; asserted by a test that changes a result and sees the rate follow without a
      write to `prompt_versions`.
- [ ] **Snapshot size at 100 bloks × 50 versions is measured and written into the report** — the
      roadmap's Review line asks whether it is acceptable, which cannot be answered without a number.
- [ ] **Vocabulary**: `Draft vN`, never "current", "unsaved" or "latest" as a state name (ADR-003).
      `pnpm forbidden-words` passes, and any user-visible string added here uses those words.
- [ ] `node scripts/gate-run.mjs` green on the commit before it merges.

## Verification

```
pnpm test                       # core diff fixtures, db version tests
pnpm typecheck
pnpm lint
node scripts/gate-run.mjs       # CI parity, on the commit
```

## Notes for the implementer

**1. Match bloks by id, then decide moved versus changed.** A blok's `id` is stable across edits, so
identity is not a guess. `moved` is "same id, same text, different position among its siblings";
`changed` is "same id, different text". A diff that matched on text would report a moved blok as a
removal and an addition, which is exactly the failure the roadmap's test names.

**2. `rank` is a fractional index, so position is relative.** `packages/db/src/rank.ts` mints
lexicographic keys; two versions' ranks are not comparable as numbers and a blok's rank can change
without its position changing, or the reverse. Compare **ordinal position in the sorted list**, not
the rank string.

**3. The snapshot stores verbatim text** (`CLAUDE.md` rule 3), including `editedText` and
`editedFromHash`. A version that dropped the hand edits would restore a prompt into a state the
person never had.

**4. `suite_runs` already freezes `promptHash` and `promptText` at trigger time**, and `suite_checks`
freezes the checks. This epic does not duplicate that — it gives the frozen thing a **name** and a
place in history, and the run points at the version.

**5. `packages/core` has zero dependencies, no DOM and no IO.** `diff()` takes two snapshots as plain
data and returns plain data. Nothing in it reads a database.

**6. There is no browser drive for this epic** unless the run-trigger change turns out to be
user-visible. Say which in the report, in its own numbered section, the way EPIC-030's report §11
does. Do not leave an unticked box that reads like an omission, and do not claim a drive that did
not happen.
