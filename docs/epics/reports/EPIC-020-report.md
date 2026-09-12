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
`artifact/schema.test.ts` so the two cannot diverge again silently.

**Ruled 2026-09-12 and fixed in this branch at Soroush's instruction:** `CLAUDE.md`'s Naming line now
reads "Build hash: content hash of the compiled artifact", so the file agrees with ADR-003. The only
remaining `sha` in it is the vocabulary rule naming the forbidden word.

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

**Every span carries one, the last included, so the compiled text ends with the separator.** The
alternative — an empty separator on the final span — makes a span's shape depend on where it sits,
and reordering then changes span *widths* rather than only offsets, which contradicts criterion 4 as
written.

`BLOK_SEPARATOR` shipped as `"\n\n"` in `compile@1`, became `"\n"` in `compile@2` when the separator
was ruled to the mockup, and is **`"\n\n"` again in `compile@3`** after that ruling was reversed on
the measurement. §6.2 is the whole exchange, kept rather than tidied.

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

**2. The separator — ruled to the mockup, and here is what it cost.**

The mockup joins spans with `join('\n')` at line 1471; `compile@1` used `"\n\n"`. **Ruled 2026-09-12:
the mockup wins, per `CLAUDE.md`.** Shipped as `compile@2`, fixtures and snapshots regenerated. The
ruling came with an invitation to report back if a single newline makes two adjacent prose bloks read
as one paragraph, so it was measured rather than asserted.

**It does, and there is a second effect that is worse.** Four bloks — two prose, a list, an example:

```
You are a support assistant. You read inbound email and decide what happens next.
Be brief. A reply longer than a screen is a reply nobody reads.
Categories:
- billing
- fraud
- other
Input: charged twice
Output: billing
```

- **The two prose bloks read as one paragraph**, exactly as anticipated. Two separate rules, one
  block of text.
- **The one that was not anticipated: a blok boundary is now indistinguishable from a newline inside
  a blok's own text.** `- other` and `Input: charged twice` are adjacent with nothing between them —
  the example blok's start is invisible, and it reads as more list. With a blank line the boundary
  was recoverable from the text; with a single newline it never is, for any blok containing a
  newline.

**How often that happens, measured on the committed corpus** — `cluster(segment(text))` over the 27
multi-blok fixtures, folded into `PromptBlok`s the way EPIC-021a will:

| | |
|---|---|
| bloks whose own text contains a newline | **25 of 160** |
| prompts with at least one such blok | **14 of 27** |
| bloks whose own text contains a blank line | 5 of 160 |

So in **roughly half the corpus's prompts**, at least one boundary is now unrecoverable from the
compiled text. Under `"\n\n"` only those 5 bloks had the same ambiguity.

**What it does not break.** Spans carry the offsets, so the *product* always knows whose text is
whose — the pane, attribution and drift are unaffected, and every test still passes. What is lost is
structure in the string the **model** receives, which is the part no test can see.

### The ruling was reversed on the measurement (2026-09-12)

Back to a blank line, `compile@3`. Soroush's reasoning, which is the part worth keeping:

> *"The mockup is the spec for what a pane looks like, not for what string the model receives, and it
> plainly did not have the newline-inside-a-blok case in front of it. A boundary the model cannot see,
> on 14 of 27 multi-blok prompts, is a correctness loss that no test can catch, which makes it exactly
> the kind of thing to be conservative about."*

That generalises past this constant and is now written into `docs/design/README.md`'s corrections
section: **the prototypes are the spec for the interface, not for the compiled string.** This is the
first case where following one would have degraded the output, and the compiled pane is where it was
always going to happen — it is the one surface that displays a string a model also reads, and those
two readers want different things.

**The middle option was rejected too, on a harder ground than taste.** `"\n"` normally and `"\n\n"`
where either side contains a newline is deterministic, but it makes a span's separator depend on its
**neighbours**. Two consequences, the second worse than the first:

1. Editing one blok changes the bytes of the span *before* it — breaking "changing one blok changes
   exactly one span", which is `CLAUDE.md` rule 4 and the thing this epic exists to guarantee.
2. That neighbouring span's `hash` would **not** move with its bytes, because `blokHash` covers only
   the blok's own text and kind. A cached span would then be handed back for output that no longer
   matches it — the same stale-cache failure `hash.ts` already rules out for making the separator an
   option, arriving by a different door.

**What the whole exchange cost and bought.** Two `COMPILER_VERSION` bumps and a snapshot regeneration,
which is exactly what that constant is for; and a correction in `docs/design/README.md` that applies
to every prototype and every epic after this one.

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

**Four of these were ruled on 2026-09-12 and are shipped in this branch.** What follows records which,
and what is still open.

### Ruled and done

1. ~~**The separator.**~~ Ruled to the mockup (`compile@2`, single newline), measured, and **reversed
   on the measurement** (`compile@3`, blank line). The prose case was real and a second, larger effect
   was found that nobody had anticipated. The lasting output is not the constant but the correction in
   `docs/design/README.md`: the prototypes are the spec for the interface, not for the compiled
   string. §6.2 has the whole exchange.
2. ~~**`CLAUDE.md`'s "Build sha" line.**~~ Corrected to "Build hash" in this branch, per §3.4.
3. ~~**The band heading and its guard.**~~ Not this epic's, but shipped alongside it. Settled at
   **"Prompts often have rules nothing checks."** after three corrections, and asserted by text in
   `page.test.tsx`. `docs/reports/host-split-report.md` carries why that guard is narrower than it
   looks, and the pattern behind the three corrections: **the count was right every time and the
   quantifier was wrong every time.**

### Carried into EPIC-021b as named requirements

4. **Adding a blok to a prompt that has hand-edited spans**, and **the mockup's banner expressing only
   one of the two states the model distinguishes**. Both are pane decisions, both are written up with
   their candidates in **`docs/epics/notes-EPIC-021b.md`**, per the same ruling. The first is the one
   to be careful with: the failure is silent — the pane recompiles, the text looks right, and the
   sentence somebody wrote is gone.

### Still open

5. **Multimodal bloks in a text compile.** `image_ref` and `image_input` currently emit their text
   verbatim, which is the safe default — the alternative is the compiler deleting what the author
   wrote. But a real multimodal prompt is message *parts*, not one string, and no epic owns that yet.
   It will matter by EPIC-042 at the latest.
6. **`Check.kind` derivation is provisional.** EPIC-030 owns the check model and may replace it
   entirely; the kindless checks are the obvious work for EPIC-033's pinned judge.
7. **`packages/core` is not covered by the forbidden-word grep**, which runs over `packages/ui/src`,
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
