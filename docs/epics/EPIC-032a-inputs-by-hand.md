<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# EPIC-032a: Inputs by hand — the half of EPIC-032's task line that was narrowed away

Stage: 3 (carried) · Depends on: 032 · Size: **S**

**Asked for by Soroush on 2026-09-19**, in these words: *"sometimes it is more convenient to set
inputs inside the platform if they are not much instead of uploading a csv."* Written by Claude Code
in the advisor's chair, under `docs/PROCESS.md`'s amendment of 2026-09-15.

## Goal

A person with three inputs in their head can type them into the Runs page and run them, without
opening a spreadsheet, saving a file, and finding it in a file picker.

## Why this row, and why it is not a new idea

`docs/roadmap.md`'s EPIC-032 task line has always read:

> **Tasks.** Input sets from CSV **and manual rows**; run trigger …

EPIC-032 shipped the CSV half and narrowed the other, deliberately and in writing — its Out of scope
says *"`docs/roadmap.md`'s task line says 'CSV **and manual rows**'; decision 1 says uploaded CSV.
The decision is the newer of the two and it wins. Deliberately narrowed, not forgotten."* Its report
§ repeats it. **This epic is that narrowing being lifted by the person who owns the decision**, not a
feature invented against the roadmap.

**EPIC-032 decision 1 survives intact**, and that matters more than it sounds. Its substance is not
the word *CSV* — it is *every refusal happens before anything is stored*: a column matching no
variable, and a required variable with no column, are both errors **at save time, not at run time**.
A typed grid honours that decision exactly as an upload does; it is the same `inputSetProblems` call
against the same declarations. What changes is where the header comes from, and the header is now
**derived** from the declared variables rather than read from a file — which makes two of the three
upload refusals structurally impossible rather than merely caught.

## The finding this epic turns on, found before a line was written

**A run does not snapshot the inputs it ran against.** `suite_runs` freezes `prompt_text` and
`prompt_hash` onto the row — the compiled prompt is pinned at trigger time, exactly as EPIC-032
decision 1's third consequence required — but for its inputs it stores only `input_set`, a foreign
key, and `runsPageFor`'s detail query reads the rows **live**:

```
apps/web/lib/runs/queries.ts:62   inputSetForPrompt(db, run.prompt, run.inputSet)
```

**So an in-place editor would silently rewrite the history of every past run against that set.** Open
a run from last week, switch to "By input", and you would be reading rows that run never saw, beside
a pass rate computed from rows that no longer exist. Nothing would error and nothing would look
wrong.

The codebase already knows this relationship is load-bearing in the other direction: `removeInputSet`
is a **soft** delete, and its comment says why — *"Soft, because a run in the history ran against
it."* Deletion is guarded. Editing is not, because until this epic there is no edit path at all.

**This is the whole reason the epic is not just "make the grid writable."**

## Decisions — settled here, do not re-litigate

**1. The product's word is `input`, and this epic does not introduce a second one.** The request said
"test case editor"; the Runs page already says *"each row is one input"*, the set is an **input set**,
and `MAX_INPUTS` is the limit. A second noun for a thing that has one is the drift ADR-003 exists to
stop, and ADR-003 does not have to list a word for the rule to apply. The surface says **"Add inputs
by hand"**. No UI string, no identifier and no test id says "test case".

**2. The columns are the declared variables, and are not typed by the person.** A grid whose columns
are derived cannot produce `unknown_column`, and cannot omit a required variable. The two refusals
that cost an upload its whole file become states the surface cannot reach. `inputSetProblems` is
still called on save — as the control, not as the mechanism — so the two paths cannot diverge.

**3. A set that has never been run is editable in place. A set that has been run is not.** Instead
the action is **Duplicate and edit**, which copies the rows into a new set and leaves the original
exactly as every run against it recorded it. One code path decides this, from a count of
`suite_runs` rows referencing the set.

This is the honest fix and also the cheap one: it needs no snapshot column, no migration, and no
rewrite of how a run stores anything. Freezing rows onto `suite_runs` is the other answer and it is
**deliberately not taken here** — it is a schema change to a table that four pages read, for a
property this epic can buy with a disabled button.

**4. Editing does not silently rename.** A duplicated set is named from the original with a suffix,
shown in an editable field before it is saved, so two sets in the list are never distinguishable only
by their id.

**5. The empty state stops claiming a CSV is the only way in.** *"No inputs yet. Upload a CSV to run
this prompt against real cases."* becomes a sentence naming both paths. A surface that offers two
mechanisms and names one in its empty state teaches the wrong one.

**6. Keyboard and touch, per `CLAUDE.md` rule 12.** Every cell reachable by Tab, rows addable and
removable without a pointer, 44px touch targets on the row controls, and no drag as the only way to
do anything.

## Scope

1. **An "Add inputs by hand" surface on the Runs page**, beside the upload form rather than instead
   of it. One column per declared variable, derived; a row of empty cells to start; **Add row** and
   **Remove row**; a name field defaulting to something better than `inputs.csv`; **Save**.

2. **`addInputSetByHandAction`** in `apps/web/lib/runs/actions.ts`, following the same four steps in
   the same order as every action in that file — resolve the session, scope by owner, validate,
   write — then `revalidatePath`. Validation is `inputSetProblems` against the declarations plus the
   row-count and byte limits `limits.ts` already states.

3. **The limits apply to a typed set too**, and are shown before they are hit. `MAX_INPUTS` is 100;
   a byte guard equivalent to `MAX_UPLOAD_BYTES` covers a person pasting a novel into a cell.

4. **Edit in place for an unrun set; Duplicate and edit for a run one.** Which of the two is offered
   is decided on the server from a count of runs referencing the set, never from anything the client
   sends.

5. **The empty state and the surrounding copy**, per decision 5.

6. **Tests**: the refusal cases in `apps/web`, the run-count branch in both directions, and a
   Playwright spec that types two rows, saves, runs them against the fake provider, and asserts the
   history row — plus a spec that proves an edited set cannot change a past run's inputs.

## Out of scope

- **Freezing input rows onto `suite_runs`.** Decision 3. It is the other answer to the same finding
  and it is a migration on a table four pages read. If it is ever wanted, this epic's disabled-edit
  branch is what it would delete, and the epic report says so in its own numbered section.
- **Editing a set's columns.** They are the declared variables; the place to change them is the
  Variables tab, which already exists.
- **CSV export of a typed set.** Nothing asks for it yet and a round trip nobody runs is a claim.
- **Anything on `/app/pr/[promptId]` (the canvas)** — this epic touches the Runs page only.
- **`docs/backlog.md` and `docs/roadmap.md`.** `CLAUDE.md`'s never-touch list. The roadmap's task
  line already covers this work and needs no edit; whether a row is added is Soroush's.

## Acceptance criteria

- [ ] **A1.** A prompt declaring one variable offers a by-hand grid with exactly one column, named
      for that variable. Two variables give two columns, in declaration order. Verified: Playwright.
- [ ] **A2.** Typing two rows and saving creates an input set listed with `2 inputs` and the right
      column names, with no page reload. Verified: Playwright, and no `location.reload` in the suite.
- [ ] **A3.** The saved set runs, and the run's results bind the typed values — the fake provider
      echoes the last line, so the assertion is on the bound value, not on a status. Verified:
      Playwright against `FAKE_PROVIDER=1`.
- [ ] **A4.** A set with **no** runs offers **Edit**; the same set after one run offers **Duplicate
      and edit** and no Edit. Verified: unit test on the branch, both directions, plus Playwright.
- [ ] **A5.** Editing a set that has been run is refused **by the action**, not only hidden by the
      surface, with a message naming why. Verified: a test calling the action directly.
- [ ] **A6.** A past run's "By input" rows are unchanged after the set it ran against is duplicated
      and the copy edited. Verified: Playwright — this is the finding above, asserted.
- [ ] **A7.** 101 rows is refused naming the limit, and nothing is stored. Verified: unit test.
- [ ] **A8.** A prompt declaring no variables gets the existing explanation and **no grid**, the same
      way it gets no file input today. Verified: Playwright.
- [ ] **A9.** Every cell and control is reachable and operable by keyboard; row controls meet 44px on
      touch. Verified: Playwright keyboard walk, and the 390px viewport check `overflow.ts` already
      provides.
- [ ] **A10.** No UI string, identifier or test id says "test case". Verified: grep, in the report.
- [ ] **A11.** `node scripts/gates.mjs ci` green on the commit, all steps, with the closing "what a
      green here still does not cover" block read and answered.
- [ ] **A12.** The feature driven by hand in a browser against the **built** app, screenshotted into
      `docs/epics/reports/screenshots/EPIC-032a/`.

## Verification

```
pnpm test && pnpm typecheck && pnpm lint
pnpm --filter @41prompts/web exec playwright test e2e/runs-by-hand.spec.ts
pnpm forbidden-words
pnpm dead-code
node scripts/gates.mjs ci
```

## Notes for the implementer

- **`input_sets` needs no migration.** `columns` and `rows` are already `jsonb` and `row_count` is
  already derived at write time — `addInputSet(db, promptId, { name, columns, rows })` takes exactly
  what a typed grid produces. Confirm that before writing one; it is the reason this is an S.
- **Do not reload.** `PROCESS.md`'s rule and EPIC-032's note 2: `variables.spec.ts` and
  `compiled-pane.spec.ts` both had a helper ending in `page.reload()`, which is why no test could see
  BUG-022. Every write here goes through the action's `revalidatePath` and `router.refresh()`.
- **The fake provider echoes the last non-empty line of the compiled prompt**, which is what makes A3
  an assertion about binding rather than about a status code. `providerFor` in
  `apps/worker/src/runs/provider.ts` has the reasoning.
- **`removeInputSet` is soft and stays soft.** A duplicated set is a new row; the original is never
  touched.
- **Rule 10.** Nothing here is pass/fail, so nothing here is green, red or amber.
