<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# EPIC-032a — Inputs by hand

**Merged 2026-09-19.** Asked for by Soroush the same day, in these words: *"sometimes it is more
convenient to set inputs inside the platform if they are not much instead of uploading a csv."*

## 0. What shipped

The Runs page grows a grid beside the upload form. One column per declared variable, **Add row**,
**Remove row**, a name, **Save**. A set nothing has run can be edited in place; a set that has been
run is duplicated instead, and the original stays what its runs recorded.

**No migration.** `input_sets.columns` and `.rows` are already `jsonb` and `rowCount` is already
written at insert time, so `addInputSet` already accepted exactly what a grid produces. The whole
feature is a second writer into a table that stores what it needs — which is why an M-looking
request was an S.

## 1. This was not a new feature

`docs/roadmap.md`'s EPIC-032 task line has always read **"Input sets from CSV *and manual rows*"**.
EPIC-032 shipped the first half and narrowed the second in writing, in its Out of scope:

> **Manual input rows.** `docs/roadmap.md`'s task line says "CSV **and manual rows**"; decision 1
> says uploaded CSV. The decision is the newer of the two and it wins. Deliberately narrowed, not
> forgotten.

So this is that narrowing being lifted by the person who owns the decision, not a feature invented
against the roadmap. **EPIC-032 decision 1 survives intact** — its substance is *every refusal
happens before anything is stored*, and a typed grid honours that with the same
`inputSetProblems` call against the same declarations.

## 2. The finding, which shaped everything

**A run does not snapshot the inputs it ran against.**

`suite_runs` freezes `prompt_text` and `prompt_hash` onto its own row — the compiled prompt is
pinned at trigger time, exactly as EPIC-032 decision 1's third consequence required. For its
inputs it stores only `input_set`, a foreign key, and the detail page reads the rows **live**:

```
apps/web/lib/runs/queries.ts:62      inputSetForPrompt(db, run.prompt, run.inputSet)
apps/web/app/…/runs/[runId]/page.tsx:258   <Heatmap … inputRows={inputSet?.rows ?? []} />
```

An in-place editor would therefore have **silently rewritten the history of every past run against
that set**: open last week's run, switch to "By input", and read rows that run never saw beside a
pass rate computed over rows that no longer exist. Nothing errors. Nothing looks wrong.

The codebase already knew this mattered in the other direction — `removeInputSet` is a **soft**
delete and its comment says why: *"Soft, because a run in the history ran against it."* Deletion was
guarded; editing was not, because until this epic there was no edit path at all.

**The answer taken** (decision 3): a set with no runs is editable in place, a set with runs offers
**Duplicate and edit**. No snapshot column, no migration, and the original untouched.

**The answer not taken**, named here so it is not re-derived: freezing the rows onto `suite_runs`.
It is a schema change to a table four pages read, for a property this epic bought with a disabled
button. If it is ever wanted, `editRefusalFor` is what it would delete.

**The refusal is in the action, not only the surface.** `editRefusalFor` lives in
`lib/runs/queries.ts` rather than `actions.ts` because `"use server"` makes every export in that
file a server action and a helper cannot live there — which turned out to be the right constraint:
the rule history depends on now has seven tests instead of being reachable only through a browser.
The disabled button is the courtesy.

## 3. The ruling against the request's own wording

The request said **"test case editor"**. The product's word is **input**: the page already says
*"each row is one input"*, the thing is an **input set**, and the limit is `MAX_INPUTS`. A second
noun for a thing that has one is the drift ADR-003 exists to stop, and ADR-003 does not have to list
a word for the rule to apply. The surface says **"Add inputs by hand"**.

```
$ grep -rin "test case" apps/web/app apps/web/lib packages/ui/src | wc -l
0
```

**This is reversible and it is yours** — if you want your word, it is one rename.

## 4. Decisions

| # | question | choice | why |
|---|---|---|---|
| 1 | "test case" or "input"? | **input** | §3 |
| 2 | columns typed, or derived from the declarations? | **derived, on the server** | makes `unknown_column` and `missing_required` unreachable rather than caught; `inputSetProblems` stays as the control that the two writers cannot diverge |
| 3 | edit in place, or copy-on-write? | **in place until run, duplicate after** | §2 |
| 4 | freeze rows onto `suite_runs`? | **no** | a migration on a table four pages read, for what a disabled button buys |
| 5 | where do the limits live? | **`packages/core`, with tests** | rule 1: the row count is what a run is billed per, and "a row of all-empty cells is not a row" is the same decision `parseCsv` makes about a trailing newline |
| 6 | one `ByHandProblem` union, or reuse `CsvProblem`? | **its own union** | the two paths refuse different things, and telling somebody who typed three rows that "that file" is wrong is the failure the split prevents. A test asserts no message ever says "file" |

## 5. The two things the drive found

Both are the drive doing what the e2e suite cannot, and **neither was visible from test output**.

### 5.1 A case-sensitive name rendered in the wrong case

`runs.css` styles every small header with `text-transform: uppercase`. Copying that convention
rendered a variable named `request` as **`REQUEST`** — and `{{request}}` and `{{REQUEST}}` are two
different variables, so the header was stating something untrue about the reader's own prompt.

**The accessibility assertion passed the whole time.**
`getByRole("columnheader", { name: "request" })` is computed from the DOM text, which CSS never
touches. Only `innerText` off the built app saw the capitals.

Fixed by dropping the transform — the mono face says "identifier" without altering one — and the
spec now asserts the **rendered** text alongside the announced name.

### 5.2 The empty state sat under the grid, telling you to use the grid

*"No inputs yet. Upload a CSV, or add them by hand"* is a sentence for a page with nothing on it.
Underneath an open grid it is noise. Found by **looking at the first drive's screenshot**, which is
the only way it could have been found. It now steps aside while the grid is open.

## 6. The two things the test suites found, both mine

1. **`runs.spec.ts`'s Tab walk failed, and was right to.** "add inputs by hand" genuinely sits
   between Upload and the set list, so the tab order changed. The assertion now includes the new
   control rather than stepping around it — a Tab walk that skipped it would stop describing the
   page.
2. **My own first e2e fixture had no `expected` blok**, so the run had no checks, so "By input" had
   no results and said so correctly. The assertion read as a broken feature and was a broken test.
   The reason is now written into the fixture.

## 7. Gates

| gate | result |
|---|---|
| `pnpm test` | **9 of 9 packages PASS** (core 1011 tests) |
| `pnpm typecheck` | 9 of 9 PASS |
| `pnpm lint` | **12 of 12 PASS** — eslint ×9, dependency-cruiser, turbo boundaries, forbidden words |
| `pnpm dead-code` | PASS — 901 exports across 595 files, `ALLOWED` still empty |
| `pnpm e2e` | **328 passed, 4 skipped, 0 failed** (7.5m) |
| `node scripts/gates.mjs ci` | **17 of 17 steps PASS, 12m56s**, on `2b8e636` |

### 7.1 What that green does not cover, answered

The gate's closing block names three things. Taken in turn:

1. **"The runner is Linux; the four visual baselines skip here."** This epic touches
   `packages/ui/src/runs.css`, so the question is real. The diff is **purely additive** — `git diff`
   shows no removed line and every selector is new (`.runs-byhand*`, `.runs-grid*`). The two
   baseline pages are the landing page and the dev-UI gallery, neither of which contains a grid.
   **Residual risk: low but not nil**, and it is the usual one — a Linux CI run is the only thing
   that settles it, and nothing is pushed.
2. **"The runner is slower."** Nothing added here is timing-dependent; the new specs wait on
   elements and URLs, never on a duration.
3. **`--allow-dirty: 1 uncommitted file`.** That is `app-icon.jpg`, still untracked, still yours
   (EPIC-900 §8). Every file of this epic was committed before the run.

## 8. Tests added

| where | count | what |
|---|---|---|
| `packages/core/src/inputs/by-hand.test.ts` | 11 | the limits at and over the boundary, the empty-row rule, whitespace kept exactly |
| `apps/web/lib/runs/input-sets.test.ts` | 10 | db-backed: run counts, the edit refusal in both directions, prompt scoping, a copy edited leaving the original alone |
| `apps/web/lib/runs/view.test.ts` | 6 | the wording, including two controls that no message ever says "file" |
| `apps/web/e2e/runs-by-hand.spec.ts` | 9 | A1–A9 through a browser, A6 written **before** the editor existed |

## 9. Acceptance criteria

| | criterion | evidence |
|---|---|---|
| ✅ | **A1** one column per declared variable, named for it | e2e "the grid has one column…", **and** §5.1's rendered-text assertion |
| ✅ | **A2** two rows save, list with the count, no reload | e2e; no `reload()` in the spec |
| ✅ | **A3** the saved set runs with the values bound | e2e + drive — the fake echoes the bound value, asserted on `heat-detail` |
| ✅ | **A4** Edit before a run, Duplicate and edit after | `input-sets.test.ts` both directions; e2e; drive |
| ✅ | **A5** the **action** refuses, not only the surface | `editRefusalFor` tests, singular and plural |
| ✅ | **A6** a past run's inputs unchanged after the copy is edited | e2e, written first; drive §5 |
| ✅ | **A7** over the limit refused, naming it, nothing stored | core boundary tests + wording tests |
| ✅ | **A8** no variables → explanation, no grid | e2e |
| ✅ | **A9** keyboard and 44px touch | e2e Tab walk; drive at 390px — overflow 0px, control 44px |
| ✅ | **A10** nothing says "test case" | §3 grep |
| ✅ | **A11** `gates.mjs ci` green, closing block answered | §7, §7.1 |
| ✅ | **A12** driven by hand against the built app | §10 — **19 of 19** |

## 10. The drive — 19 of 19, watched

`scripts/drive-epic-032a.mts`, against `next start` from a real `next build` on :3120, with the app
in the IDE preview pane and a visible browser. A fresh `claude-drive-032a-…@example.com`, deleted at
both ends. `BUILD_ID cyGz6DVPlLn_eMVZkIIfV` matched verbatim in the served HTML; the stylesheet
fetched as **85,531 bytes of `text/css`**, which is the check the 2026-09-13 outage exists to force.

Screenshots in `docs/epics/reports/screenshots/EPIC-032a/`, transcript beside them.

**What the drive does not cover:** the image build, the Coolify environment, Traefik, and migrations
against the real database. Nothing is pushed, so nothing deployed and **no staging URL is evidence
about any of this**.

## 11. Open, and what is yours

1. **The word.** §3. One rename if you want "test case".
2. **Editing a refused CSV in the grid.** A file refused for a bad column still loses the whole
   upload; the grid could pre-fill from the parsed rows and let you fix the header. Deliberately not
   here — it turns a save surface into an import-repair surface. It would be EPIC-032b.
3. **`docs/backlog.md` has no row for this epic**, and I did not add one — `CLAUDE.md`'s never-touch
   list, and `docs/AUTONOMOUS.md`'s carve-out is the status cell of a row that already exists. The
   report, the epic file and the plan are all on disk; whether the backlog gains a row is yours.
4. **`app-icon.jpg`** is still untracked and still makes every `gates.mjs ci` need `--allow-dirty`.

## 12. Skipped, and said out loud

- **No backlog or roadmap edit** (§11.3).
- **No push, no PR, no deploy** — `CLAUDE.md`, "Nothing is pushed".
- **No migration**, because none was needed (§0) — not because one was avoided.

No new dependency was added by this epic.
