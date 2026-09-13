# EPIC-022 · Variables — report

`{{placeholders}}` become a declared set, and the two ways a prompt and that set can disagree are
reported as their own kind of thing rather than as a seventh finding.

Plan: `docs/epics/plan-EPIC-022.md`, approved 2026-09-13 with three rulings recorded inline.

## 1. What shipped

**`packages/core/src/variables/`** — `extractVariables`, `variableIssues`, `renameVariable`, and the
types. Pure, deterministic, zero dependencies, as rule 1 and rule 2 require.

**`packages/core/src/compile/emits-text.ts`** — EPIC-020 decision 6, extracted. `expected` is the
only kind that emits no text, and now exactly one line says so.

**`packages/core/src/artifact/schema.ts`** — carries `variables`; `ARTIFACT_SCHEMA_VERSION` is 1;
`ArtifactVariable.type` is reserved and absent.

**`packages/db`** — `prompt_variables`, migration `0005_good_bromley.sql`, owner-scoped queries, and
`applyRename`, which is the whole transactional write.

**`apps/web`** — the tab strip, the Variables tab, the preview, and four server actions.

## 2. The three rulings, and what each one changed in the code

### §0 — `VariableIssue`, not a seventh `FindingKind`

`FINDING_KINDS` is untouched at six and the guide page is unchanged. The rule is now in **ADR-003**
rather than only in an assertion: *a finding is a claim about prose we did not write.* The assertion
tells a reader **that** it is six; only the ADR tells them **why**, and "why" is what stops the next
proposal.

### Q1 — no per-variable types in v1; a reserved field instead

A variable is a name, a default and a description. That collapsed two of the roadmap's three fields
into one — **`optional` is not stored**, because a variable is optional exactly when it has a
default, and two fields can disagree where one cannot.

**What this removes, stated rather than glossed:** a *required* variable can no longer carry a value
for preview. Its only value slot is the thing that makes it optional. Preview shows the braces for
those, which is the honest rendering — it is what the prompt will contain if nobody supplies one.

`ArtifactVariable.type` ships **absent**, with a note in `schema.ts` not to bump the schema version
when it starts carrying values. That is the entire point of reserving it.

### Q2 — an example blok is a use; an expected blok is not

Implemented from the compiler's own rule rather than a second list of kinds. `emitsText` is now one
function both modules call. `EXPECTATION_ONLY` in the fixture corpus is the test that would have
passed silently under a hand-written list.

A consequence the ruling did not name, and which the code now handles: **a hand-edited span is the
text that ships.** A `{{customer}}` typed into a hand edit is a use; one edited *out* of a span is
not, whatever the blok's stored text still says. Reading `blok.text` in both cases would have
reported the prompt that *would* have shipped.

### Q3, answered under the advisor's standard — bump to 1

`schema.ts` says, in an imperative: *"Change it freely until then, and bump `ARTIFACT_SCHEMA_VERSION`
when you do."* Adding the variable contract is changing it. Not bumping would have left that sentence
false — the same defect as "confidential" in the licence and "never leaves the worker" in the
summariser, both corrected this week. A bump is free precisely because nothing reads artifacts yet;
the first time it is expensive is the first time it matters.

## 3. Rename, which is the only part that can lose writing

Built first among the features and tested before it existed, per the ruling and the EPIC-021a
precedent.

- **Pure, in core.** It returns new texts rather than applying them, so it cannot leave a prompt
  half-renamed. The caller writes them or writes none.
- **One transaction, in `packages/db`.** `applyRename` holds every blok text, every hand edit and
  the declaration row. It is in the db package so there is exactly one place a partial write could
  happen, and so Drizzle stays out of `apps/web`.
- **Only the name is replaced**, so `{{ customer_name }}` keeps the spacing its author typed. Right
  to left, so a longer new name does not invalidate the offsets behind it.
- **`editedFromHash` travels unchanged.** A rename is not a new hand edit; recomputing the hash would
  quietly answer "no" to "has the blok changed since you edited this" for ever.
- **Three refusals, not a best effort:** an invalid name, a target already taken, and a name nothing
  uses or declares. Renaming onto an existing name would merge two variables, and merging cannot be
  undone by renaming back — nothing records which occurrences were which.

The rollback is proved, not assumed: `variables.test.ts` forces the last write in the transaction to
fail and asserts the blok text and the declaration are both untouched.

## 4. Acceptance criteria

- [x] **`extractVariables(bloks)`.** `packages/core/src/variables/extract.ts`; 19 tests.
- [x] **Variables tab with a default and a description.** `variables-tab.tsx`. *Optional flag* is
      derived rather than stored (Q1) and *example value* is the default (Q1).
- [x] **Warnings for undefined use.** "Used but not declared", first in the tab, with the count and
      whether any occurrence is in a hand edit.
- [x] **Unused declared is reported.** As a `VariableIssue`, per §0.
- [x] **Extraction fixture.** `variables/fixtures/prompts.ts` — four corpora, including the four
      brace forms that must stay literal.
- [x] **Rename updates the declared set.** Core tests plus a db test for the transaction.
- [x] **Preview compile renders.** `lib/variables/preview.ts`; 10 tests; e2e checks a default renders
      and a required variable keeps its braces.
- [x] **Shape forward-compatible with the Stage 5 contract check.** The artifact carries the
      declarations; the reserved `type` field means adding types later is not a breaking change.
- [ ] **Hand-driven on staging.** Not yet — `built — awaiting the staging hand-drive`.

## 5. Verification

| gate | result |
|---|---|
| `pnpm typecheck` | 8/8 |
| `pnpm lint` | 482 files, no issues; dependency-cruiser clean |
| forbidden-word grep | clean — **no UI string in this epic says "schema"** (ADR-003) |
| `pnpm binary-files` | clean |
| `license-gate` | proprietary boundary intact |
| core tests | 54 across variables, artifact and the regex guard |
| preview tests | 10 |
| db tests | 9, needing `DATABASE_URL`; they run in CI |

The package's regex guard caught both new literals and refused the build until they were on the
reviewed list with their reasoning. That is the gate working exactly as intended on the first new
patterns since it was written.

## 6. Open, and deliberately so

1. **The `Assertions` tab is not stubbed.** Two tabs ship. A disabled tab that does nothing is a
   worse promise than an absent one. The note about ADR-003's objection to the word is in
   `workbench.tsx`, where whoever builds it will meet it before writing the label.
2. **No runtime substitution.** Supplying real values at call time is the SDK's job, Stage 5.
3. **Nested defaults are substituted once, not chased.** A default of `{{b}}` renders as `{{b}}`.
   Chasing would need a cycle check for a feature nobody has asked for.
4. **The staging hand-drive**, which is the last criterion.
