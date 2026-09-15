# Plan — EPIC-032: web — inputs, run, results, attribution

Branch `epic/032-runs-web`. One PR. Written before any code, per `CLAUDE.md` "How to work" and
`docs/AUTONOMOUS.md` step 2.

## What exists already, so nothing is rebuilt

- `packages/core`: `compile()` emits `Check[]` from expected bloks; `grade`/`gradeAll`/`summarise`
  return `CheckResult`/`RunSummary`; `Evidence` carries code-point offsets; `occurrencesInText`
  finds `{{name}}`; `isOptional` answers required-vs-optional. **Attribution is already exactly one
  blok** (`CheckResult.blokId`) — note 8: this epic renders it.
- `apps/worker`: `executeRun` / `executeRunSet` with cache, price table, reservation, payload purge
  stamp. `Provider` is declared and **nothing implements it**.
- `packages/db`: `runs` table (rule 6), `run_budgets`, `prompts`, `bloks`, `prompt_variables`.
- `apps/web`: the canvas, the compiled pane, the Variables tab; server-action pattern with
  `revalidatePath` on every write; `promptForOwner` scoping.
- `packages/ui`: `KpiStrip`, `Meter`, `StatusIcon`, `Table`, `Callout`, `Badge`, `BlokCard`,
  `NoRunsIllustration`, `AllPassIllustration`, `AttributionIllustration`.

## The shape, end to end

```
upload CSV ──► input_sets (columns + rows, refused at upload if the header disagrees)
                     │
trigger ─────► suite_runs (queued) + suite_checks (the checks, frozen at trigger time)
                     │  pg-boss "run-suite"
worker ──────► provider? ──no──► suite_runs.state = refused, reason = provider_not_configured
                     │yes
                     └─ per row: bind ──► executeRun ──► gradeAll ──► suite_results
                                                            │
web polls (router.refresh) ──► results by check ──► failure detail ──► create constraint
```

---

## 1. `packages/core` — the logic that has to be correct (rule 1)

New directory `src/inputs/`, zero dependencies, no IO, pure.

**`csv.ts` — `parseCsv(text)`.** RFC 4180. Handles: quoted fields, embedded commas, embedded
doubled quotes, embedded newlines, CRLF/LF/CR, a UTF-8 BOM (Excel writes both). Returns
`{ ok: true, header, rows }` or `{ ok: false, problem }` where `problem` is one of
`empty | unterminated_quote | ragged_row | blank_column_name | duplicate_column_name`, each
carrying the line/column/name needed to name it in words. **A problem is a fact, not a sentence**
(note 3) — `apps/web` writes the English.

**`bind.ts` — `bindVariables(text, values, declarations)`.** `{{name}}` in the compiled text
replaced by a row's value. Right-to-left over `occurrencesInText` so earlier offsets stay valid.
Returns `{ ok: true, text, usedDefaults }` or `{ ok: false, missing }`. The three cases the epic
names get named tests:

1. an unbound **required** name → `ok: false` with the name (never a silent empty string);
2. a value that **contains** `{{` → inserted verbatim and **never rescanned**;
3. a value that **is** a placeholder (`"{{other}}"`) → the same, literal.

Single pass by construction: replacement is computed from offsets into the original text, so no
substituted value can be re-read as a placeholder.

**`input-set.ts` — `inputSetProblems(header, declarations)`.** Decision 1, both directions:
`no_variables_declared`, `unknown_column` (a column matching no variable), `missing_required` (a
required variable with no column). An optional variable (`isOptional`) may be absent.

Exported from `src/index.ts`. Tests beside each file.

## 2. `packages/db` — schema and one migration

Four tables. Ownership resolves by joining through `prompts → projects.owner`, as EPIC-021a does.

| table | id | what it holds |
|---|---|---|
| `input_sets` | `inp_` + 8 hex | `prompt`, `name`, `columns` jsonb (header, in order), `rows` jsonb (`string[][]`, aligned to `columns`), `rowCount`, `createdAt`, `deletedAt` |
| `suite_runs` | `srun_` + 8 hex | `owner`, `prompt`, `inputSet`, `model`, `params`, `promptHash`, `state`, `refusalReason`, `totalInputs`, `completedInputs`, `calls`, `cachedCalls`, `costCents`, `createdAt`, `startedAt`, `finishedAt` |
| `suite_checks` | `schk_` + 8 hex | `suiteRun`, `checkId`, `blokId`, `blokKind`, `blokText`, `kind`, `position` |
| `suite_results` | `sres_` + 8 hex | `suiteRun`, `suiteCheck`, `inputIndex`, `run` (the `runs` row, nullable), `outcome`, `reason`, `evidence` jsonb |

**Rows live on the input set as `jsonb`, not in a table of their own.** Manual rows are out of
scope, so a row is never edited after upload; the read is always "the whole set" and the cap keeps
it small. A per-row table would buy nothing and cost a join on the hot path.

**`suite_checks` freezes the blok's text at trigger time.** Scope: *"stored rather than re-derived.
Re-grading later would grade against bloks whose text has since changed and attribute a failure to
a blok that no longer says that."* The blok's **verbatim** text is copied here for that reason, not
paraphrased (rule 3).

**The model output is not copied.** The failure detail reads it from `runs.payload.text` through
`suite_results.run`, so rule 6's twelve-month purge remains the only clock on it. When the payload
has been purged the detail says so instead of showing nothing.

`packages/db/src/suites.ts` holds the owner-scoped reads and writes; `constants.ts` gains
`RUN_SUITE_QUEUE`, `DEFAULT_RUN_MODEL` and `RUN_PARAMS` — the web↔worker contract, in the one
package both already depend on, so the queue name is not a copy that can go stale (the `env.mjs`
lesson, one level down).

## 3. `apps/worker`

- **`runs/anthropic.ts`** — the first `Provider` implementation, `@ai-sdk/anthropic` + `ai`'s
  `generateText`. Already a declared dependency, imported nowhere until now. Returns `text`,
  `inputTokens`, `outputTokens` and the **raw** response for `runs.payload`.
- **`runs/fake-provider.ts`** — a deterministic fake that **echoes the last non-empty line of the
  prompt it was given**. Selected only by `FAKE_PROVIDER=1`, refused outright when
  `DEPLOY_ENV=production`, and announced in the startup log in as many words. Echoing the last line
  is what makes the e2e able to choose the model's answer through the CSV — and it proves the
  binding end to end, because the answer *is* the bound value.
- **`runs/provider.ts`** — `providerFor()`: fake → Anthropic → `undefined`. `undefined` is the
  fourth refusal.
- **`execute.ts`** — `RefusalReason` gains **`provider_not_configured`**, and the prompt assembly
  stops concatenating: `prompt: request.compiled`. Note 1. **The test that fails on the old
  assembly is written first.** `RunRequest.input` stays the canonical row serialisation and is
  hashed, not appended.
- **`runs/suite.ts`** — `runSuite(db, suiteRunId)`: load, pick provider, refuse or run. Per input:
  bind → `executeRun` → `gradeAll(checks, output)` → insert `suite_results` → update the counters
  so progress is observable while it is in flight. Budget exhaustion keeps what already ran
  (EPIC-031 decision 6): state `done` with `refusalReason` recorded, not `refused`.
- **`main.ts`** — a third queue, `run-suite`, in the existing two-queue shape, plus one
  `queues ready` log line so the e2e can wait on a real condition rather than a duration.

## 4. `apps/web`

Routes:

- **`/app/pr/[promptId]/runs`** — input sets (upload, list, remove), the run trigger, run history,
  and an empty state for each. A prompt with no declared variables says so here and the file input
  is not offered.
- **`/app/pr/[promptId]/runs/[runId]`** — the KPI strip, **results by check**, the two sentences,
  the failure detail, and "Create constraint from this failure".
- A **Run** action in the prompt page head, as the mockup's page head shows.

`lib/runs/`:

- `limits.ts` — **100 inputs, 512 KB**, refused in words at upload. Note 6. The run budget is the
  guard on spend; this is the guard on a paste.
- `queries.ts` — owner-scoped reads, `undefined` → 404 not 403.
- `actions.ts` — `uploadInputSetAction`, `removeInputSetAction`, `startRunAction`,
  `addConstraintFromFailureAction`. Every one: resolve session → scope by owner → validate → write
  → `revalidatePath`. Note 2: **every write path revalidates**, and no helper in the new e2e reloads.
- `queue.ts` — one lazily started pg-boss client, `supervise: false`, `schedule: false`.
- `view.ts` — **the sentences**, pure and unit-tested:
  - the `fullyChecked: false` sentence, its own, never folded into a pass, with the count and the
    four `CheckResult.reason` values told apart in words;
  - the cost sentence — what it counts, and cache hits visible as such;
  - `Evidence` → English (note 3: core states facts, this writes prose);
  - results grouped by check with pass/fail counts and a meter value.

Presentation: pass/fail **icon beside every colour** (rule 10, note 4); amber appears nowhere here
because nothing on this page is drift. Progress advances by `router.refresh()` on an interval while
the run is in flight — a client-side re-render, **not a reload** — and stops at a terminal state.

`packages/ui/src/runs.css`, imported from `styles.css`.

## 5. Tests

- **core**: CSV (quotes, commas, embedded newlines, CRLF, BOM, ragged, unterminated, duplicate and
  blank headers), binding (the three named cases, defaults, verbatim values), column checking.
- **db**: input set round trip; suite run counters; the cascade.
- **worker**: the prompt is the compiled text and the input is **not appended** (written first, and
  failing, against the old assembly); `provider_not_configured`; the fake is never selected without
  its flag; `DEFAULT_RUN_MODEL` has a priced row.
- **web (vitest)**: every sentence in `view.ts`, including *"a run whose checks are all
  `not_graded` does not render the same text as one whose checks all passed"*.
- **e2e**: `runs.spec.ts` (upload, the three refusals, the no-variables surface, keyboard, 390px);
  `runs-refusal.spec.ts` (a worker with **no** key → a run refused in words);
  `runs-results.spec.ts` (a worker with the fake → results by check, the failure detail and its
  highlight, exactly one blok, the preview/cancel/confirm with `updatedAt` asserted at the database,
  the two sentences, a cached re-run at zero calls and zero spend, progress without a reload).

  The two run specs each **spawn the worker themselves** with the environment that spec needs,
  waiting on its `queues ready` line. That is the only way both "no provider" and "a provider" are
  reachable in one suite, and it is honest: the e2e stack becomes web + worker, which is what
  production is.

## 6. Risks, and what happens instead

| risk | fallback |
|---|---|
| Next cannot bundle `pg-boss` in a server action | `serverExternalPackages: ["pg-boss"]`; failing that, the worker claims `queued` suite runs on a one-second interval and the web only writes the row. Logged in `docs/decisions/AUTONOMOUS.md` if taken. |
| The spawned worker is flaky in Playwright | wait on the log line, not a timeout; if it still fails, the results spec is skipped **loudly** via the existing skip reporter rather than silently, and the report says which criteria that leaves unticked. |
| `ANTHROPIC_API_KEY` absent on staging | Group C's second bullet: the drive shows the refusal, and the report says in its own numbered section that the live call did not happen. Not a `BLOCKER`. |

## 7. Out of scope, restated so it is not built

Versions and the regressions tile; providers beyond the one and the "By input" pivot; publishing
and the publish gate; the judge; export CI; manual input rows; the workbench's third tab.
