<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# Plan — EPIC-032a: Inputs by hand

Written 2026-09-19, before any code. `CLAUDE.md`: *plan first, stop and show the plan before
implementing.*

## Shape of the change

Nine files, one of them new to `packages/core`, **no migration**. The whole feature is a second
writer into a table that already stores what it needs.

| # | file | change |
|---|---|---|
| 1 | `packages/core/src/inputs/by-hand.ts` | **new.** `rowsFromGrid`, and `byHandProblems` — the row-count and size guards as pure functions, so the limit is logic with a test rather than an `if` in a component |
| 2 | `packages/core/src/inputs/by-hand.test.ts` | **new.** the limits, the empty-row rule, the trim rule |
| 3 | `packages/core/src/index.ts` | export the two |
| 4 | `apps/web/lib/runs/actions.ts` | `addInputSetByHandAction`, `updateInputSetAction`, `duplicateInputSetAction` |
| 5 | `apps/web/lib/runs/queries.ts` | `runsPageFor` also returns, per set, **how many runs reference it** |
| 6 | `packages/db/src/input-sets.ts` | `runCountsForInputSets` — one query for the list, not one per row |
| 7 | `apps/web/app/app/pr/[promptId]/runs/by-hand.tsx` | **new.** the grid |
| 8 | `apps/web/app/app/pr/[promptId]/runs/input-sets.tsx` | mount the grid, the Edit / Duplicate-and-edit branch, the empty-state sentence |
| 9 | `apps/web/e2e/runs-by-hand.spec.ts` | **new.** A1–A3, A6, A8, A9 |

Plus `apps/web/app/globals.css` (or wherever `runs-panel` lives) for the grid's styles, and
`apps/web/lib/runs/actions.test.ts` for A4, A5, A7.

## Order of work, and why this order

**Step 1 — the finding, asserted first.** Write the Playwright case for **A6** before the editor
exists: run a set, duplicate it, edit the copy, assert the original run's "By input" rows are
unchanged. It fails today for the boring reason that there is no editor — but it is the test that
stops the whole epic from introducing the defect, and writing it first is how it stays honest.
`EPIC-032`'s note 1 is the precedent: *write the test that fails on the old assembly before changing
it.*

**Step 2 — core, with its tests.** `CLAUDE.md` rule 1: logic that must be correct goes in
`packages/core`. The row-count limit, the "a row of all-empty cells is not a row" rule, and the byte
guard are each a decision with an off-by-one in it.

**Step 3 — the run count, in `packages/db`.** One query keyed by set id. Decision 3 turns on this
number and it must not be computed in the component.

**Step 4 — the actions.** Three, each following the file's four steps in order. `updateInputSetAction`
refuses a set with runs **in the action**, which is A5 — the disabled button is the courtesy, the
refusal is the guarantee.

**Step 5 — the grid.** Controlled React state, one column per declaration, `Add row` / `Remove row`,
a name field. No drag. No third-party grid.

**Step 6 — mount it, and fix the empty state.**

**Step 7 — the e2e spec**, then `pnpm e2e` whole, because EPIC-072 found that a change to one page's
chrome failed 17 assertions in three other spec files.

**Step 8 — gates, drive, report, session log.**

## Decisions I have already taken, and would take again

1. **`input`, not "test case"** — epic decision 1. The request's word is not the product's word, and
   this is the one place a session gets to prevent that drift cheaply.
2. **Columns derived from declarations, never typed** — epic decision 2. It deletes two of the three
   refusal paths rather than handling them.
3. **Edit an unrun set; duplicate a run one** — epic decision 3, and the finding in the epic file is
   the argument. Cheap, honest, no migration.
4. **No snapshot column on `suite_runs`** — the alternative fix, named and refused in the epic's Out
   of scope so the next person can find the reasoning rather than re-derive it.

## What I would ask about if you were not here

Nothing blocking. One thing worth your opinion rather than my default:

**Should the by-hand grid also be the way an uploaded CSV is corrected?** A file refused for a bad
column currently loses the whole upload. The grid could catch it — pre-fill from the parsed rows and
let the person fix the header by hand. It is genuinely useful and it is **not in this epic**, because
it turns a save surface into an import-repair surface and doubles the cases. Say the word and it
becomes EPIC-032b.

## Risks

- **`runs.spec.ts` and four sibling specs share the Runs page.** Any change to `runs-panel`'s markup
  can fail assertions belonging to other epics. Mitigation: run the whole `pnpm e2e`, not the new
  spec alone. EPIC-072's 17 failures are the precedent.
- **The grid is a client component inside a server-rendered page.** The existing `InputSets` is
  already `"use client"`, so this adds no new boundary — but the run counts must arrive as props from
  the server, never be fetched from the client.
- **Size.** Called **S**. If step 5's keyboard behaviour turns out to need a roving tabindex rather
  than plain inputs, it is an M, and the epic file gets a Size section saying so the way EPIC-900's
  did.

## Definition of Done for this epic

The twelve criteria in the epic file, `node scripts/gates.mjs ci` green on the commit, the feature
driven by hand against the built app with screenshots, a report, a session log, and — per
`docs/AUTONOMOUS.md` — every decision taken without asking appended to
`docs/decisions/AUTONOMOUS.md`.

**Not** a backlog row, a roadmap edit, or a push. `CLAUDE.md`'s never-touch list and "Nothing is
pushed".
