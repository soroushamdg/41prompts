<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# EPIC-021a session log

Date: 2026-09-12 · Branch `epic/021a-canvas`

## Prompt sent

Commit `docs/epics/EPIC-021a-canvas.md` as-is, mirror to `CURRENT.md`, mark current in the backlog,
plan, implement, self-review, push, PR, squash-merge once CI is green. With one instruction ahead of
the rest:

> *"This is the first epic where the product holds the only copy of something a person wrote. Build
> decision 5 first and write its test before the feature: a hand edit surviving an unrelated blok
> being added. That failure is silent, and it is the only one in this epic that loses work rather
> than inconveniencing someone."*

Then, after the plan: all three named extensions accepted, extension 2 ruled **a correction to
decision 1 rather than a deviation** and to be recorded as an amendment in the epic file, and
*"structural over guarded is the better resolution and worth stating in the report as a general
preference: a bug with nowhere to live beats a test that catches it. Keep both tests anyway."*

## Plan summary

`docs/epics/plan-EPIC-021a.md`. Order of work as commit boundaries: the `keep` option and **its test
first**, then the schema, then the failing database version of the same test, then the feature.

## Decisions, and why

1. **Candidate A, with `keep` as a `Map<blokId, {text, hash}>`** rather than a previous `Compiled` —
   serialisable, so it survives a page load and rebuilds from rows, and it carries only the two
   things a hand edit is.
2. **The hand edit lives on the blok row.** One span per blok (EPIC-020's invariant), so adding a
   blok is one INSERT that writes no other row, and the failure has nowhere to live. Structural, as
   ruled.
3. **Fractional-index rank**, base 62, `COLLATE "C"` at every comparison site, rebalance at 32
   characters, driven in tests at 200 and 220 insertions.
4. **Minted blok ids**, per the amendment to decision 1, now written into the epic file in
   EPIC-012a's amendment format.
5. **Soft delete** for bloks, so undo is clearing a column rather than replaying from a client stack.
6. **Six category hues on interaction only**, guarded by reading the rule out of the stylesheet.
7. **Kind validated at the boundary**, with `context` as the read-back fallback rather than a throw.

## What took longer, or went differently

- **Three defects came out of the tests, not review**, and all three are in the report: undo could
  not restore a blok added in the same session; "Saved" lingered across a new edit and could make a
  test pass on a stale save; and the card was a `<button>` wrapping a `<textarea>`, which is
  `nested-interactive` and which screen readers genuinely mishandle. The first is the one that
  matters — it is a "your writing is gone" bug, and it was caught only because criterion 1 is one
  test rather than six.
- **The 60-blok budget was missed twice before it was measured properly.** 157 ms first (sixty
  textareas re-rendering on every reorder — fixed by memoising the editor), then 107 ms, at which
  point it became clear the measurement included Playwright's own click overhead. Measuring
  click-to-painted-frame inside the page gives 16–26 ms. Both numbers are logged so the margin is
  visible; this is a *more* correct measurement, not a softer one.
- **The e2e suite exhausted the magic-link rate limit** (15 per IP per five minutes) once it was run
  alongside the rest: nine sign-ins from this file alone, and the last two tests failed on a verify
  URL that never redirected — which reads as a canvas bug. One sign-in now serves the file via saved
  storage state. Reaching that hit a second trap worth writing down: `test.use({ storageState })`
  sets context options for the worker including the `browser.newContext()` inside the `beforeAll`
  that *creates* the file, and nesting the `use` one level deeper does not separate them. Writing an
  empty-but-valid state at module load does.
- **Three core tests were failing on timeout under a full parallel `pnpm test`, and this branch is
  what caused it.** Checked rather than called environmental: three parallel runs on the branch
  failed, two on the tree without it did not. Explicit timeouts, not widened budgets.

## Two process mistakes I made and corrected

1. **I committed eight commits straight to `main`** instead of branching first. Caught at the point
   of pushing; the commits were moved onto `epic/021a-canvas` and `main` was reset to `origin/main`.
   Nothing had been pushed.
2. **I committed nine screenshots that `capture.spec.ts` rewrites on every e2e run.** EPIC-016's
   report warns about exactly this and I ran into it anyway. Restored from `main` in its own commit.

## Verification tail

```
Tasks: 8 successful, 8 total       (pnpm test — core 475, web 219, db 58, ui 83, worker 57, …)
Tasks: 8 successful, 8 total       (pnpm typecheck)
Checked 451 files in 8 packages, no issues found
Forbidden-word grep clean
[mirror-dry-run] OK
No tracked source file under packages, apps is binary (417 checked)

133 passed (2.1m)                  (pnpm e2e)
60-blok canvas: first render 11 ms, reorder 16 ms click-to-paint
```

## Open

**The staging deploy and its screenshots are not done**, and the criterion is left unticked rather
than ticked on the intention. Staging deploys from `main`, so it happens after this merges; the
web image's entrypoint runs the migration before `next start`, so no manual work on the box is
needed. Sequence: merge → staging deploys → drive the canvas by hand at both viewports → land the
screenshots with the report's §7 filled in.

## Handoff

`CURRENT.md` points at EPIC-021a. `notes-EPIC-021b.md` still holds both carried requirements; the
`keep` option and the two blok columns added here are what that epic reads.
