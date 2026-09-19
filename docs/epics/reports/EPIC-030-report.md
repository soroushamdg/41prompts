<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# EPIC-030 report — checks and deterministic graders

Date: 2026-09-14 · Branch `epic/030-checks-and-graders` · Stage 3 opens

Built to `docs/epics/plan-EPIC-030.md`, with Soroush's four rulings of 2026-09-14 applied as given.

## 1. The four rulings, and where each one landed

| ruling | where it is |
|---|---|
| **1 · Conservative filter, `not_graded` on rejection.** Name it a filter in code and report; list what safe constructs it rejects. | `check/pattern-safety.ts`, and §3 below |
| **2 · `noFailures` gates Live; `fullyChecked` does not** — but `fullyChecked: false` gets its own sentence, never folded into pass. | `check/types.ts`'s `RunSummary`, and §4 |
| **3 · `refuses_to_answer` → `not_graded` with `needs_judgement`.** | `check/graders.ts`, and §5 |
| **4 · A suggested check, never a suggested rewording.** | `check/suggest.ts`, and §6 |

## 2. `grade()` is pure and deterministic, and core is still zero-dependency

Two values in, one out. No options bag, no clock, no injected services, no IO.

```
$ node -e "…packages/core/package.json"
dependencies: none
```

The four ways purity usually dies here, and what each one met:

- **Locale.** Nothing calls `localeCompare`, `Intl`, or `toLocaleLowerCase`. `Intl.Segmenter` was
  available for word counting and was refused: it is locale- and ICU-version-dependent, so the same
  output could be 79 words on one Node build and 80 on another.
- **Unicode.** Lengths count **code points** via `[...text]`, never `.length`. `"👩‍💻"` is 5 code
  units and 3 code points; a ten-character limit must not fail on two emoji. Tested directly.
- **Key order.** `json_shape` compares sorted key sets. A test grades the same object with its keys
  written in both orders and asserts the two results are deeply equal.
- **Regex.** §3.

Determinism is asserted as a property, not sampled: the same check and output, 25 times, deeply
equal, across five shapes of output.

## 3. The pattern filter — and it is a filter, not a proof

Said in the module name, the module comment, the test names, and here.

`matches_pattern` executes a regex **a person wrote**. A catastrophic one does not return a wrong
answer — it does not return. Two alternatives were considered and both are worse: a timeout is
impossible in-process (JavaScript cannot interrupt a running regex, so a real timeout needs a worker,
which is IO), and a linear-time engine is a native dependency in a zero-dependency public package,
which rule 11 forbids.

**It reuses `pattern-shape.ts`'s `findNestedQuantifiers` rather than writing a second scanner.** That
one already handles groups inside groups and `)` inside a character class — the two cases a
regex-based version of the same check missed, per its own comment — and a second copy of this
analysis is precisely how the last duplicated list in this repository drifted.

### The safe constructs it rejects, listed as the ruling asks

Each is fine in practice and refused anyway, because telling the safe instance from the dangerous one
needs the analysis this is avoiding:

| refused | why it is actually fine | why it is refused |
|---|---|---|
| `(?:ab+)*` | harmless over short inputs | the shape is indistinguishable from `(a+)+` syntactically |
| `(\d+)+` | ordinary intent, bounded in practice | same shape |
| `(a)\1` | a backreference that would be cheap here | backreferences make matching NP-hard in general and the cases cannot be told apart |
| `(?<=\$)\d+` | well-behaved in V8 | support and cost vary by engine, and `grade()` must not depend on which engine ran |
| anything over 400 characters | a long pattern is not dangerous *because* it is long | a blunt bound to stop a pathological megabyte reaching the engine |

`pattern-safety.test.ts` has a block named *"known false rejections, listed rather than discovered"*
asserting all four, so the over-strictness is a documented property and nobody later "fixes" one by
weakening the scan.

**The criterion, measured:** grading `(a+)+$` against thirty `a`s and a `b` completes in **under
250 ms** with `not_graded` / `pattern_rejected`, and explicitly **not** `fail` — the author wrote a
rule we cannot execute, which is our limitation rather than their error.

## 4. The summary keeps two questions apart

```ts
readonly noFailures: boolean;    // no check failed. Gates Live.
readonly fullyChecked: boolean;  // every check ran and every one passed.
```

**There is deliberately no field called `passed`.** A name that reads as the answer invites callers
to use it as the answer; `passed` exists only as a count, and a count cannot be mistaken for a
verdict. A test asserts that.

Ten ungradable checks and ten passing checks produce **different summaries** — the criterion, in one
test. Both have `noFailures: true`; only the second is `fullyChecked`.

Per ruling 2: `noFailures` is the publish gate, because rule 9 blocks on *failure* and ten ungradable
checks have failed nothing — blocking there would refuse to publish a prompt for being simple.
`fullyChecked: false` is the honesty half and owes the user their own sentence at the publish moment.
**EPIC-032 owns that sentence; this epic ships the field it reads.** Noted here so it is a handover
rather than an assumption.

An empty set is `fullyChecked: false`, because nothing verified anything — a prompt with no checks
must not report itself as verified on the strength of an empty list.

## 5. `refuses_to_answer` never grades

Per ruling 3. The grader returns `not_graded` / `needs_judgement` for every input, and a test asserts
it never returns pass or fail for any of five outputs including *"I cannot help with that"* and *"I
cannot stress enough how much I can help"* — the second being exactly the false positive a phrase
list produces.

The kind stays in the eight, because ADR-003 fixes the set. What changes is who answers it: EPIC-033's
pinned judge, which will look for precisely this reason code.

## 6. A suggested check, never a rewording

Per ruling 4, and it follows from rule 3: the compiler must not emit a paraphrase of user text, and a
suggested rewording is that with extra steps. `suggestFor` names a **kind** and what the text still
needs — "a number of words", "the required text, quoted" — in the shape EPIC-012b already uses.

A test asserts the author's words never come back: given a blok reading *"Reply briefly and with
warmth"*, the serialised suggestion contains neither the sentence nor the word "warmth".

Suggestions are produced only for checks that did not grade. EPIC-012b's report records what stacking
unusable advice does to the advice that matters.

## 7. Attribution

`Check.blokId` is single and non-optional and was already so; this epic's job was to stop it being
lost, and the three ways it could be are each a test: a check from no blok, a check from several, and
attribution surviving a recompile. The third recompiles with one unrelated blok edited and asserts
every surviving check keeps both its id and its `blokId`.

**One ambiguity decided rather than left:** a `must_not_contain` failure attributes to the expected
blok that stated the prohibition, not to a constraint blok that happened to supply the string.
Anything else needs a many-to-one model the compiler does not have.

## 8. Evidence is a fact, never a sentence

`Evidence` is a four-way union — an excerpt with its code-point offsets, a measurement with its unit,
something sought and absent, or a shape with expected and found key sets. A test walks all seven
gradable kinds and checks each variant is what it claims: an excerpt is a real slice of the real
output **at the offsets given**, a measurement names its unit, an absent string really is absent.

A second test asserts no field called `message`, `summary`, `explanation`, `advice` or `suggestion`
exists anywhere on a result — the names prose arrives under.

## 9. A gate caught something, and it was right to

`pattern-shape.test.ts` enforces EPIC-010 decision 7: every regex literal in `packages/core` is on a
reviewed list. The first version of this epic added seven and the gate failed the build.

They are now listed **with why each is linear** — every one is a single quantifier over a single
class with nothing repeated inside anything repeated — rather than added silently.

**It also surfaced something worth fixing rather than working around.** The audit blanks quoted
strings before scanning for literals, so a `"` inside a regex literal comes back *mangled*: my
`/["“]([^"”]{1,200})["”]/` appeared in the diff as `[""”]{1,200})["”]`. A pattern whose audited form
is corrupted is one nobody can review, which defeats the point of the list. The three affected
literals now write their quote characters as escapes (`\x22`, `“`), so what the audit prints is
what the code contains.

## 10. Verification

```
test        8 checked, 8 passed        (core: 146 new tests under src/check/)
typecheck   8 checked, 8 passed
lint        11 checked, 11 passed      (incl. dependency-cruiser, turbo boundaries, forbidden words)
e2e         178 passed, 4 skipped, 0 failed
compliance  reuse, boundaries, forbidden words, binary files, licence gate, mirror dry-run — OK
core deps   none
```

Per-grader counts: five positive and five negative for each of the seven gradable kinds, plus
`refuses_to_answer`'s own block asserting it never grades.

## 11. No browser drive, and why that is not a skipped criterion

This epic ships no route, no component and no string a user sees — it is `packages/core` and its
tests. `PROCESS.md`'s drive rule has nothing to drive. Said here rather than left as an unticked box,
because a missing drive that is not explained reads exactly like a skipped one, and this session has
spent a lot of effort on that distinction.

The first thing that will make this visible is EPIC-032, which is where the `fullyChecked` sentence
also lands.

## 12. For the advisor

1. **`fullyChecked: false` needs its sentence in EPIC-032.** The ruling is explicit that it is never
   folded into a pass. Core ships the field; the words are a UI decision and should be written into
   EPIC-032 before it is built rather than discovered during it.
2. **`checkKindFor` returns `undefined` often**, which means `no_kind` will be the most common
   `not_graded` reason in practice. That is honest and it is also a lot of unchecked rules — worth
   knowing when EPIC-033's judge is scoped, because that is the queue it inherits.
3. **Params derivation is deliberately conservative** and will decline text a person considers
   obvious — "Always include the order number" yields nothing because nothing is quoted. Whether that
   is too strict is a product question best answered against real prompts rather than in advance.
