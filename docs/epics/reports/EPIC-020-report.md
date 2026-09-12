<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# EPIC-020 report — Blok model and per-blok compiler

Date: 2026-09-12 · Branch `epic/020-compiler` · Stage 2 begins

---

## 1. The thing this epic was about, and what it resolved to

> *"The distinction between 'this span no longer matches the blok' and 'the blok changed after
> someone edited this span' is the thing to get right; if the model cannot express both, the model is
> wrong and you should say so rather than blur them."*

**The model can express both, and it needs three fields to do it — not one flag, and not two.**

| field | computed from | means |
|---|---|---|
| `textDiffersFromBlok` | the span's text against what the blok compiles to **now** | what is in the output is not what this blok says |
| `blokChangedSinceSpan` | the blok's hash against **the hash the span kept** | the blok has moved on since this span was compiled or edited |
| `state` | recorded at edit time | whether a person has taken this span |

### Why two booleans and not one

All four combinations are reachable, and one of them is the proof that a single "out of date" flag is
wrong rather than merely coarse:

| differs | changed | reachable how | what the reader is told |
|---|---|---|---|
| no | no | nothing has happened | nothing |
| yes | no | a span edited by hand whose blok nobody touched | "edited by hand" |
| **no** | **yes** | **a blok reclassified `context` → `constraint`** | the cached span is addressed by a hash that no longer exists |
| yes | yes | edited by hand, then the blok changed | "you edited this, **and** the blok has changed since" |

The third row is the one that settles it. `blokHash` covers the blok's kind, so reclassifying moves
the hash; `render` is the identity function on text, so the compiled output is **byte-identical**. A
model keyed on "does the text still match" calls that in sync and serves a stale cache entry for
ever. Test: `a blok whose kind changed has a stale hash and identical text — the fourth cell`.

### Why `state` as well

The last two rows of the table above have **identical booleans** and are different sentences:

- *(edited by hand, differs, changed)* → "you changed this, and the blok has changed since"
- *(compiled, differs, changed)* → "this is out of date"

So the state is in the report. Two tests are named for criterion 5 as the epic asks:
`a span edited by hand differs from its blok, while the blok has not changed` and
`the blok changed after the edit, which is a different fact from the text differing`. A third,
`a compiled span whose blok's text changed reports both, and is a different row from an edited one`,
asserts the two boolean pairs are equal and the states are not — which is the case for the field.

**The mechanism is one line in `editSpan`: the span keeps the hash it was compiled from.** That
retained value records which version of the blok the person was looking at when they typed.
Recomputing it, or dropping it, collapses the two facts into one.

All four cells sit together in one committed snapshot,
`fixtures/snapshots/one-blok-edited-by-hand.snap.txt`:

```
## drift
  b1  compiled        text differs: false  blok changed since: true
  b2  edited by hand  text differs: true   blok changed since: false
  b3  compiled        text differs: true   blok changed since: true
  b4  compiled        text differs: false  blok changed since: false
```

---

## 2. The invariant, written first

`compile/invariants.ts` and its 19 cases were **committed before `compile.ts` existed** — commit
`265cca9`, one commit before `3391642`. The history is the evidence, and it is the same sequencing
EPIC-011a used when the false-merge fixture came before the merge rule.

What a gap actually costs, which is why it was worth the ordering: it is not a crash. It is a
character of the compiled prompt belonging to no blok, so EPIC-021b renders it unattributed,
EPIC-032 attributes a failing check to the wrong rule, and EPIC-040's diff drifts by one. Nothing
throws. The product is quietly wrong about whose text it is showing.

`checkCompiledInvariants` is exported, like `checkSegmentInvariants` and `checkBlokInvariants`, so
later epics check themselves against this list rather than inventing their own.

**An unplanned benefit.** The invariant re-derives, from the output alone, that every `compiled` span
is its blok's **verbatim** text. That makes `CLAUDE.md` rule 3 mechanical rather than tested after
the fact: a compiler that emitted a summary fails over every fixture and all 1,000 generated blok
sets at once, not only in the cases somebody thought to write.

---

## 3. Four places the epic's sketch could not be followed literally

Each was decided in the plan before implementation, not discovered in review.

### 3.1 `PromptBlok`, not `Blok`

`Blok` is taken by the decompiler's blok: a kind and a set of ranges into a source it does not own,
with a **content-derived** id so that decompiling the same prompt twice yields the same ids.

That id rule is exactly wrong for an editable blok. A canvas blok's identity must survive its text
changing, because a `CompiledSpan` refers to it by id; a content-derived id would make every
keystroke a different blok and orphan its span. Renaming the shipped `Blok` would break EPIC-013, so
the new type is `PromptBlok` — `{ id, kind, text, order }`, with a caller-supplied opaque id.

### 3.2 `CompiledSpan`, not `Span`

ADR-003 names the type: *"Types: `Blok`, `CompiledSpan`, `Range`."* The epic's sketch says `Span`. An
epic is not where a decision record gets quietly renamed.

### 3.3 `updateFromBlok` takes the blok set — a correction, not a preference

The epic writes `updateFromBlok(compiled, blokId)`. **That signature cannot work.** `Compiled` holds
hashes, not blok text, so there is nothing in it to recompile *from*. The shipped signature is
`updateFromBlok(compiled, bloks, blokId)`.

### 3.4 `buildHash`, not `buildSha` — and `CLAUDE.md` disagrees with itself here

Its **Naming** section says *"Build sha: content hash of the compiled artifact."* Its **Vocabulary**
section forbids `sha` "in UI strings, schema, or code identifiers". Both cannot be followed.

The vocabulary rule wins here: it is what ADR-003 actually decided and the one with a grep behind it,
and the Naming line reads like a description of the concept that predates it. Asserted in
`artifact/schema.test.ts` so the two cannot diverge again silently. **This is a `CLAUDE.md` edit for
Soroush, not for me** — the file is his.

---

## 4. Decisions made inside the epic's latitude

### The separator belongs to the span before it

Spans tile the text, so the `"\n\n"` between two bloks has to belong to somebody. It belongs to the
span before it, with `textEnd` marking the boundary:

```
 0        55  57                83  85
 |─────────|──|─────────────────|──|
 │ blok text │sep│  blok text   │sep│
 └─ start   └─ textEnd       └─ end
```

`text.slice(start, textEnd)` is the blok's verbatim text; `text.slice(start, end)` is its whole
contribution. `editSpan` replaces only the first, so a caller never handles a separator.

**Every span carries one, the last included, so the compiled text ends with a blank line.** The
alternative — an empty separator on the final span — makes a span's shape depend on where it sits,
and reordering then changes span *widths* rather than only offsets, which contradicts criterion 4 as
written. The trailing blank line is the visible cost and it is the smaller one.

### `render()` is the identity function in v0

The epic gives the compiler "ordering, separators, and the rendering of structure". The first two are
built. The third is deliberately nothing: a heading per kind or a list marker adds text nobody wrote,
cannot be judged without a pane to see it in (EPIC-021b), and would turn "the compiler emits blok
text verbatim" from something provable into something to argue about. The seam exists; adding to it
later is one function and one `COMPILER_VERSION` bump.

### Exactly one kind emits no text

`expected`, as decision 6 says. `image_ref` and `image_input` emit their text like everything else —
dropping it would be the compiler deleting what the author wrote. Multimodal message-part assembly is
a real open question and belongs to whoever builds message parts; it is listed in §8.

### `order` is not in the hash

Deliberately. Moving a rule up the canvas does not change what the rule says, so it must not
invalidate a cached span. This is what makes criterion 4 exactly true rather than nearly true.

### `Check.kind` is optional, and absent rather than defaulted

Kinds are derived from `detect/rule-shapes.json` — already committed, already tested, and already the
map from rule text to the check that would cover it, so the decompiler and the compiler cannot
disagree about what a rule needs. When no shape matches there is no honest answer, and both ways of
manufacturing one are worse:

- a **ninth kind** ("a judge decides") contradicts ADR-003 and `CLAUDE.md`, which fix the set at
  eight — and `CLAUDE.md` records what happened the last time that list was treated casually;
- a **default of `must_contain`** asserts a substring nobody wrote, which fails a publish for a
  reason the author never gave.

The eight get an exhaustiveness guard and a test that the phrases are ADR-003's verbatim, written out
rather than read back from the table being checked.

---

## 5. Acceptance criteria

- [x] **`compile`, `editSpan`, `updateFromBlok`, `drift` and their types exported; zero new
      dependencies.** Evidence: `packages/core/package.json` has **no diff in this epic** — that is
      the evidence for "zero new dependencies". Exports in `src/index.ts`.
- [x] **Spans tile the compiled text exactly, over every fixture and 1,000 generated blok sets.**
      Evidence: `the span-tiling invariant > holds over 1,000 generated blok sets`, plus
      `holds for the <name> fixture` × 8 and `holds for the empty blok set, where it holds vacuously`.
- [x] **Changing one blok's text recompiles exactly one span.** Evidence: `one blok changes, one span
      changes > recompiles exactly one span; the others are byte-identical and keep their hashes`,
      the generated-input version over 200 seeds, and the fixture diff:

      ```
      -    57..  83..  85  compiled  b09c43513a16f018  "Reply in at most 80 words."
      +    57..  84..  86  compiled  ce3f10fbec911f16  "Reply in at most 120 words."
      -    85.. 142.. 144  compiled  6436615fcc7fcfb9  "Never promise a refund. …"
      +    86.. 143.. 145  compiled  6436615fcc7fcfb9  "Never promise a refund. …"
      ```

      One hash changed. The others kept theirs and only moved.
- [x] **Reordering changes offsets and nothing else.** Evidence: `reordering > changes offsets and
      nothing else: the same spans, same hashes, same widths`, `reuses every cached span across a
      reorder`, and the fixture diff — `b09c43513a16f018` and `6436615fcc7fcfb9` appear in both, with
      identical widths (26 + 2 and 57 + 2) at swapped offsets.
- [x] **A hand-edited span reports `state: "edited by hand"`, and the two facts are distinguishable.**
      Evidence: the two named tests in §1, plus the third that shows identical booleans with different
      states.
- [x] **`updateFromBlok` returns exactly that span to `"compiled"` and touches nothing else.**
      Evidence: `updateFromBlok > returns exactly that span to compiled and touches no other span's
      text, hash or state`. "Nothing else moves" is read as text/hash/state, since later offsets must
      shift when a span's length changes; stated in the code and the README.
- [x] **`drift` is pure.** Evidence: `is pure: 100 calls on the same input return identical reports`
      and `is pure: it does not mutate the compiled prompt or the blok set it is given`. No clock, no
      global, no module state, no memo — `drift.ts` has no imports beyond `blokHash` and types.
- [x] **An all-`expected` prompt compiles to an empty string plus checks, without throwing.**
      Evidence: fixture `only-expected`, snapshot `only-expected.snap.txt` (`""`, no spans, 4 checks),
      test `compiles an all-expected prompt to an empty string plus checks, without throwing`.
- [x] **No summary text in any compiled output; the EPIC-011b placeholder is now real.** Evidence:
      five tests in `summarise/never-compiled.test.ts`, including the multi-range case its own
      instructions singled out, and a guard so the loop cannot pass vacuously.
- [x] **The compiler emits blok text verbatim.** Evidence: `puts every blok's text in the output
      unmodified, over 1,000 generated blok sets`, plus the `awkward-text` fixture (astral emoji,
      combining mark, RTL, a blok containing a separator, a one-character blok).
- [x] **`schema.ts` carries a version field and says it is not frozen until Stage 5a.** Evidence:
      `ARTIFACT_SCHEMA_VERSION = 0` on the first lines; test `says in the file that it is not frozen
      until Stage 5a` reads the source and fails if the sentence goes.
- [x] **Determinism: 100 compiles byte-identical including hashes.** Evidence: `determinism >
      produces byte-identical output and hashes over 100 compiles` and `does not depend on the order
      the array arrived in`.
- [x] **200 bloks compile in under 50 ms, reported with headroom.** Measured:

      ```
      compile(200 bloks): 0.428 ms — 117x headroom on a 50 ms budget
      compile(200 bloks, warm cache): 0.456 ms
      drift(200 bloks): 0.433 ms
      ```

      Logged on every run. See §7 for why this one still asserts when `PROCESS.md` demoted others.
- [x] **`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm compliance`, `pnpm binary-files` clean.**
      `pnpm test`: 8/8 packages, core 468 tests. See §9.
- [x] **Report and session log written; backlog updated.**

---

## 6. Where this model and the mockup disagree

The epic asks for this explicitly. `docs/design/41prompts-full-mockup.html`, editor page:

**1. The mockup's banner is narrower than the model, not wider.** It shows one line:
`Blok 4 edited by hand · compiler released this block · Reconcile`. That expresses exactly one of the
two facts — the span was taken by hand — and has no way to say "and the blok has changed since". The
model can say both; the pane will need two states where the mockup drew one. (Its wording is also
pre-ADR-003: "Reconcile" is now "Update from blok", "block" is "blok", and the `drifted` badge on
`b4` is now "edited by hand".)

**2. The mockup joins spans with a single newline; the compiler uses a blank line.**
`join('\n')` at line 1471 against `BLOK_SEPARATOR = "\n\n"`. `CLAUDE.md` says the mockups are the
spec, so this is flagged rather than assumed: a single newline lets two separate rules read as one
paragraph in the prompt the model actually receives, and a blank line between sections is the
convention in every prompt in our own corpus. **One constant and one `COMPILER_VERSION` bump if
Soroush rules the other way.**

**3. What the mockup gets right and the model preserves.** Its bloks carry both a short `txt` (the
card) and a longer `span` (the compiled text), and they differ — the card shows a summary, the pane
shows the source. That is EPIC-011b's rule drawn correctly, and it is why `PromptBlok.text` is the
verbatim text with the summary kept as separate metadata. Its `b6` is `expected` with `span: null`,
which is decision 6 exactly.

Nothing in the mockup implies a state this model cannot represent.

---

## 7. The perf gate, and why it still asserts

`PROCESS.md` demoted three absolute millisecond budgets after one failed CI at 106.6 ms against 100
on the *minimum* of ten warm runs — an absolute budget on a shared runner measures the runner.

This one asserts because the headroom is **117×, not 1.07×**, and the measured number is logged on
every run so the margin is visible rather than taken on trust. If it ever flakes, the answer is the
one `PROCESS.md` already gives: demote it to a reported number, do not widen the bar.

**What that would cost, stated now:** `compile` is linear by construction and has no growth exponent
worth measuring, so this number is the *only* thing that would catch a constant-factor regression.

**One measurement that came out flat, recorded rather than dressed up.** A warm cache is not faster
(0.456 ms against 0.428 ms). `render` is the identity function in v0, so a cache hit returns the same
string a miss would have, after a `Map` lookup. The cache is there for when `render` does work, and
for the *correctness* property `compile.test.ts` asserts — that changing one blok adds exactly one
entry. The test name says so rather than implying a speed-up nobody measured.

---

## 8. Open questions

1. **Adding a blok to a prompt that has hand-edited spans has no answer.** `compile()` is a fresh
   compile and returns fully `compiled` spans, so calling it again discards hand edits;
   `updateFromBlok` only ever touches a span that already exists. Within this package that is
   correct — decision 8 says there is no merge — but EPIC-021b will hit it the first time somebody
   adds a card to a prompt they have edited by hand. Two candidates, neither built here because the
   choice is about the pane and this epic's scope is the model: `compile(bloks, { keep: previous })`
   carrying hand-edited spans forward by blok id, or the pane replaying its edits after a recompile.
2. **The separator, per §6.2.** A ruling, please.
3. **`CLAUDE.md`'s "Build sha" line**, per §3.4. It contradicts the vocabulary rule in the same file.
4. **Multimodal bloks in a text compile.** `image_ref` and `image_input` currently emit their text
   verbatim, which is the safe default — the alternative is the compiler deleting what the author
   wrote. But a real multimodal prompt is message *parts*, not one string, and no epic owns that yet.
   It will matter by EPIC-042 at the latest.
5. **`Check.kind` derivation is provisional.** EPIC-030 owns the check model and may replace it
   entirely; the kindless checks are the obvious work for EPIC-033's pinned judge.
6. **`packages/core` is not covered by the forbidden-word grep**, which runs over `packages/ui/src`,
   `apps/web/app` and `apps/web/lib`. That is defensible — core has no UI strings — but the ADR-003
   vocabulary applies to code identifiers too, and nothing mechanical enforces it here. This epic's
   new files were checked by hand.

---

## 9. Verify

```
pnpm --filter @41prompts/core test        # 26 files, 468 tests
pnpm test && pnpm typecheck && pnpm lint && pnpm compliance && pnpm binary-files
```

`.env` must be sourced (`set -a && . ./.env && set +a`) or `apps/web`'s two rate-limit tests fail on
a missing `DATABASE_URL`. That is the documented local requirement, not an environmental excuse: the
tests build a real Better Auth instance, and they pass with it sourced.

Last run, all five clean:

```
Tasks: 8 successful, 8 total          (pnpm test — core 468, web 215, ui 72, worker 57, db 33, …)
Tasks: 8 successful, 8 total          (pnpm typecheck)
Checked 402 files in 8 packages, no issues found   (pnpm lint + dependency-cruiser)
Forbidden-word grep clean (packages/ui/src, apps/web/app, apps/web/lib)
[mirror-dry-run] OK -- the public-only tree installs and tests standalone
No tracked source file under packages, apps is binary (386 checked)
```

---

## 10. Not done, and why

1. **No UI.** Out of scope by name (EPIC-021a, EPIC-021b).
2. **No database work.** The `PromptBlok` shape is what EPIC-021a will persist; the Drizzle tables are
   that epic's.
3. **No `{{placeholder}}` extraction** (EPIC-022), **no check execution** (EPIC-030), **no versions or
   diffing** (EPIC-040), **no publishing** (Stage 5a).
4. **No `keep` option on `compile()`**, per §8.1 — an API nobody has asked for, for a decision that
   belongs to the pane.
