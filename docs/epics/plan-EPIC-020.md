<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: Apache-2.0
-->

# Plan — EPIC-020: Blok model and per-blok compiler

Read `docs/epics/CURRENT.md` (mirror of `docs/epics/EPIC-020-compiler.md`) first. This plan says how,
and names the four places where the epic's sketch cannot be followed literally and what is done
instead.

---

## 0. The two facts, decided before anything is typed

The epic's note calls this the thing to get right and the easiest to blur, so it is settled here and
everything else is built to serve it.

There are **two independent facts** about a span, and a model with one flag cannot hold both:

| fact | how it is computed | what it means |
|---|---|---|
| **`textDiffersFromBlok`** | `renderBlok(blok) !== compiled.text.slice(span.start, span.textEnd)` | what is in the output is not what this blok compiles to *right now* |
| **`blokChangedSinceSpan`** | `blokHash(blok) !== span.hash` | the blok has moved on since this span was compiled or edited |

They are independent, and the proof is not hypothetical in either direction:

- **True, false.** A span edited by hand whose blok nobody has touched. The output differs from the
  blok; the blok has not changed.
- **False, true.** A blok reclassified `context` → `constraint`. The hash covers kind, so it changes;
  the rendered text is byte-identical, so the output still matches. A model keyed on "does the text
  match" would call this in sync and never invalidate the cached span.
- **True, true.** The case the epic is about: someone edited a span by hand, and *then* the blok
  changed. The UI must say both things, and "edited by hand" alone is a lie of omission.
- **False, false.** In sync.

`drift()` therefore reports **two booleans and the span's `state`**, not one enum and not a state
machine. `state` is needed as well as the booleans because *(edited by hand, blok changed)* and
*(compiled, blok changed)* have the same two booleans and are different sentences on screen: one is
"you changed this and the blok has since changed too", the other is "this is out of date".

Three fields, no stored drift, no events. If this triple turns out not to express a state the UI
needs, that is a finding for the report, not something to paper over.

## 1. Order of work — the invariant first

The epic and Soroush both say this explicitly, so it is a commit boundary and the history is the
evidence:

1. `compile/invariants.ts` + its test, **committed before `compile.ts` exists**.
2. Types and the hash.
3. `compile()`, until the invariant test passes over fixtures and generated blok sets.
4. `editSpan`, `updateFromBlok`, `drift`.
5. Checks and artifact schema v0.
6. The EPIC-011b tripwire made real.
7. Fixtures, snapshots, property tests, perf.
8. README, exports, report, session log.

## 2. The model

### `PromptBlok` — and why it is not `Blok`

```ts
interface PromptBlok {
  readonly id: string;        // stable across edits, supplied by the caller
  readonly kind: BlokKind;    // the same six
  readonly text: string;      // verbatim; the compiler never rewords it
  readonly order: number;     // explicit, not array position (decision 10)
}
```

`Blok` is taken, by the decompiler's blok — `{ id, kind, ranges }`, ranges into a source it does not
own, with a **content-derived** id so that re-decompiling the same prompt yields the same ids.

That id rule is exactly wrong for an editable blok. A canvas blok's identity must survive its text
changing, because a span refers to it; a content-derived id would make every keystroke a new blok and
orphan the span. These are two different things and the names must say so. `PromptBlok` is the blok
as a thing in a prompt, owning its own text and its place in the order.

**Deviation 1 from the epic**, which writes `compile(bloks: Blok[], …)`. Renaming the shipped `Blok`
would break EPIC-013. Flagged in the report.

### `CompiledSpan`, and who owns the separator

```ts
type SpanState = "compiled" | "edited by hand";

interface CompiledSpan {
  readonly blokId: string;
  readonly start: number;     // inclusive, UTF-16 code units into `text`
  readonly textEnd: number;   // end of this blok's own text
  readonly end: number;       // exclusive; [textEnd, end) is the separator the compiler added
  readonly hash: string;
  readonly state: SpanState;
}
```

**Deviation 2**: ADR-003 names the type `CompiledSpan`; the epic's sketch says `Span`. The ADR wins
over an epic sketch, and an epic is not the place a decision record gets quietly renamed.

**The separator has to belong to somebody.** Spans tile `text` with no gaps, and the compiler joins
bloks with `"\n\n"`, so either a span covers its separator or the invariant is false on the first
two-blok prompt. Each span owns **the separator that follows it**, and `textEnd` marks where the
blok's own text stops — so "this blok's verbatim text" is `[start, textEnd)` and stays nameable.

**Every span carries a trailing separator, including the last**, so `text` ends with `"\n\n"`. The
alternative — an empty separator on the final span — makes a span's shape depend on where it sits,
and then reordering changes span *widths*, not just offsets, which contradicts the reorder criterion
as written. A trailing blank line on a system prompt is harmless; a rule with an exception in it is
not. Recorded in the report as a visible consequence, not hidden.

### `Compiled`

```ts
interface Compiled {
  readonly text: string;
  readonly spans: readonly CompiledSpan[];
  readonly checks: readonly Check[];
}
```

### `Check`

Eight kinds, from ADR-003, with internal identifiers that never render and a phrase table that does:

```ts
type CheckKind =
  | "json_shape" | "allowed_values" | "word_limit" | "character_limit"
  | "must_contain" | "must_not_contain" | "matches_pattern" | "refuses_to_answer";
```

Listed as a `const` array with the same compile-time exhaustiveness guard `FINDING_KINDS` uses, and a
test asserting the eight phrases are ADR-003's verbatim. **CLAUDE.md records why**: this list was
shown as four, taken for the set, and EPIC-012b went looking for a phrase that was there all along.
A list that can drift from its ADR gets a test.

```ts
interface Check {
  readonly id: string;         // content-derived, stable, shareable
  readonly blokId: string;
  readonly text: string;       // the expected blok's verbatim text
  readonly kind?: CheckKind;   // absent when no shape names it
}
```

`kind` is **optional on purpose**. The kind is derived from `rule-shapes.json` — already committed,
already tested, and already the map from rule text to the check that would cover it. When no shape
matches there is no honest kind to give: inventing a ninth ("a judge decides") would contradict
ADR-003 and CLAUDE.md, and defaulting to `must_contain` would assert a substring nobody wrote. EPIC-030
owns the real check model and can narrow this; EPIC-033's judge is the obvious home for the kindless
ones. Marked provisional in the file.

## 3. The invariant

`checkCompiledInvariants(compiled, bloks?)` → `InvariantViolation[]`, reusing the type
`checkSegmentInvariants` and `checkBlokInvariants` return, exported for the same reason: EPIC-021b and
EPIC-050 check themselves against this list rather than inventing their own idea of a well-formed
compiled prompt.

What it re-derives:

- `spans[0].start === 0`; `spans[n-1].end === text.length`; `spans[k].end === spans[k+1].start`.
  No gaps, no overlaps, in order.
- `start <= textEnd <= end` for every span.
- Every span's `blokId` is unique, and names a blok that exists (when `bloks` is given).
- Every emitting blok has exactly one span; every `expected` blok has none.
- `[start, textEnd)` of a `compiled` span equals that blok's verbatim text (when `bloks` is given).
- Offsets are integers within `[0, text.length]`.
- An empty blok set compiles to `""` with no spans — the degenerate tiling, which holds vacuously and
  is asserted rather than assumed.

Written and committed **before** `compile.ts`.

## 4. The hash and the compiler version

`COMPILER_VERSION = "compile@1"`, alongside `HEURISTIC_SUMMARISER_VERSION = "heuristic@1"`.

`blokHash(blok)` covers **the blok's verbatim text, its kind, and `COMPILER_VERSION`** — decision 4,
taken literally. Same FNV-1a×2 construction as `summaryInputHash` and `cluster`'s ids: sixty-four
bits, because thirty-two is a birthday collision at a few thousand keys and a colliding cache key
hands back another blok's text.

Deliberately **not** in the hash: `order`, and the blok's position. Reordering must not invalidate a
single cached span — that is what makes the reorder criterion true rather than nearly true.

The **separator is a compiler constant, not an option**, precisely because it is not in the hash: an
option that changes every span's output while leaving every cache key alone is a stale-cache
generator. If the separator ever changes, `COMPILER_VERSION` changes with it, which invalidates
everything in one move.

`CompileOptions = { cache?: Map<string, string> }` — hash → rendered text, owned by the caller, so
`compile` stays pure and the cache is observable in tests.

## 5. `compile(bloks, options?)`

1. Sort by `order` ascending, ties by `id` lexicographically. Determinism must not depend on the
   caller's array order.
2. Reject duplicate ids with a clear error — two bloks with one id makes `editSpan` ambiguous.
3. For each blok: `expected` → a `Check`, no span, no text. Everything else → `renderBlok(blok)`,
   which today **returns `blok.text` unchanged**.
4. Append the separator, record the span, accumulate offsets.

**Rendering is identity in v0, and that is a decision.** The epic gives the compiler "ordering,
separators, and the rendering of structure". Ordering and separators are here. Decoration — a heading
per kind, a list marker — adds text nobody wrote, cannot be judged without a pane to see it in
(EPIC-021b), and would make the verbatim property something to argue about instead of something to
prove. `renderBlok` exists as the seam; it does nothing yet, and the README says so.

**Exactly one kind emits no text, and it is the one the epic names.** `image_ref` and `image_input`
emit their text verbatim like everything else. Dropping their text would be the compiler deleting
what the author wrote, which is worse than the multimodal assembly question being left open — that
question belongs to whoever builds message parts, and is listed in the report.

## 6. `editSpan(compiled, blokId, newText)`

Replaces `[start, textEnd)`, keeps the separator, shifts every later span's offsets by the delta,
sets `state: "edited by hand"`, and **keeps `hash` exactly as it was**. That retained hash is the
whole mechanism behind fact two: it records which version of the blok the person was looking at.

Returns a new `Compiled`; never mutates. Throws on an unknown `blokId` or on a blok with no span —
that is a programmer error, and returning the input unchanged would hide it.

## 7. `updateFromBlok(compiled, bloks, blokId)`

**Deviation 3, and it is a correction rather than a preference.** The epic writes
`updateFromBlok(compiled, blokId)`. That cannot work: `Compiled` holds hashes, not blok text, so there
is nothing to recompile from. The blok set is a required argument.

Recompiles that one span, sets `state: "compiled"`, sets `hash` to the blok's current hash, shifts
later offsets. No other span's text, hash or state changes — which is what "nothing else moves" can
mean, since later offsets must shift whenever a span's length changes. Stated plainly in the README so
it is not read as more than it is.

Throws when the blok has no span. Inserting a span for a blok added since the compile is not an
update, it is a compile.

## 8. `drift(compiled, bloks)`

```ts
interface SpanDrift {
  readonly blokId: string;
  readonly state: SpanState;
  readonly textDiffersFromBlok: boolean;
  readonly blokChangedSinceSpan: boolean;
}
interface DriftReport {
  readonly spans: readonly SpanDrift[];
  readonly addedBlokIds: readonly string[];    // emit text, have no span
  readonly removedBlokIds: readonly string[];  // have a span, no longer in the blok set
}
```

Pure: no clock, no global, no IO, no memo. Added and removed bloks are reported rather than thrown on,
because a UI asking "what is stale" during an edit is the normal case, not an error.

`expected` bloks are **not** in `addedBlokIds` — they legitimately have no span, and a report that
listed all of them as missing would be noise that trains people to ignore it.

## 9. Artifact schema v0

`packages/core/src/artifact/schema.ts`: `ARTIFACT_SCHEMA_VERSION = 0` on the first lines, the shape,
and a comment saying in as many words that it is **not frozen until Stage 5a** and what EPIC-050 still
has to decide.

The build hash field is named **`buildHash`**, not `buildSha`. CLAUDE.md's Naming section says "Build
sha: content hash of the compiled artifact" and its Vocabulary section forbids `sha` in schema and
code identifiers. The two lines disagree; the vocabulary rule is the one with a grep behind it.
Flagged in the report rather than resolved unilaterally.

## 10. Tests

**Property tests** (`makeRandom(seed)`, no `Math.random`, no `Date` — a failure reproduces from its
seed forever):

- Tiling holds over 1,000 generated blok sets and every fixture.
- Every blok's text appears in the output unmodified.
- One blok's text changed ⇒ exactly one span differs; the others are byte-identical with unchanged
  hashes; the cache served them.
- Reorder ⇒ same span set, same hashes, same widths, new offsets.
- 100 compiles byte-identical, hashes included.
- `drift` called 100× on one input returns identical reports.

**Fixtures**, with committed text snapshots in the style `detect/fixtures/snapshots` uses:
five-blok prompt; a multi-range decompiled blok folded into one `PromptBlok` and one span; only
`expected`; one hand-edited span; a reorder.

**The two facts get two named tests**, because the criterion asks for two:
`a span edited by hand differs from its blok while the blok has not changed` and
`the blok changed after the edit, and that is a different fact from the text differing`. Plus the
`context` → `constraint` test, where the text does *not* differ and the hash does.

**The tripwire**: `summarise/never-compiled.test.ts` is rewritten to what its own `WHAT_TO_DO` text
demands — verbatim spans present, no summary text for any blok from any summariser, including the
multi-range case where the summary reads "Rule stated in 2 places" and looks nothing like the source.

**Perf**: 200 bloks under 50 ms, measured with the minimum of several runs and the headroom ratio
logged. `docs/PROCESS.md` is clear that an absolute millisecond budget on a shared runner measures the
runner; this one is kept as an assertion only because the expected headroom is two to three orders of
magnitude, and the report states the measured ratio so the next person can judge it rather than guess.

## 11. Exports, docs, boundaries

`compile`, `editSpan`, `updateFromBlok`, `drift`, `checkCompiledInvariants`, `blokHash`,
`COMPILER_VERSION`, `BLOK_SEPARATOR`, `CHECK_KINDS`, `CHECK_KIND_PHRASES` and every type, from
`packages/core/src/index.ts`. **Zero new dependencies.** SPDX headers on every new file.
`compile/README.md` explains the two representations, why the blok set wins, who owns the separator,
and the four-cell table from §0.

## 12. What would make this a BLOCKER

Nothing so far. The three deviations are naming and a missing argument, all decidable here and all
recorded. If the four-cell model turns out not to express a state the mockup needs, that goes in the
report as the epic asks — not into a fifth field invented on the way past.
