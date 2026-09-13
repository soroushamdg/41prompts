# Plan · EPIC-022 · Variables

**Status: approved 2026-09-13, with rulings. Amendments are marked inline and dated; the original
text is left standing where a ruling changed it, so the record shows what was decided rather than
only what was decided *on*.**

Source of truth: `docs/roadmap.md` §EPIC-022 and `docs/backlog.md` row 118. There is no advisor epic
file for this one, so the roadmap entry is the spec, quoted here in full so the plan can be checked
against it:

> **Goal.** `{{placeholders}}` become a typed schema.
> **Tasks.** `extractVariables(bloks)`; Variables tab: optional flag, description, example value;
> warnings for undefined use; finding for unused declared.
> **Tests.** Extraction fixture; rename updates schema; preview compile renders.
> **Review.** Shape forward-compatible with the Stage 5 contract check.

Size S. Depends on EPIC-020 (the compiler), and in practice on EPIC-021a/b, which are both merged.

---

## 0. One thing needs a ruling before any code

**The roadmap asks for a "finding for unused declared". Producing a seventh `Finding` fails a test
that exists on purpose.**

`packages/core/src/detect/types.ts` closes `FINDING_KINDS` at six.
`apps/web/lib/site/article-examples.test.tsx` asserts:

```ts
expect(FINDING_KINDS).toHaveLength(6);
expect(text).toContain("six ways");
```

and the shipped guide page says *"There are six ways we know how to find that, deterministically,
without asking a model for an opinion."* That test was written so the prose and the detectors cannot
drift apart. Adding a seventh kind is therefore not an oversight to work around — it is a promise to
a stranger, and to a model that may cite the page.

**Recommendation: do not add a seventh `FindingKind`.** Return variable problems as their own type.

The reasoning is not only "a test says six". The six findings are the **decompiler's** claim about
*prose somebody pasted*: they are what we can tell you about writing, without a model, about a prompt
we have never seen. A variable problem is a different kind of statement — it is about the *schema of
a prompt being edited in our own product*, it is trivially decidable rather than heuristic, and it
already has a surface of its own in the Variables tab. Folding it into `Finding` would make the
decompiler's headline number ("six things we can find") depend on whether a prompt happens to use
`{{ }}`, which is not what that sentence means.

Proposed shape instead, in the same pure module:

```ts
export type VariableIssueKind = "used_but_not_declared" | "declared_but_not_used";
export interface VariableIssue {
  readonly kind: VariableIssueKind;
  readonly name: string;
  readonly occurrences: readonly VariableOccurrence[]; // empty for declared_but_not_used
}
```

This also makes the roadmap's own distinction land cleanly: it says *warnings* for undefined use and
a *finding* for unused declared. Two words, one mechanism, and both are the same shape of fact —
a name on one side of the schema and not the other.

**If the ruling is the other way** — a real seventh `FindingKind` — then the guide page copy, its
`description` metadata, the `toHaveLength(6)` assertion and the `"six ways"` string all change in the
same PR, and `CLAUDE.md`'s vocabulary note about the six needs a line. That is a bigger, louder change
than this epic's size suggests, which is itself a reason to ask rather than choose.

> **Ruled 2026-09-13: `VariableIssue`, not a seventh `FindingKind`.** The reasoning above is the
> ruling, in the advisor's words: *the six are claims about prose we did not write; a variable problem
> is a decidable fact about a schema we own.* `FINDING_KINDS` stays at six and the guide page stays
> correct.
>
> **Additional instruction:** write this into ADR-003's vocabulary section, so nobody proposes a
> seventh in six months. That makes the six a stated rule rather than a number a test happens to
> assert — the assertion tells you *that* it is six, and only the ADR tells you *why*.

---

## 1. What is already true, so the plan builds on it rather than around it

| fact | where | consequence for this epic |
|---|---|---|
| `compile()` is per blok; one blok, exactly one span | `packages/core/src/compile/` | Extraction must work on **bloks**, not on the compiled string, or a variable's location stops being attributable. |
| Bloks store text **verbatim** — no trim, no normalisation | `packages/db/src/schema.ts`, `CLAUDE.md` rule 3 | A rename edits the author's own text. That is allowed (it is their action, not a compiler paraphrase) but it must be explicit and undoable. |
| A hand-edited span lives on its own blok row, so inserting a row writes no other row | EPIC-021a decision 5 | The variable table should follow the same rule: one declared variable, one row. |
| `Artifact` is **v0 and explicitly not frozen until Stage 5a** | `packages/core/src/artifact/schema.ts` | The variable schema can be added to the artifact now. The file's own comment names *"The variable contract (EPIC-022) and its compatibility check"* as work it is waiting for. |
| `toDisplayText` already sits between source space and DOM space | `apps/web/lib/site/display-text.ts` | Preview substitution has an existing place to live and must not leak into compiled bytes. |
| The mockup's tab strip is `Editor · Variables · Assertions · Providers` | `docs/design/41prompts-full-mockup.html:1047` | The strip does not exist yet; `page.tsx` renders `<Editor>` directly. This epic introduces it with two tabs live. |
| A core fixture already writes `{{ invoice_image }}` **with inner spaces** | `packages/core/src/segment/fixtures/multimodal.ts:58` | The syntax tolerates whitespace inside the braces. This is evidence, not a guess. |

---

## 2. Decisions

**1. `extractVariables` is pure, deterministic, and lives in `packages/core`.** `CLAUDE.md` rule 1 and
rule 2. No model chooses what is a variable. Zero dependencies, no DOM, no IO.

**2. The syntax is `{{` · optional whitespace · name · optional whitespace · `}}`.** Name is
`[A-Za-z_][A-Za-z0-9_]*`, case-sensitive. `{{ invoice_image }}` and `{{invoice_image}}` are the same
variable. Anything that does not match — `{{}}`, `{{ 9lives }}`, `{{ a b }}`, an unclosed `{{` — is
**not a variable and not an error**: it stays literal text, because a prompt is someone's writing and
a stray brace is not a mistake we get to announce.

**3. An occurrence is located in its blok, not in the compiled text.** `{ blokId, name, start, end }`
with UTF-16 offsets into `PromptBlok.text`, matching `Segment` and `Range` convention. Compiled-text
offsets are derived and shift when any earlier blok changes; blok offsets are stable and are what the
canvas can highlight.

**4. Declared variables are rows, not a JSON column.** A `prompt_variables` table: `prompt`, `name`,
`defaultValue`, `description`, timestamps.

> **Amended 2026-09-13 (ruling Q1).** This read `optional`, `description`, `exampleValue` — the
> roadmap's three. The ruling is that **a variable has a name, a default, and a description**, which
> collapses two of those into one: a variable is optional **because** it has a default, and the
> default is what preview renders. `optional` becomes derivable (`defaultValue !== null`) rather than
> a second field that can contradict the first, and there is no separate example to drift from the
> default.
>
> **What this removes, said plainly:** a *required* variable can no longer carry a value for preview,
> because its only value slot is the thing that makes it optional. Preview renders the placeholder
> for those. That is the right trade — a required variable with an example is a variable whose
> example is a lie about whether you must supply it — but it is a capability the roadmap's wording
> allowed and this one does not. One declared variable, one row, so editing a
description writes one row and a rename does not rewrite the set. A `jsonb` column would make every
edit a read-modify-write of the whole schema, which is the concurrent-edit bug EPIC-021a decision 2
already paid to avoid once.

**5. Used and declared are two sets, and the product shows both.** `extractVariables(bloks)` answers
*used*. The table answers *declared*. Every issue in §0 is a name in one set and not the other. The
function that computes issues takes both and is pure; nothing about it needs a database.

**6. A rename is one action, over every occurrence, with one undo.** Renaming `{{ customer }}` to
`{{ account }}` rewrites every blok that uses it **and** the declared row, in one transaction. This is
the test the roadmap names ("rename updates schema") and it is the one operation in this epic that can
destroy writing, so its test is written before the feature — the EPIC-021a precedent, which found the
silent-hand-edit-loss bug exactly this way.

**7. Preview substitution never touches compiled bytes.** Example values are rendered *for display
only*: after `compile()`, in the view layer, never inside it. `Compiled.text`, `blokHash`,
`COMPILER_VERSION` and the artifact are all unaffected. A prompt whose compiled output depended on an
example value would publish the example.

**8. The artifact carries the variable schema, and `ARTIFACT_SCHEMA_VERSION` goes to 1.** This is what
"forward-compatible with the Stage 5 contract check" needs: the SDK's compatibility check in EPIC-050
compares the variables a caller supplies against the variables an artifact declares, and it cannot do
that if the artifact does not carry them. v0 is explicitly unfrozen and the schema file asks for this
by name.

**9. The tab strip ships with two tabs.** `Editor` and `Variables`. `Assertions` and `Providers` are
Stage 3 and Stage 4 and are not stubbed — a disabled tab that does nothing is a worse promise than an
absent one. **Note for whoever builds the third:** the mockup labels it *Assertions*, which ADR-003
forbids in UI strings; `docs/design/README.md`'s corrections section already says to build "check".

---

## 3. Build order — the two tests that come first

Written before the code they cover, for the reason EPIC-021a established: a failure that loses
someone's writing must be caught by a test that existed before the feature.

1. **Fixture corpus + `extractVariables` tests** — the roadmap's "extraction fixture". Real prompts,
   including the whitespace form, the malformed forms, a variable used in three bloks, and one used
   inside an `example` blok where it is arguably literal.
2. **Rename test** — "rename updates schema". Rename with occurrences in several bloks, a
   hand-edited span among them, and an undo. This is the work-losing one.
3. `extractVariables` + `variableIssues` in core, with invariants.
4. `VariableSchema` in the artifact; bump `ARTIFACT_SCHEMA_VERSION` to 1; update `artifactOf`.
5. `prompt_variables` table, migration, owner-scoped queries in `packages/db/src/canvas.ts` style.
6. Rename server action, transactional, undoable.
7. Tab strip + Variables tab: declared list, optional flag, description, example value, and the two
   issue kinds shown plainly.
8. Preview rendering in the compiled pane, display-layer only.
9. Playwright: declare, use, rename, see the schema follow; preview renders example values.

---

## 4. Files this touches

**New** — `packages/core/src/variables/{types,extract,issues,invariants,README}.ts` + fixtures;
`packages/db/src/variables.ts` + migration; `apps/web/app/app/pr/[promptId]/{tabs,variables-tab}.tsx`;
`apps/web/lib/variables/actions.ts`; e2e spec.

**Changed** — `packages/core/src/index.ts` (exports), `packages/core/src/artifact/schema.ts` (the
variable contract and the version bump), `packages/db/src/schema.ts`,
`apps/web/app/app/pr/[promptId]/page.tsx` (the strip), `packages/ui` (tab primitive, if none exists).

**Not touched** — `packages/core/src/detect/*` if §0 is decided my way. `infra/`. Any `LICENSE`.

---

## 5. What this epic does not do

- No variable **types** beyond a name (no string/number/enum) **in v1**.

  > **Ruled 2026-09-13 (Q1).** The reading was right, and the reason is stronger than the reading:
  > *types are a compatibility surface we would freeze into the artifact and then be stuck with, and
  > EPIC-050 freezes that format.* So a `type` field is added to the **artifact schema now, optional
  > and unused**, and `schema.ts` says it is reserved. Adding types later is then a field that starts
  > being populated, not a breaking change to a frozen contract.
- No runtime substitution. Supplying real values at call time is the SDK's job (Stage 5).
- No import of variables from an existing prompt on paste. That is the decompiler's side.

---

## 6. Questions for the advisor

1. **§0: seventh `FindingKind`, or a separate `VariableIssue` type?** My recommendation is separate,
   with reasons above. This decides how much of the epic touches shipped public copy.
2. **"Typed schema" — is §5's reading right**, that no per-variable value type is in scope?
3. **Is a variable inside an `example` blok a use?** — **Ruled 2026-09-13: yes.** *An example is text
   the model sees; if it contains `{{name}}` and `name` is undeclared, the prompt ships a literal
   `"{{name}}"` to a customer. That is the exact defect this epic exists to catch.* The one exclusion
   is an `expected` blok, which compiles to checks and not to text.

   **How that is implemented, which matters more than the list of kinds.** `compile()` already names
   this exact set: EPIC-020 decision 6 makes `expected` *"the only kind that emits no text"*. So the
   predicate is not a second hand-maintained list of kinds in the variables module — it is the
   compiler's own rule, shared. A use is an occurrence **in text that reaches the compiled output**,
   which is the same sentence as the ruling's reason. If a future kind stops emitting text, one
   predicate changes and both follow.
4. **`ARTIFACT_SCHEMA_VERSION` 0 → 1 in this epic**, or leave it at 0 until Stage 5a freezes it?
   Decision 8 says bump; the counter-argument is that nothing reads it yet, and a bump with no reader
   is noise.

   > **Answered by me 2026-09-13, on the advisor's instruction to apply §0's standard: bump to 1.**
   >
   > The standard is "choose the reading that makes the product's claim about itself stay true", and
   > here the product has already made the claim, in `schema.ts`, in an imperative: *"Nothing about v0
   > is a promise. Change it freely until then, and bump `ARTIFACT_SCHEMA_VERSION` when you do."*
   > Adding the variable contract is changing it. Not bumping would leave that sentence false — the
   > same defect as the licence saying "confidential" and the summariser comment saying "never leaves
   > the worker", both corrected this week for the same reason.
   >
   > The "no reader, so it is noise" argument is real but points the other way once you ask *when* it
   > stops being free. A version bump costs nothing precisely **because** nothing reads it yet; the
   > first time it is expensive is the first time it matters, and a habit of skipping it will be
   > established by then. The version field exists so that the first shipped reader can recognise a
   > format it has never seen. A format that changed without the number changing is exactly what that
   > reader cannot recognise.

## 7. Amendments made under the advisor's own judgement (2026-09-13)

**A note on the numbering.** The plan asked four questions. The approval ruled on three of them
(§0, Q1, Q2) and then said "Q3 and Q4, answer them yourself". Only one question was left — the
artifact version, answered above. I have taken "Q4" as the standing instruction it reads like: settle
every other open reading in this plan by the same standard, and write the reasoning down. Flagging
the off-by-one rather than inventing a fifth question to answer.

The remaining open readings, settled:

**Malformed brace forms stay literal and silent** (decision 2 — `{{}}`, `{{ 9lives }}`, `{{ a b }}`,
an unclosed `{{`). The product's claim about itself is that a blok holds someone's writing **verbatim**
(`CLAUDE.md` rule 3) and that the tool is *"specific, quoting or pointing at the text, never scolding"*
(the `Finding` contract). A stray brace in a prompt is not necessarily a mistake, and announcing it as
one would break both claims at once. Unchanged.

**The reserved `type` field does not get a second version bump when it is populated.** It ships in v1
as optional and unused; a later epic filling it in is a field starting to carry data, not a format
change. That is the whole point of adding it now, and saying so here stops a future reader bumping to
2 out of caution.

**The `Assertions` tab label stays out of scope and stays recorded.** The mockup names it; ADR-003
forbids the word; `docs/design/README.md` already carries the correction. This epic ships two tabs and
does not stub the third, so nothing here has to resolve it — but the note stays in decision 9 so
whoever builds Stage 3 meets it before writing the label rather than after.

**Build order is reinforced, not changed.** The advisor: *rename gets its test before its feature, and
it is the one to build first, exactly as EPIC-021a's decision 5 was.* §3's order already puts the
rename test second; the implementation order now puts the rename **feature** first among the features,
ahead of the tab, the issues view and the preview. Everything else in this epic inconveniences
someone; rename is the only one that can destroy what they wrote.
