# EPIC-032: web — inputs, run, results, attribution
Stage: 3 · Depends on: EPIC-031, EPIC-021b · Size: M

**Completed 2026-09-14.** This file opened on 2026-09-14 as a stub that carried two inherited
requirements and said "the advisor completes the rest before this is worked on". That completion is
below, in Soroush's words, and the file is renamed from `EPIC-032-runs-and-attribution.md` so there
is one epic file rather than two.

## Goal
A signed-in person uploads a set of inputs, runs their prompt against them, sees results per check,
and can turn a failure into a constraint blok.

---

## Decisions — settled, do not re-litigate

**1. Input sets are CSV, uploaded, stored per prompt, owner-scoped like everything in EPIC-021a.**
A header row names the variables; a column with no matching variable is an error **at upload, not at
run time**.

Three consequences, all of them this epic's to build rather than discover:

- **The columns are the variable bindings**, so the row is substituted into the compiled prompt. It
  is not appended to it. See the trap under "Notes" — `executeRun` currently concatenates, and that
  would send every row's values twice.
- **A required variable with no column is an upload error too**, for the same reason in the other
  direction: accepting it defers the failure to run time, which is what this decision exists to
  prevent. A variable with a default is optional (`isOptional` in core) and may be absent; its
  default is used and the run says so.
- **A prompt that declares no variables cannot take an input set.** That falls out of "the header
  names the variables" and it is not a bug. The upload surface says so plainly rather than accepting
  a file it cannot bind.

**2. Results are shown per check, not per input.** The question a user has is "which of my rules is
failing", not "how did row 7 do". Row detail is one level down.

**3. Every failure attributes to exactly one blok and says which**, per `CLAUDE.md` rule 1 and
EPIC-030. `CheckResult.blokId` is exactly one, always — EPIC-030 asserts that rather than assuming
it, so this epic renders it rather than computing it.

**4. `fullyChecked: false` gets its own sentence**, per the inherited requirement below. Not folded
into a pass, not shown by colour alone.

**5. The cost shown to a user says what it counts**, because a cache hit is free and a re-run
therefore costs nothing while showing a number that no longer matches what ran. Inherited from
EPIC-031, below.

**6. Create-constraint-from-failure shows a preview of the blok it will add before adding it.** It
**never edits an existing blok.**

**7. Green, red and amber mean pass, fail and drift and nothing else; pass/fail is never colour
alone** (`CLAUDE.md` rule 10).

### Where decision 4 actually lands, because publishing does not exist yet

The inherited requirement says "at the publish moment". **There is no publish moment in this epic** —
publishing is EPIC-051 and EPIC-055, both out of scope. So the requirement lands here as **the run
summary's own sentence**, on the surface where a person first reads whether their prompt is verified,
and EPIC-051/055 inherit this epic's wording for the publish moment rather than inventing a second
one. The criterion is unchanged and is testable today: a run whose checks are all `not_graded` must
not render the same text as one whose checks all passed.

---

## Inherited requirement — the `fullyChecked: false` sentence

**Named here because this is the only place the state ever becomes visible to a person, and this is
the moment the EPIC-017 shape does not repeat.**

EPIC-030 ships a `RunSummary` with **two booleans and deliberately no `passed` field**:

- `noFailures` — no check failed. Gates Live, per `CLAUDE.md` rule 9.
- `fullyChecked` — every check ran *and* every one passed.

A prompt with ten ungradable checks has `noFailures: true` and `fullyChecked: false`. It is
publishable, by Soroush's ruling of 2026-09-14, because rule 9 blocks on **failure** and ten
ungradable checks have failed nothing — blocking there would refuse to publish a prompt for being
simple.

**So the only thing standing between a user and the belief that their prompt was verified is a
sentence on this page.** Core made that structurally impossible to fudge: there is no `passed` field
for a caller to read as the answer, and `passed` exists only as a count. The words are the last mile,
and they are a UI decision, which makes them this epic's.

**The requirement, stated so it can be checked:**

1. **`fullyChecked: false` gets its own sentence at the publish moment**, distinct from anything said
   about failures, and it is **never folded into a pass**. "All checks passed" must not appear when
   nothing was checked.
2. It says **how many** could not be checked and **why**, from `CheckResult.reason` — `no_kind`,
   `params_not_derivable`, `pattern_rejected`, `needs_judgement` are four different situations and
   the user can act on two of them.
3. **Not by colour.** `CLAUDE.md` rule 10: green, red and amber are pass, fail and drift, and this is
   none of them. It is words.
4. A test fails if a prompt whose checks are all `not_graded` renders the same text as one whose
   checks all passed. That is EPIC-030's criterion arriving on the surface where a person reads it.

**Why this is written down before the epic is.** `EPIC-017` sat `todo` through the whole of Stage 2
with live pages saying they were not written yet, and shipped past EPIC-014 and EPIC-015 because the
dependency lived in a row nobody read at the moment it mattered. A handover recorded only in the
report of the epic that created it is a handover nobody reads.

Source: `docs/epics/reports/EPIC-030-report.md` §4 and §12.1.

---

## Inherited requirement — the cost shown to a user must say what it counts

**From EPIC-031, ruled 2026-09-14.** A second requirement alongside the `fullyChecked` sentence, and
it arrives for the same reason: the code makes the state unambiguous, and the only place it becomes
visible to a person is a number on this page.

**A cache hit spends nothing.** It calls nobody, so it costs nothing, so it reserves nothing against
the budget — which is correct, and which means **a re-run is free and the number in front of the user
stops matching what they ran.**

Somebody who runs 200 inputs, sees "$1.40", changes one blok and re-runs, will see a much smaller
number for what looks like the same work. Both numbers are true. Neither is self-explanatory, and a
cost display that silently means two different things on two consecutive screens is the same class of
problem as a pass that silently means two different things.

**The requirement:**

1. **The cost says what it counts** — spend on this run, not the cost of everything on screen.
2. **Cache hits are visible as such**, so a smaller number has a reason attached rather than looking
   like a price change or a mistake.
3. A test asserts a re-run of an identical prompt shows **zero calls and zero spend**, distinctly from
   a first run that cost something.

Source: `docs/epics/EPIC-031-run-engine.md` decision 5.

---

## Scope

**`packages/core`** — the logic that has to be correct (rule 1), with tests:

- **CSV parsing.** RFC 4180: quoted fields, embedded commas, embedded quotes, embedded newlines,
  CRLF, and a UTF-8 BOM (Excel writes both). Pure, zero dependencies, no IO — which is why it belongs
  here and not behind a new package dependency.
- **Variable binding.** `{{name}}` occurrences in the compiled text replaced by a row's values. The
  occurrence scanner already exists (`occurrencesInText`); binding does not. Unbound required name,
  value containing `{{`, and a value that is itself a placeholder are three cases the tests name.

**`packages/db`** — schema and migration. The shape, not the names:

- an **input set** per prompt (owner resolved by joining through `projects`, as everything in
  EPIC-021a does), its column names, and its rows;
- a **suite run**: one trigger, over one input set, at one model, grouping the `runs` rows EPIC-031
  already writes;
- the **graded results** for that suite run, stored rather than re-derived. Re-grading later would
  grade against bloks whose text has since changed and attribute a failure to a blok that no longer
  says that. Versions are EPIC-040's; not re-grading is this epic's.

**`apps/worker`**:

- the **Anthropic `Provider` call site** — `execute.ts` declares the interface and nothing implements
  it. This is `@ai-sdk/anthropic`, already a declared dependency and imported nowhere.
- a **pg-boss queue** for a suite run, following `main.ts`'s existing two-queue shape, calling
  `executeRunSet` and grading each output with `gradeAll`.
- **`provider_not_configured`** added to `RefusalReason`. With no key there is no honest run and a
  crash is not an answer; EPIC-031 already made refusal a typed outcome with three named reasons and
  this is the fourth.

**`apps/web`**:

- `/app/pr/[promptId]/runs` — the input-set panel (upload, list, remove), the run trigger, run
  history, and the empty states for each;
- `/app/pr/[promptId]/runs/[runId]` — one suite run: the KPI strip, **results by check** with a meter
  and a pass/fail icon beside every colour, polling progress without a reload, and the failure detail
  with the failing region highlighted and the attributed blok card beside it;
- **"Create constraint from this failure"** → a preview of the blok text it would add, then a
  confirmation that adds it as a new constraint blok;
- the **two sentences**: what the cost counts, and what `fullyChecked: false` means;
- a **Run** action from the prompt page that reaches the runs route, as the mockup's page head shows.

## Out of scope

Named so they are not built even though the mockup draws some of them:

- **Versions, diffing, "regressions vs v6"** — EPIC-040. The KPI strip ships without the regressions
  tile rather than with a fabricated one.
- **Providers beyond the one** — EPIC-042. One model, pinned. No provider matrix, no heatmap, no
  "By input" pivot across providers.
- **Publishing, the publish gate, the blocked banner, "Publish v7"** — EPIC-051 and EPIC-055.
- **The judge** — EPIC-033. `needs_judgement` renders as a reason a check could not be graded and
  nothing more.
- **Export CI** — EPIC-053.
- **Manual input rows.** `docs/roadmap.md`'s task line says "CSV **and manual rows**"; decision 1 says
  uploaded CSV. The decision is the newer of the two and it wins. Deliberately narrowed, not
  forgotten.
- **The workbench's third tab.** `workbench.tsx` ships two of the mockup's four and leaves a note for
  whoever builds the third: it is called **Checks**, never "Assertions" (ADR-003, and
  `docs/design/README.md`'s corrections). That note stands; this epic does not build the tab.

## Acceptance criteria

**Group A — driven in a browser on deployed staging, with screenshots.** None of these needs a
provider key.

- [ ] A CSV whose header names the prompt's variables uploads, and its rows are listed with their
      count. Playwright + the staging drive.
- [ ] A CSV with a column matching no variable is **refused at upload**, naming the column. The rows
      are not stored. Playwright + the drive.
- [ ] A CSV missing a column for a required variable is refused at upload, naming the variable; one
      missing only an optional variable is accepted. Playwright.
- [ ] A prompt with no declared variables says so on the upload surface instead of accepting a file.
      Playwright + the drive.
- [ ] Triggering a run with no provider configured produces a run that is **refused with its reason
      named in words** — not a crash, not an empty page, not a spinner that never ends. Playwright +
      the drive. This is the state staging is in while EPIC-031a is deferred.
- [ ] Run history lists runs newest first with their state, and a refused run is legible as refused.
- [ ] Every interactive element on both routes works by keyboard and at 390px (rule 12). The drive
      takes both widths.

**Group B — the results surface. Proved by Playwright against a mocked provider, and driven locally
against a real one when a key is present.**

- [ ] Results are listed **by check**, each with its owning blok, a meter, and a pass/fail icon
      beside the colour. Playwright asserts the icon, not only the colour (rule 10).
- [ ] A failing check opens a failure detail showing the model output with the failing region
      highlighted, from `Evidence` offsets — `excerpt` carries `start` and `end`, and core counts
      **code points**.
- [ ] The failure names **exactly one** owning blok and renders that blok's card.
- [ ] "Create constraint from this failure" shows the blok text **before** adding it; cancelling adds
      nothing; confirming adds a new constraint blok and **no existing blok's `updatedAt` moves**.
      Asserted at the database, the way EPIC-021a's decision 5 test is.
- [ ] A run whose checks are all `not_graded` does **not** render the same text as one whose checks
      all passed, and the sentence says how many could not be checked and why, from
      `CheckResult.reason`. The named test for the inherited requirement.
- [ ] The cost says what it counts. A re-run of an identical prompt and input set shows **zero calls
      and zero spend**, distinctly from a first run that cost something.
- [ ] Progress advances without a reload while a run is in flight.

**Group C — the first real call.** `docs/backlog.md` gives this to EPIC-031a, which is deferred as of
2026-09-14, so it is written down here rather than left to be discovered:

- [ ] **If `ANTHROPIC_API_KEY` is set on staging when the drive runs**, the drive makes the first real
      call and EPIC-031a's checklist applies to it: the key appears in no log, the resolved model id
      matches a priced row, `usage` arrives in the shape `costCentsFor` expects, the reservation
      reconciles against the real token count, the payload is stored with `purge_after` stamped,
      `latencyMs` is plausible, and a second identical call is answered by the cache and calls
      nobody. Record the real cost in cents in the report — it is the first number anybody will have
      for what a run costs.
- [ ] **If it is not set**, Group A's refusal criterion is what the drive shows, and the report says
      in its own numbered section that the live call did not happen and why — the EPIC-030 §11 shape.
      It is not ticked, not skipped silently, and not a `BLOCKER`: every other criterion in this epic
      is reachable without it.

## Verification

```
pnpm test                      # core: CSV parsing, binding; web: the sentences; worker: the job
pnpm e2e                       # input sets, refusal, results by check, the preview step
node scripts/gate-run.mjs      # resolves to gates.mjs ci — the gate before the push
```

Then the deployed drive on `app.staging.41prompts.ai`, signed in as a fresh
`claude-drive-<label>-<timestamp>@example.com`, with the project, the prompt and its bloks created
**through the product's own UI** rather than seeded — `docs/AUTONOMOUS.md`, "A fresh user for every
drive".

## Notes for the implementer

**1. `executeRun` concatenates, and decision 1 means it must not.** It sends
`` `${request.compiled}\n\n${request.input}` ``. With the row substituted into `compiled`, that
appends every value a second time — the model sees the binding twice and nobody notices, because the
output is still plausible. `RunRequest.input` stays as the canonical serialisation of the row, which
is what `inputHash` and `cacheKey` need; what changes is that it is hashed rather than appended.
Write the test that fails on the old assembly before changing it.

**2. The helper that reloads.** `PROCESS.md`, "A helper that normalises state hides the defect from
every test that uses it": `variables.spec.ts` and `compiled-pane.spec.ts` both had an `addBlok`
helper ending in `await page.reload()`, which is why no test could see BUG-022 or
BUG-021b. **A new suite here must not reload between writing and reading**, and every write path
needs its `revalidatePath` — one missing call in `saveBlokTextAction` was the whole of both bugs.

**3. Core writes no sentences.** `Evidence` is deliberately a fact — an excerpt with offsets, a
measurement with its unit, an absence, a shape. Turning those into English is this epic's job and
it happens in `apps/web`, never in `packages/core` (rule 3's reasoning, applied to output rather
than to bloks).

**4. Colour and icons.** Rule 10 and the design corrections: pass/fail icons alongside colour, amber
for drift only. The mockup's meters are coloured by outcome; the icon is what makes them readable
without colour.

**5. Vocabulary.** check, span, blok, Draft, Live. Never assertion, never block, never enum, never
json_schema. `pnpm forbidden-words` scans `apps/web/app`, `apps/web/lib` and `packages/ui/src`, so a
slip in a UI string fails the build — which is the point.

**6. Cap the upload.** A CSV is a file a person chooses and a run costs money per row. The run budget
from EPIC-031 is the real guard on spend, but it is not a guard on a 200 MB paste: cap bytes and rows
at upload, refuse over the cap in words, and put the numbers in the report.

**7. The provider key.** `ANTHROPIC_API_KEY` reaches the worker from Coolify. Setting it there is
EPIC-031a's, and that row is `deferred` as of 2026-09-14 — so build for both worlds, which is what
Group C says. Never log the key, never put it in a payload, never put it in an error. `runs` already
has a test asserting no stored payload contains a key-shaped string; keep it passing.

**8. Attribution is read, not computed.** `CheckResult.blokId` is exactly one, always, by
construction in `compile()` and asserted in `grade.test.ts`. If this epic finds itself deciding which
blok a failure belongs to, it has taken a wrong turn.

**9. One PR.** `PROCESS.md`, "One PR per epic". Rulings and small corrections batch into it.
