<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: Apache-2.0
-->

# Plan — EPIC-041: the Versions page

Branch `epic/041-versions-page`. Written before any code, per `CLAUDE.md` "How to work".

---

## What exists already, so nothing is rebuilt

| | where | what it gives this epic |
|---|---|---|
| `prompt_versions` | `packages/db/src/schema.ts` | `n`, `snapshot`, `compiledText`, `compiledHash`, `note`, `pinnedAt` |
| `versionsForPrompt`, `newestVersion`, `pinVersion`, `recordVersion`, `passRateForVersions` | `packages/db/src/versions.ts` | the whole read and mint side |
| `diff(a, b)`, `snapshot(bloks, handEdits)` | `packages/core/src/version/` | the maths, with 16 tests |
| `snapshotNow`, `recordVersionNow`, `pinVersionForRun` | `apps/web/lib/versions/record.ts` | the seam the canvas already uses |
| `createSuiteRun`, `suiteRunsForPrompt`, `suiteRunForOwner` | `packages/db/src/suites.ts` | a run is a row plus frozen checks |
| `VersionsIllustration` | `packages/ui` | the empty state, already drawn |

Four things are missing and this epic builds exactly them: a way to **read a snapshot back**, a way
to **write one onto the canvas**, a way to **run a past version**, and the **page**.

---

## 1. `packages/core` — read a snapshot back

`packages/core/src/version/snapshot.ts` gains `readSnapshotBloks(value: unknown): readonly SnapshotBlok[] | undefined`.

- Pure, zero-dependency, no IO — the package's rule.
- Narrow and total: anything that is not an array of objects carrying the six fields with the right
  primitive types returns `undefined`. A version row whose JSONB nobody can read is a row the page
  must render as unreadable rather than crash on.
- Kind is validated against `BLOK_KINDS`, because `diff` and the compiler both type it as `BlokKind`
  and a snapshot written by a future version of the product is not this one's to guess at.
- Tests: a round trip through `snapshot()`, each malformed shape, and a snapshot with hand edits.

Also `readSnapshot(value, compiledText)` → `VersionSnapshot`, so a caller building the pair for
`diff()` does not assemble the object by hand at three call sites.

## 2. `packages/db` — write a snapshot onto the canvas, and link two runs

**`applySnapshot(db, promptId, bloks)`** in `canvas.ts` (it writes bloks; that is where blok writes
live). Takes a local `SnapshotBlokRow` interface — **`packages/db` still does not import
`@41prompts/core`**, EPIC-040's logged decision, and nothing here needs it to.

One transaction:

1. read every row of the prompt, **deleted ones included** — a blok that was soft-deleted after the
   version was taken is the same blok and must come back by id, not as a new one with a new
   identity that breaks every future diff;
2. for each snapshot blok, in order: update text / kind / hand edit / `rank` / clear `deletedAt` if
   the row exists, insert it with its own id if it does not;
3. soft-delete every live row the snapshot does not contain.

Ranks are `rankSequence(n)`, which is what a rebalance already uses: the snapshot's order is total
and contiguous, so there is nothing to interleave with.

**Never a hard delete.** The roadmap's Review line is "Restore never deletes", and `deleteBlok` is
already soft precisely so undo is clearing a column. This uses the same door.

**`suite_runs.comparison`** — a nullable text column, `cmp_` + 8 hex, shared by the two runs of one
A/B. No table: a comparison has no attributes of its own beyond the two runs that carry it, and a
join table for a two-element set that is written once is a table to keep in step with nothing.
`comparisonRuns(db, comparison)` reads the pair.

Migration via `pnpm db:generate` — one new column, no backfill, every existing run has `null`.

Tests in `packages/db/src/versions.test.ts` / `canvas.test.ts`:

- restore brings back a soft-deleted blok **with its original id**;
- restore removes a blok the snapshot does not have, **soft**, so `deletedAt` is set and the row is
  still there;
- restore reinstates a hand edit;
- two runs written with one `comparison` read back as a pair.

## 3. `apps/web/lib/versions` — the three actions and the view model

**`restoreVersionAction(promptId, versionId)`** — the order is the whole of it:

```
recordVersionNow()   # the open draft catches up with the canvas
pinVersion()         # ← the step that makes "never deletes" true for unrun work
applySnapshot()      # the canvas becomes the old blok set
recordVersionNow()   # mints Draft v(N+1) holding the restored content
```

Unlike `recordVersionNow` this one **does** report failure: a restore that half-happened is not
bookkeeping, it is somebody's canvas.

**`abAction(promptId, aId, bId, inputSetId)`** — one `comparison` id, two `createSuiteRun` calls.
Each run takes its own version's frozen `compiledText` and `compiledHash`; its checks come from
`compile()` over that version's snapshot bloks, which is where the check kinds and verbatim blok text
come from. Both versions are pinned first — a version something points at may never change again, and
an A/B points at both.

**`setVersionNoteAction(promptId, versionId, note)`** — the one thing on this page that writes a
version's own row. Allowed on a pinned version: the note is a person's words *about* the version, not
part of the frozen prompt, and refusing to let somebody annotate history after the fact would make
the feature useless exactly when it is wanted.

**`apps/web/lib/versions/view.ts`** — pure, tested, no JSX:

- `versionRows()` → `{ id, n, name: "Draft vN", note, when, passRate }`;
- `passRateWords()` → `"16 of 17 checks passed"` / `"Nothing was graded"` / `"No run yet"`. **Never
  a colour and never a bare percentage as a verdict** (`CLAUDE.md` rule 10);
- `diffLines(diff)` → one line per change with a plain-word verb, the blok kind, an excerpt, and
  1-based positions;
- `byteDeltaWords()` → `"1,231 → 1,284 bytes · +53"`.

## 4. `apps/web/app/app/pr/[promptId]/versions/page.tsx` — the page

Server component. `?a=&b=` choose the pair; default is the two newest. Unknown ids fall back to the
default rather than 404 — a stale link is not a missing prompt.

```
Versions                                    [Restore Draft v3]  [A/B on inputs.csv ▾]
┌ history ─────────────────┐ ┌ Draft v3 → Draft v5 ─────────────────────────────┐
│ Draft v5 · note · when   │ │ Compare [Draft v3 ▾] with [Draft v5 ▾]  [Show]   │
│   16 of 17 checks passed │ │ added    Expected blok · "valid JSON, three keys"│
│ Draft v4 …               │ │ removed  Constraint blok · "keep the tone…"      │
└──────────────────────────┘ │ moved    Constraint blok · position 5 → 3        │
                             │ Compiled: 1,231 → 1,284 bytes · +53              │
                             └──────────────────────────────────────────────────┘
```

- Rows are links that set `b` to that version and `a` to the one before it — "what changed in this
  version" is the question a history is asked most — and the two `<select>`s in a GET form reach any
  other pair. One mechanism, the URL, with two entry points.
- Client island for the buttons that call server actions (restore, A/B, note), in the shape
  `input-sets.tsx` already uses: `useTransition`, a message region, `router.refresh()`, **never
  `location.reload()`**.
- With no input set: the A/B control is not offered and a sentence says where to make one — the same
  refuse-before-you-offer shape as `InputSets`.
- With one version: the diff panel says so in a sentence; no throw, no empty grid.
- Empty history: `VersionsIllustration` and a line about editing the prompt.

**Navigation.** The prompt page and the runs page both get a `Versions` link in the page head, and
this page's crumb goes back to the prompt. A page nothing links to is a page nobody finds — the
`/app` dead end is the precedent.

**Run surfaces.** `run-history.tsx` gains `Draft vN` per row; `runs/[runId]` names the version it ran
and, when there is one, links the run it was compared against. A run with `version === null` says
*"This run predates version history"* — EPIC-040 §11.2's inherited obligation, met in words.

## 5. CSS

`packages/ui/src/versions.css`, imported from `styles.css`. Two-column grid collapsing to one at the
canvas breakpoint, hairline data surfaces, 44px targets, no amber anywhere. The diff verbs are text,
not colour.

## 6. Tests

| where | what |
|---|---|
| `packages/core` | `readSnapshotBloks` round trip and every malformed shape |
| `packages/db` | restore by id, soft removal, hand edit reinstated, the linked pair |
| `apps/web` (vitest) | `view.ts`: pass-rate words, diff lines including **moved ≠ removed + added**, byte delta, the null-version sentence |
| `apps/web/e2e` | `versions.spec.ts` gains: the page renders the history; edit → diff shows the change; restore puts the canvas back and the count went **up**; A/B creates two runs sharing a comparison |
| drive | `scripts/drive-epic-041.mjs` — the page in a real browser against a real build, at 1440 and 390 |

## 7. Order of work

1. core reader + tests
2. db `applySnapshot`, `comparison` column, migration + tests
3. web actions + view model + tests
4. the page, the CSS, the navigation
5. run surfaces
6. e2e
7. `pnpm test / typecheck / lint`, commit, `node scripts/gate-run.mjs`
8. build, `next start`, drive, screenshots
9. report, session log, decisions, backlog row, merge

## 8. Risks

- **Restore's ordering is the epic's one subtle thing.** Pin before apply, or unrun work is lost.
  It has its own test asserting the pre-restore text is still in the history.
- **A/B on an unpinned version pins it**, which means pressing A/B changes what the next save does
  (it mints instead of rewriting). That is correct and the same rule a run already follows; it is
  worth a sentence in the report because it is a state change a person did not ask for by name.
- **`passRateForVersions` reads the newest finished run.** An A/B whose runs are still queued shows
  no rate for either version until they finish. The page must say "running", not "no run yet".
