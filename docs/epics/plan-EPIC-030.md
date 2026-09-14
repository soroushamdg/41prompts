# Plan · EPIC-030 — checks and deterministic graders

Written 2026-09-14, before any implementation, per `CLAUDE.md`. **Stopping here for review.**

Organised around the four things Soroush said he would be reading for. Everything else is after them.

---

## 1 · `grade()` is deterministic and pure, with zero dependencies

### The signature

```ts
export function grade(check: GradableCheck, output: string): CheckResult;
```

Two values in, one value out. No options bag, no clock, no injected services — because every one of
those is a way for the same inputs to produce different answers later.

**Zero dependencies is already enforced**, not a promise: `packages/core` declares none, and
dependency-cruiser fails the build on an import that is not another public package or a Node builtin.
`grade()` adds nothing, so there is nothing new to check — the existing boundary lint is the evidence.

### The four ways purity usually dies here, and what stops each

| risk | why it would bite | what the plan does |
|---|---|---|
| **A regex from a person** | `matches_pattern` executes text a *user* wrote. A catastrophic pattern does not return a wrong answer — it does not return. | §1.1 |
| **Locale** | `toLowerCase()`, `localeCompare` and `Intl` are environment-dependent. `"I".toLowerCase()` is not `"i"` in Turkish. | Case folding only ever via `toLowerCase("en-US")`-equivalent explicit mapping, and comparisons are code-unit comparisons. Named in a test with a Turkish-locale fixture. |
| **Unicode** | "80 words" depends on what a word is; emoji and combining marks make `.length` a lie. | §3.2 — the counting rule is stated in the result, not assumed. |
| **JSON parsing** | `JSON.parse` is deterministic; *my* traversal of the result may not be if it iterates object keys and compares. | Shape checking compares a sorted key set, never insertion order. |

### 1.1 The one genuinely hard part: `matches_pattern`

A user-supplied pattern is arbitrary code in a backtracking engine. `(a+)+$` against forty `a`s and a
`b` does not finish this century. That breaks determinism in the worst way — not a wrong result, no
result — and it is a denial-of-service the moment EPIC-031 runs checks server-side.

**Three options considered.**

| option | verdict |
|---|---|
| Run `RegExp` with a timeout | **Impossible in-process.** JavaScript regex execution cannot be interrupted; there is no timeout parameter and no way to preempt it. A timeout needs a worker or a subprocess, which is IO, which breaks purity and the zero-dependency rule. |
| Bring in a linear-time engine (RE2 bindings) | **Rejected.** A native dependency in `packages/core`, which is a zero-dependency public package. Rule 11 and the whole point of the package. |
| **Reject dangerous patterns at derivation time, and run a restricted subset** | **Chosen.** |

**The chosen shape.** Pattern params are validated when the check is *derived*, not when it is run:

- The pattern must compile.
- It is rejected if it contains nested quantifiers (`(x+)+`, `(x*)*`, `(x+)*`) or an alternation
  inside a quantifier with overlapping branches — the two shapes that produce exponential
  backtracking. A conservative syntactic check, deliberately over-strict.
- It is rejected if longer than a fixed bound, or if it uses backreferences or lookbehind.

A rejected pattern makes the check **not graded**, with a reason. It does not fail the prompt, because
the author wrote a rule we cannot execute — that is our limitation, not their error.

**Being honest about what this is:** a conservative syntactic filter, not a proof. It will reject some
safe patterns and it is not a guarantee against every pathological input. What makes that acceptable
is that the failure mode is "not graded" rather than "hangs", and the criterion is written as a
bounded-step test against a known catastrophic pattern rather than as "is safe".

**Open question for Soroush → Q1.**

---

## 2 · The result schema expresses a partial pass without ambiguity

### The three outcomes, and why not two

```ts
export type CheckOutcome = "pass" | "fail" | "not_graded";
```

A check can be un-gradable for reasons that are ours, not the author's: no kind could be named
(`checkKindFor` returned `undefined`), or params could not be derived from the text, or the pattern
was rejected. **Folding that into `fail` blocks a publish for something nobody asserted. Folding it
into `pass` claims evidence that does not exist.** It is its own outcome.

`not_graded` carries a typed reason, so the UI in EPIC-032 can say which of those it is:

```ts
export type NotGradedReason = "no_kind" | "params_not_derivable" | "pattern_rejected";
```

### The run summary, which is where the ambiguity actually lives

A per-check outcome is easy. The trap is the **roll-up**, because "did this pass?" has two different
honest answers when nothing could be graded.

```ts
export interface RunSummary {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly notGraded: number;
  /** No check failed. Says nothing about how many ran. */
  readonly noFailures: boolean;
  /** Every check ran and every one passed. The only sentence that means "this is good". */
  readonly fullyChecked: boolean;
}
```

**Two booleans, deliberately, and this is the heart of the criterion.** A prompt with ten checks where
none could be graded has `noFailures: true` and `fullyChecked: false`. One boolean would have to
choose between calling that a pass — which is how a prompt with no working checks sails through a
publish gate — or a fail, which is untrue and unactionable.

**This also settles a rule-9 question early.** `CLAUDE.md` rule 9: publishing to Live is blocked when
checks fail. On this schema that is `noFailures`, and a prompt where nothing could be checked is
publishable. That may be right — a prompt with no expected bloks has nothing to prove — but it should
be a decision rather than a consequence of a field name. **Open question → Q2.**

There is deliberately **no single `passed: boolean`** on the summary. A name that reads as the answer
invites callers to use it as the answer.

### Per-check result

```ts
export interface CheckResult {
  readonly checkId: string;
  readonly blokId: string;          // §3
  readonly kind?: CheckKind;        // absent exactly when the outcome is not_graded/no_kind
  readonly outcome: CheckOutcome;
  readonly reason?: NotGradedReason;
  readonly evidence?: Evidence;
}
```

`Evidence` is a discriminated union, never a sentence:

```ts
export type Evidence =
  | { readonly kind: "excerpt"; readonly text: string; readonly start: number; readonly end: number }
  | { readonly kind: "measurement"; readonly measured: number; readonly limit: number; readonly counting: "words" | "characters" }
  | { readonly kind: "absent"; readonly sought: string };
```

Decision 5 in the epic file: evidence is a **substring of the output with its offsets**, or a stated
measurement, or a statement that something sought was absent. Never generated prose. EPIC-032 renders
these into sentences; core does not write sentences about a person's text, for the same reason the
compiler never paraphrases a blok.

---

## 3 · A failure attributes to exactly one blok

### Where the attribution comes from

It already exists. `Check.blokId` is single and non-optional, set by `compile()` from the expected
blok that produced the check. `CheckResult` carries it forward unchanged. **The plan's job is not to
invent attribution but to stop it being lost**, and there are exactly three ways it could be:

1. **A check from no blok.** Prevented by construction — checks are only produced by iterating bloks.
   A test asserts every check in a `Compiled` has a `blokId` naming a blok in the input set.
2. **A check from several bloks.** Would need a merge step. There is none, and the epic file's
   decision 4 forbids adding one. One blok may produce several checks; the arrow only points one way.
3. **Attribution surviving a recompile.** `Check.id` is content-derived and stable, so a result from
   an earlier run can still be matched to a check after a recompile of an unrelated blok. A test
   recompiles with one blok edited and asserts the untouched checks keep both id and `blokId`.

### The one case worth deciding rather than assuming

**A `must_not_contain` failure has two plausible attributions**: the expected blok that said "must not
contain X", and — if the forbidden string came from a *constraint* blok — arguably that one too.

The plan keeps it single: the check came from the expected blok, so the failure is the expected blok's.
Anything else needs a many-to-one model the compiler does not have. Noted here so the first person who
wants a second link finds the reasoning rather than a gap.

---

## 4 · The eight kinds are ADR-003's eight and no others

Already true in `packages/core`, and this epic keeps it true in the one new place it could break:
**the grader table**.

```ts
const GRADERS: Readonly<Record<CheckKind, Grader>> = { /* all eight */ };
```

A `Record<CheckKind, …>` fails to compile if a kind is missing. Combined with the existing
`EveryCheckKindListed` guard, adding a ninth `CheckKind` fails in two places until it has both a list
entry and a grader. A test also asserts `Object.keys(GRADERS)` equals `CHECK_KINDS`, so the runtime
set cannot drift from the type.

**No ninth kind for "a judge decides".** The temptation is real — `checkKindFor` returns `undefined`
for a large share of real expected bloks, and a `judge` kind would tidy that away. It is refused:
ADR-003 fixes the set at eight, `CLAUDE.md` records what treating that list casually already cost,
and the honest representation is `not_graded` with `reason: "no_kind"`, which is exactly what
EPIC-033 will look for.

### The eight, and what each grades

| kind | phrase (ADR-003) | grades | params |
|---|---|---|---|
| `json_shape` | valid JSON shape | output parses as JSON, and its key set matches | expected keys |
| `allowed_values` | one of the allowed values | output, trimmed, is one of a list | the list |
| `word_limit` | word limit | word count ≤ n | n, and the counting rule |
| `character_limit` | character limit | length ≤ n | n, and what a character is |
| `must_contain` | must contain | substring present | the substring |
| `must_not_contain` | must not contain | substring absent | the substring |
| `matches_pattern` | matches a pattern | pattern matches | the pattern, validated per §1.1 |
| `refuses_to_answer` | refuses to answer | output is a refusal | — |

**`refuses_to_answer` is the one that does not fit, and I would rather say so now than discover it
mid-epic.** Recognising a refusal is a judgement, not a decidable fact — "I can't help with that",
"I'm not able to", a polite deflection, a refusal in another language. Any deterministic version is a
phrase list, which is a heuristic wearing a grader's clothes, and it will be wrong in both directions
on real output.

Options: ship a documented phrase-list heuristic and mark its results as lower-confidence; or grade it
`not_graded` with a new reason `needs_judgement` and let EPIC-033 own it. **I recommend the second** —
it is the only one consistent with decision 3, and a heuristic that quietly reports `pass` for a
refusal it recognised and `fail` for one it did not is precisely the "guess dressed as an answer" the
goal sentence rules out. **Open question → Q3.**

### 3.2 Counting words and characters, stated rather than assumed

`word_limit` and `character_limit` both hide a definition:

- **Characters**: `"👩‍💻".length` is 5 UTF-16 code units, 3 code points, 1 grapheme. The plan counts
  **code points** (`[...output].length`) and the `measurement` evidence names the unit, so a limit
  that looked wrong can be explained without reading the source.
- **Words**: runs of non-whitespace, split on Unicode whitespace. Not a locale-aware segmenter —
  `Intl.Segmenter` is environment-dependent and would break determinism across Node versions.

Both are conservative and both are *stated in the result*, which is the part that matters: a
measurement nobody can reproduce is not evidence.

---

## 5 · Files

| file | what |
|---|---|
| `packages/core/src/check/params.ts` | derive params from verbatim text; may return "not derivable" |
| `packages/core/src/check/pattern-safety.ts` | §1.1's syntactic filter |
| `packages/core/src/check/graders.ts` | the eight, one function each |
| `packages/core/src/check/grade.ts` | `grade()`, the table, the summary roll-up |
| `packages/core/src/check/types.ts` | `CheckOutcome`, `CheckResult`, `Evidence`, `RunSummary` |
| `packages/core/src/check/suggest.ts` | the suggestion engine |
| `+ .test.ts` for each | 5 positive / 5 negative per grader, plus the property tests |

`Check` gains `params?` and stays otherwise as EPIC-020 left it. Its "provisional" comment is updated
to say EPIC-030 settled it, rather than deleted.

## 6 · Order of work

1. `types.ts` — the three outcomes and the two summary booleans, because §2 is the criterion most
   likely to need re-cutting and everything else depends on its shape.
2. `params.ts` + `pattern-safety.ts`, with their failure paths.
3. The eight graders, simplest first; `refuses_to_answer` last, pending Q3.
4. `grade()` and the roll-up.
5. The suggestion engine.
6. Property tests: determinism, attribution, exhaustiveness.

## 7 · Open questions — the four I would rather have answered than guess

1. **Q1 · Pattern safety.** Is a conservative syntactic filter that rejects some safe patterns
   acceptable, given the alternative is a native dependency in a zero-dependency package? My
   recommendation: yes, with `not_graded` as the failure mode.
2. **Q2 · Does "nothing could be checked" block a publish?** The schema can express it either way;
   rule 9 says failures block. A prompt where nothing was gradable is `noFailures: true` today. Right,
   or should publishing require `fullyChecked`?
3. **Q3 · `refuses_to_answer`.** Heuristic phrase list, or `not_graded` until EPIC-033's judge? I
   recommend the latter and would add a `needs_judgement` reason for it.
4. **Q4 · Scope of the suggestion engine.** The roadmap says "suggestion engine for unmatched expected
   text". Is that a suggested *check* (kind + params, which the author confirms), or a suggested
   *rewording* of the blok so a shape matches? They are different features; I read it as the first.

## 8 · What I am not planning to do

- No `judge` kind, no ninth anything.
- No persistence, no schema, no migration.
- No model call.
- No UI, and therefore no browser drive — stated in the epic's Verification section so the missing
  drive reads as reasoned rather than skipped.
- No change to `checkKindFor`'s behaviour or to `rule-shapes.json`. If a shape is wrong that is a bug
  in EPIC-012b's map, fixed as its own change.
