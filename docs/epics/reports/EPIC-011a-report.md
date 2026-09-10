# EPIC-011a report: Classifier and clustering

Branch `epic/011a-classifier-clustering`. 2026-09-09.

**Status: done.** `classify()` and `cluster()` ship in `packages/core` with the documented
signatures and zero new dependencies. 96.7% accuracy on the 60-example labelled table against a 90%
target. Six clustering fixtures with committed snapshots, 247 tests in the package, and the EPIC-010
carry-over done. `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm compliance` are clean.

The headline finding is not in the code. **All three of the decompiler prototype's multi-range bloks
are false merges**, and reproducing them would have shipped exactly the defect this epic exists to
prevent. That is why the deviation criterion 8 asks about is large and deliberate.

## Built

| Path | Does |
|---|---|
| `src/classify/types.ts` | `BlokKind`, `BLOK_KINDS`, `Classification` — the six kinds, spelled once |
| `src/classify/heuristics.json` | 23 ordered heuristics, first match wins; `id`, `kind`, `confidence`, `pattern` |
| `src/classify/classify.ts` | compiles the data once, strips a leading list marker, returns kind + confidence + `matched` |
| `src/classify/fixtures/labelled.json` | 60 examples with provenance (fixture name + segment index) |
| `src/cluster/types.ts` | `Blok`, re-exported `Range` |
| `src/cluster/cluster.ts` | the merge rule, its three guards, two candidate indexes, blok ids |
| `src/cluster/topics.json`, `stopwords.json`, `polarity.json` | every judgement as data |
| `src/cluster/invariants.ts` | `checkBlokInvariants()` — the clustering contract as running code |
| `src/cluster/ranges-are-plural.ts` | the type-level half of rule 5 |
| `src/cluster/fixtures/prompts.ts` | six whole-prompt fixtures, snapshot each |
| `src/pattern-shape.ts` | pattern safety for patterns that live in data |
| `src/fixtures.ts` | the `@41prompts/core/fixtures` barrel |

Exported from `@41prompts/core`: `classify`, `cluster`, `MERGE_OVERLAP_THRESHOLD`, `BLOK_KINDS`,
`checkBlokInvariants`, and the types `BlokKind`, `Classification`, `Blok`, `Range`. Corpora stay on
the `@41prompts/core/fixtures` subpath, per the ruling on EPIC-010's open question 1.

## Where this deviates from the prototype, and why

I extracted the prototype's `segment`, `classify`, `overlap`, `topicOf` and `cluster` verbatim into a
harness and **ran** them, rather than reading them. On its own sample: 15 segments → 10 bloks, three
multi-range.

```
[4] format      json-only    3 ranges
[6] format      json-shape   3 ranges   ← "keep the summary field short"
                                        + "if angry, set the priority field to high"
                                        + "always be professional and friendly in the summary field"
[8] conditional json-shape   2 ranges   ← "when a chargeback, set needs_human"
                                        + "if unsure, use your best judgement"
```

Bloks 6 and 8 are false merges. Every fragment in them matched the `json-shape` topic key —
`/\b(fields?|schema|category|priority|needs_human)\b/i` — on a bare noun. Blok 6 fuses three
unrelated rules on the word *field*. Blok 4 is half right: two genuine restatements of "JSON only",
plus a third fragment about the JSON *shape* that matched through "valid json".

Decision 10 says wrong merges are worse than missed merges, and EPIC-012a's contradiction detector
compares bloks and cannot see inside one — so a false merge does not just mislabel, it hides a
contradiction permanently. Porting those keys was not an option.

**On the same sample this produces 14 bloks, one multi-range**, and the arithmetic is exactly the
three refusals: blok 6 becomes three bloks (+2), blok 8 becomes two (+1), blok 4 keeps its two real
restatements and drops the shape fragment (+1). 10 + 4 = 14. The one merge kept is the correct one.

| # | Prototype | Here | Why |
|---|---|---|---|
| D1 | eight kinds | the six in `CLAUDE.md` | Decision 2. `role`/`procedure`/`instruction` → `context`; `constraint`/`format`/`tone`/`conditional` → `constraint`; `example` straight across. `expected`, `image_ref` and `image_input` are new and have no prototype analogue. |
| D2 | `json-shape` topic key | dropped | It is a subject, not a policy. See above. |
| D3 | `markdown` topic key | narrowed to `markdown-forbidden` | Same reason: a bare noun merges every rule about that noun. The false-merge fixture proves it with "Use markdown." against "Markdown headings must be sentence case." |
| D4 | no polarity check | a rule never merges with its own contradiction | Decision 10. Costs a real merge: "always respond in JSON only" no longer joins "do not include any explanation outside the JSON", two phrasings of one intent. That is the trade the decision asks for. |
| D5 | no minimum token count | `MIN_OVERLAP_TOKENS = 2` | Normalisation drops words of three characters or fewer, so "Use markdown." is one token and one shared token out of one scores 1.0. |
| D6 | overlap over the smaller vocabulary, unbounded | plus `MAX_VOCABULARY_RATIO = 3` | Containment scores a perfect 1.0, so a three-token rule swallows any long paragraph containing its words. Found in self-review, not by design. |
| D7 | eight conjunction rules to pick between `format`/`tone`/`constraint` | dropped | With those three kinds collapsed into one, the conjunctions decide nothing. |

Kept deliberately: the 0.6 threshold, the stop list, the normalisation, comparing against the group's
first fragment, and no stemming.

**The consequence worth naming:** collapsing eight kinds into six makes `constraint` a catch-all, so
"share a kind" filters far less than it did and the merge rule sees many more candidate pairs. That
is the mechanism by which this epic could over-merge, and it is why the false-merge fixture came
first.

## The false-merge fixture, which came before the merge rule

Written and committed before a line of `cluster.ts` existed (`c1ad047`), with three temptations:

1. Three unrelated rules that each mention a *field* — the prototype's blok 6.
2. A contradiction whose normalised tokens overlap 0.667, over the threshold, both sides the same kind.
3. A pair whose overlap is a perfect 1.0 on a single shared token.

Run against the naive rule it **failed two of the three**; the first was already fixed by narrowing
the topic keys. Each guard added afterwards is the minimum that fixture demanded, and each of its
tests names the threshold or key that would have to change to break it — criterion 5's actual ask.

Self-review then found two more false merges the fixture had not thought of, and both are now pinned
in it or in the new `polarity-order` fixture. See below.

## What went wrong, and was caught

- **The polarity guard did not work.** It compared against the group's *first* fragment only, so a
  neutral opening fragment let a positive and a negative rule both join — "Always respond in JSON
  only." in the same blok as "Never respond in JSON when the caller asked for plain text.", the exact
  merge the guard, the fixture and the README all said was impossible. Found in self-review by
  arranging the fragments so the guard never saw a polarity to disagree with. It now checks every
  polarity present in the group.
- **Containment scored 1.0.** `overlap()` divides by the smaller vocabulary, faithfully to the
  prototype, which means a three-token rule whose every word appears somewhere in a forty-word
  paragraph is "100% overlapping". "Always use YAML format." swallowed an audit-logging paragraph.
  `MIN_OVERLAP_TOKENS` does not help — the smaller side still has two tokens.
- **`cluster()` was O(n²) in segment count** — 57 ms for 1,000 mutually distinct segments, 192 ms for
  2,000, 726 ms for 4,000 — and had no throughput gate while `segment()` had two. A corpus-built
  input can never reveal it, because a repeated corpus saturates into a fixed number of groups after
  the first repetition. Two candidate indexes now narrow the search, one by topic and one by token
  with a "must share at least two tokens" filter derived soundly from the threshold itself. **2,000
  distinct segments: 192 ms → 7.9 ms. 4,000: 726 ms → 16.8 ms.** Four gates added.
- **The nested-quantifier detector missed `((a|b)+)+` and `([a-z)]+)+`** — a group inside a group,
  and a `)` inside a character class. Two textbook catastrophic shapes, straight through the gate
  whose only job was to stop them, at the moment that gate became responsible for patterns living in
  JSON. It is a scanner now, and it distinguishes unbounded quantifiers from `?` and `{n,m}`, which
  cannot blow up.
- **The source-literal audit only scanned `src/segment`**, so every literal in the new modules was
  unaudited by the test that claims to force the thought. Broadening it needed one more fix: without
  blanking quoted strings first, the `/classify/` inside an import path reads as a regex literal and
  the audit came back with 34 patterns, 29 of them module paths.
- **`<a/ >` changed meaning** in the `tags.ts` rewrite — self-closing where the regular expression
  read it as an opener, which breaks the atomic region. This was the single divergence found by
  differentially fuzzing the rewrite against `main` over 300,000 generated inputs, and it is the
  reason to do that rather than trust "no snapshot moved".
- **Blok ids were 32 bits.** "Unique within a prompt by construction" was a 1.5% coin flip on a 1 MB
  prompt's 11,500 bloks, and a collision trips `checkBlokInvariants`. They are 64 bits now.
- **My first fixture edit made `false-merge` do two jobs.** The polarity-order shape's neutral and
  positive fragments genuinely *should* merge, which contradicted that fixture's blunt "nothing here
  merges at all" assertion — the assertion that makes an unexpected merge fail loudly rather than
  only in the case somebody thought of. Split into `polarity-order`.
- **Two attempts at the topic-key worked example changed nothing** before one worked, because
  `topicOf` returns the first match and the segment I aimed at already matched an earlier key. That
  is in the README, because "my new key is harmless" and "my new key is shadowed" look identical.

## The EPIC-010 carry-over, and what it actually found

`tags.ts` no longer uses a regular expression. The old per-line pattern allocated twice per tag — a
match result and a token object — plus a sliced copy of every line containing a `<`. It scans by hand
into parallel arrays and compares tag names in the source rather than extracting them, so fifty
thousand tags produce zero strings. The segmenter is down to two regular expressions, both `\s`.

**It bought about 10% of absolute time and, measured locally, did not move the growth exponent** —
so I measured four shapes to find out why:

| Shape | Exponent |
|---|---|
| one paragraph | 0.996 |
| plain lines (one segment) | 1.026 |
| blank-separated paragraphs | 1.134 |
| tag lines | 1.09–1.27 |

The exponent tracks **how many segments come out**, not what the rules did to produce them. It is
per-segment allocation — and `Segment.text` being the verbatim source slice is a ruled decision, so
that floor stays. No amount of work in `tags.ts` moves it.

The bar is untouched at 1.6, as instructed. What is added is the test that isolates what this gate
was always for: the same byte count, line count and segment count, with and without tags, and the
*difference* in their exponents. Quadratic tag matching would put that difference near 0.85; it
measures **0.04**, against a 0.5 bar, and runner speed and GC pressure move both sides together and
cancel out.

### The correction CI made

Locally the flattening moved the exponent not at all, and the paragraph above was written on that
basis. **On CI it moved from 1.35 to 1.19**, against the untouched 1.6 bar — headroom from 1.19× to
1.34×. So the ruling did buy something after all; a laptop with spare memory bandwidth simply could
not see it, and the runner where the gate actually fails could.

That does not change the diagnosis — the exponent is still dominated by per-segment allocation, and
the four shapes above still say so — but it does change the conclusion I would have handed over.
"Flattening `tags.ts` achieved nothing" would have been wrong, and only measuring on the machine that
runs the gate showed it.

| Gate | CI | Bar | Headroom |
|---|---|---|---|
| `segment()` 100 KB warm | 8.2 ms | 100 ms | 12× |
| `segment()` growth exponent | 1.19 (was 1.35) | 1.6 | 1.34× |
| tag-matching excess | 0.06 | 0.5 | 8× |
| `cluster()` 100 KB warm | 18.9 ms | 100 ms | 5.3× |
| `cluster()` 2,000 distinct segments | 14.8 ms | 100 ms | 6.8× |
| `cluster()` growth exponent | 1.07 | 1.6 | 1.5× |

`segment()` 1 MB reports 142.3 ms and `cluster()` 1 MB reports 207.5 ms, neither gated.

## Acceptance criteria

- [x] **`classify()` and `cluster()` exported with the documented signatures; zero new dependencies.**
      `git diff main -- packages/core/package.json` shows only the `exports` subpath target moving
      from `segment/fixtures/index.ts` to the new `fixtures.ts` barrel. No dependency added; the only
      devDependency is still `vitest`.
- [x] **Accuracy ≥ 90% on the 60-example labelled table, with every miss named.** Output:
      `labelled-table accuracy 96.7% (2 miss(es) of 60)`, then each miss with its `matched` value.
      The two survivors are kept, not tuned away: sixty rows I chose myself would measure nothing if
      I also got to move the target. Both fall into `context`, decision 2's safe default, so the
      failure mode is a missing label rather than an invented rule. **Labels were written before any
      heuristic existed** and each row carries its provenance.
- [x] **Every blok carries `ranges` as an array; a type-level and a runtime test both fail otherwise.**
      Runtime: `cluster() > gives every blok its ranges as an array, even when there is exactly one`.
      Type level: `src/cluster/ranges-are-plural.ts`. Verified by temporarily widening `Blok.ranges`
      to `readonly Range[] | Range` — `ranges-are-plural.ts(18,39): error TS2344: Type 'false' does
      not satisfy the constraint 'true'` and again at line 24, plus three errors in the test file.
- [x] **The multi-range fixture produces the expected blok with two non-adjacent ranges.**
      `cluster() > puts a rule stated twice, paragraphs apart, in one blok with two non-adjacent
      ranges`, and `fixtures/snapshots/multi-range.snap.txt`: one blok, `0..64` and `263..330`, 199
      characters of unrelated text between them.
- [x] **The false-merge fixture produces separate bloks, and the test says which threshold or key
      would break it.** `fixtures/snapshots/false-merge.snap.txt`: 11 bloks, 0 multi-range. Five
      tests, each naming its trip wire — the `json-shape`-shaped topic key, `MERGE_OVERLAP_THRESHOLD`
      or the polarity guard, `MIN_OVERLAP_TOKENS`, `MAX_VOCABULARY_RATIO` — plus the blunt "merges
      nothing at all". `polarity-order` covers the fifth case.
- [x] **Determinism: 100 runs over every fixture, byte-identical including ids and order.**
      `cluster() > produces byte-identical bloks over 100 runs of every fixture`.
- [x] **Ranges sorted, non-overlapping, in bounds, over all fixtures and 1,000 generated inputs.**
      `cluster() invariants > hold on ...` per fixture, plus `hold on 975 generated inputs (seeds
      41000..41974)` and the 25 named edge cases — 1,000 in total, from the *same* generator and seed
      space as EPIC-010's reconstruction property, so a failure in either names the same input. The
      generator moved to `segment/fixtures/generate.ts` to make that true.
- [x] **The prototype's sample clusters into the same bloks, or the deviation is named and justified.**
      Deviation, named and justified above and in `fixtures/snapshots/prototype-sample.snap.txt`:
      14 bloks against 10, because two of the prototype's three multi-range bloks are false merges
      and the third contains one fragment too many.
- [x] **Adding a topic key changes exactly the snapshots it should; the diff is shown.**
      `src/cluster/README.md` → "A worked example". Adding `record-fields` changes exactly two
      snapshots — the two prompts that mention those fields — and fails two false-merge assertions,
      recreating the prototype's defect in one line of data. Run for real, twice: the first attempt
      changed nothing because the key was shadowed, which is also in the README.
- [x] **`tags.ts` allocation flattened; exponent reported with new headroom; the 100 KB gate passes.**
      Above. Local: `100 KB (102400 code units): 61.7 ms cold, 2.3 ms warm`, tag-shape exponent
      1.09–1.27 against the untouched 1.6 bar, and the new differential at 0.04 against 0.5. CI
      numbers in the PR. The measurement also says the exponent is not `tags.ts`'s to move.
- [x] **`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm compliance` clean.** 247 tests in
      `packages/core`; `reuse lint` clean with `.license` sidecars for the four JSON data files and
      no edit to `REUSE.toml`; dependency-cruiser clean; the mirror dry-run installs and tests the
      public-only tree.
- [x] **Report and session log written; backlog updated.**

## Requirements carried into later epics

**Three of this epic's findings are now requirements on epics that have not been written yet.** They
are here, in the report, because that is where the advisor's rulings landed and because a finding
that lives only in a closed epic's prose is a finding nobody acts on. Whoever writes EPIC-012a and
EPIC-013 should read this section before writing their Scope.

### EPIC-013 — two fixture requirements and an input cap

1. **Multimodal and expectation fixtures, and a re-run of the accuracy table.** EPIC-013's fixtures
   must include **at least two multimodal prompts and two prompts written as expectations**, and its
   report must **re-run the labelled-table accuracy with them included**.

   Why: the EPIC-010 corpus is 25 real prompts and not one of them is multimodal or written as a
   check, so `image_ref`, `image_input` and `expected` — three of the six kinds — get no coverage
   from the 60-example accuracy table at all. They have a small separate labelled set in
   `classify.test.ts`, marked for what it is, but until EPIC-013 those heuristics have never been
   tested against a prompt somebody actually wrote. Padding the accuracy table with text written to
   match my own patterns would have hidden the gap rather than closed it. Accepted as a known gap,
   2026-09-10.

2. **Cap pasted input at 100 KB, with a clear message.** `cluster()` is still quadratic in the worst
   case — the token filter cannot help when one token is universal, so fifty thousand rules all
   beginning "Always" degrades. Nothing a real prompt reaches is affected: the 100 KB gate passes at
   18.9 ms on CI and 1 MB is reported at 207.5 ms.

   The ruling is that **EPIC-013 caps the input rather than core defending against it**, 2026-09-10.
   A cap with a message a user can understand is a better answer than an unbounded promise core
   cannot keep, and it keeps the guard where the input actually arrives.

### EPIC-012a — the antonym case is a named detector requirement

3. **"Keep the summary short" against "keep the summary long", inside one blok, must be found and
   reported.** Those two share 0.75 of their normalised tokens, carry no negation, and classify the
   same — so they merge, and the contradiction ends up hidden *inside* a single blok where a detector
   that compares bloks will never see it.

   **Not fixed here, by ruling** (2026-09-10). The only deterministic fix in clustering is an antonym
   table, and an antonym table is a locale-sensitive guess of exactly the kind decision 7 rules out.
   It belongs to EPIC-012a's contradiction detector as a **named case with its own test**, and that
   detector has to look inside a blok's fragments, not only between bloks.

## The other two rulings

4. **The two labelled-table misses stand.** Both are "an imperative that is a rule but has no modal
   verb": "Anything not covered here: use judgement and flag it." and "1. Read the failing job's logs
   before saying anything about the cause." Closing them needs an imperative-verb list broad enough
   to catch procedure steps too, which would move real `context` segments into `constraint`.
   **Ruling: leave them** — 96.7% with two honest misses beats 100% bought with a heuristic that
   mislabels real context segments (2026-09-10).

5. **`polarity.json` is accepted scope.** It is a fourth data file the epic's Scope did not name, and
   it exists because the false-merge fixture proved it necessary — a rule merging with its own
   contradiction at 0.667 token overlap, both sides the same kind. **Ruling: accepted, the fixture
   justified it** (2026-09-10).

## Verify

```
pnpm --filter @41prompts/core test
pnpm compliance
```

Expected: 247 tests pass; labelled-table accuracy 96.7% with two named misses; `reuse lint` clean;
dependency-cruiser finds no violations; the mirror dry-run installs and tests the public-only tree.
