<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: Apache-2.0
-->

# The compiler

```ts
compile(bloks: readonly PromptBlok[], options?: CompileOptions): Compiled
editSpan(compiled: Compiled, blokId: string, newText: string): Compiled
updateFromBlok(compiled: Compiled, bloks: readonly PromptBlok[], blokId: string): Compiled
drift(compiled: Compiled, bloks: readonly PromptBlok[]): DriftReport
checkCompiledInvariants(compiled: Compiled, bloks?: readonly PromptBlok[]): InvariantViolation[]
```

## Two representations, and which one wins

A prompt exists twice at once: as a **blok set** somebody edits, and as the **compiled prompt** a
model is sent. They have to stay in step while a person edits either one, and drift between them
is not an edge case — it is the normal state a few seconds after anyone types.

**The blok set is the source of truth. The compiled prompt is derived.** That is the decision every
other one here follows from, and the reason is that the alternative does not survive contact with a
second editor: two sources of truth need a merge, a merge needs a conflict rule, and a conflict rule
over prose is a coin flip presented as a feature. There is no merge anywhere in this package.

A span **edited by hand** is not a second source of truth. It is an exception the model *records* —
the compiled prompt remembers that a person took this span, and remembers which version of the blok
they were looking at. `updateFromBlok` is the only way back, and it replaces rather than merges.

## Who owns which characters

Spans **tile** the compiled text: no gaps, no overlaps, the first starting at 0 and the last ending
at `text.length`. `invariants.ts` was written before the compiler and explains what a gap costs — it
is not a crash, it is a character of the prompt belonging to no blok, which makes the pane render it
unattributed and the failure attribute to the wrong rule.

The compiler joins bloks with `BLOK_SEPARATOR`, so those characters have to belong to somebody:

```
 0        55  57                83  85
 |─────────|──|─────────────────|──|
 │ blok text │sep│  blok text   │sep│
 └─ start   └─ textEnd       └─ end
```

Each span owns **its blok's text and the separator that follows it**, with `textEnd` as the boundary.
`text.slice(start, textEnd)` is the blok's verbatim text; `text.slice(start, end)` is its whole
contribution.

**Every span carries a separator, the last one included**, so the compiled text ends with one. The
alternative — no separator on the final span — makes a span's shape depend on where it sits, and
reordering would then change span *widths* rather than only offsets.

`BLOK_SEPARATOR` is **a blank line**. It was a single newline in `compile@2`, matching the mockup's
compiled pane, and that was reversed in `compile@3`: a single newline makes a blok boundary
indistinguishable from a newline inside a blok's own text, on 14 of the corpus's 27 multi-blok
prompts. `hash.ts` carries the measurement and why the obvious middle option is unsound. The
three-version history is itself the argument for having `COMPILER_VERSION`.

## The two facts a span carries

This is the part that is easy to blur, and blurring it is how the UI ends up lying to somebody.

| | computed from | means |
|---|---|---|
| `textDiffersFromBlok` | the span's text vs. what the blok compiles to **now** | what is in the output is not what this blok says |
| `blokChangedSinceSpan` | the blok's hash vs. **the hash the span kept** | the blok has moved on since this span was compiled or edited |

All four combinations happen:

| differs | changed | state | what the reader is told |
|---|---|---|---|
| no | no | compiled | nothing |
| yes | no | edited by hand | "edited by hand" |
| **no** | **yes** | compiled | the blok's *kind* changed and its text did not — the cached span is addressed by a hash that no longer exists |
| yes | yes | edited by hand | "you edited this, **and** the blok has changed since" |
| yes | yes | compiled | "this is out of date" |

The third row is what rules out collapsing the two into one flag: a model keyed on "does the text
still match" calls it in sync. The last two rows are why `state` is reported alongside the booleans —
identical booleans, different sentences.

`editSpan` keeping the span's **existing** hash is the entire mechanism behind the second fact. It
records which version of the blok the person was looking at when they typed.

## Drift is a query

`drift()` is a pure function over hashes, called when something needs to know. No background process,
no invalidation events, no subscriptions, no stored drift. The moment drift becomes stored state, two
things can disagree about it and the one that is wrong is invisible.

## What the compiler decides, and what it never touches

**Ordering** (by `order`, ties broken by `id`) and **separators**. Never wording: a blok's text is
emitted byte for byte, and a summary never reaches the output — `checkCompiledInvariants` re-derives
that from the result alone, so it holds for every input rather than for the ones under test.

`render()` is the seam for structure and is **the identity function in v0**. A heading per kind or a
list marker adds text nobody wrote and cannot be judged without a pane to see it in. Adding it later
is one function and one `COMPILER_VERSION` bump.

**Exactly one kind emits no text**: `expected`, which compiles to a `Check` instead. A prompt whose
bloks are all `expected` compiles to `""` plus a list of checks, and that is correct, not an error.
`image_ref` and `image_input` emit their text like everything else — dropping it would be the
compiler deleting what the author wrote.

## Caching

`blokHash` covers **the blok's text, its kind, and `COMPILER_VERSION`**. Not `order`, and not the
blok's position: moving a rule up the canvas does not change what the rule says, so it must not
invalidate a cached span. That is what makes reordering keep every hash and every span width.

The cache is `options.cache`, a `Map` the **caller** owns. A cache inside this package would be shared
by every prompt in a process, would survive between tests, and would make `compile()` impure in the
one way that matters.

## Known gap, for EPIC-021b

`compile()` is a **fresh** compile: it always returns fully `compiled` spans, so calling it again
discards hand edits. Within this package that is right — there is no merge here. But it means adding
a blok to a prompt that has hand-edited spans has no answer yet: `updateFromBlok` only ever touches a
span that already exists, and a fresh `compile()` throws the edits away.

Deliberately not solved here, because the answer is a product decision about the compiled pane and
this epic's scope stops at the model. The two candidates are a `compile(bloks, { keep: previous })`
that carries hand-edited spans forward by blok id, or the pane replaying its edits after a recompile.
Named in EPIC-020's report.
