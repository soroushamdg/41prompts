<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# The segmenter

`segment(text)` cuts a prompt into segments with exact source offsets, identically on every run
and on every machine. Everything downstream stands on it: a blok owns a set of ranges, a check
failure attributes back to a range, and a highlight in the UI is a range. If an offset drifts by
one character, every highlight in the product is wrong.

## The contract

```ts
segment(text: string): Segment[]
interface Segment { readonly text: string; readonly start: number; readonly end: number }
```

1. **Verbatim.** `s.text === source.slice(s.start, s.end)`, always. No normalising, no
   paraphrasing, no trimming of the *source* — only of the range's edges.
2. **UTF-16 code units.** `start` inclusive, `end` exclusive, exactly as JavaScript's `slice`
   counts. Python indexes by code point, so `sdks/python` must convert; an emoji outside the BMP
   is two units here and one character there. UTF-8 byte offsets are a third thing again and are
   never used.
3. **Ordered, disjoint, non-empty, edge-trimmed.**
4. **Nothing is dropped.** Every non-whitespace code unit of the input belongs to exactly one
   segment, and the gaps between segments contain nothing but whitespace. Concatenating the
   segments and the gaps reproduces the input byte for byte.
5. **Deterministic.** No clock, no randomness, no locale-sensitive comparison, no iteration over
   object keys. Same input, same output, forever.

`checkSegmentInvariants(source, segments)` in `invariants.ts` is all five as running code, and is
what the property test asserts on every fixture and on 1,000 generated inputs. It is exported: any
later epic that slices, merges or re-anchors ranges can check itself with it.

Whitespace means ECMAScript `\s` — the set `String.prototype.trim` trims, U+FEFF included. A
byte-order mark is therefore whitespace and sits in the gap before the first segment rather than
at the head of its text.

## The rule order

Applied top down, one line at a time:

| # | Rule | Where |
|---|---|---|
| 1 | Fenced code blocks (`` ``` `` and `~~~`) are atomic | `fences.ts` |
| 2 | Tag blocks whose open and close tags match are atomic | `tags.ts` |
| 3 | A markdown heading line is its own segment | `units.ts` |
| 4 | Blank lines separate paragraphs | `units.ts` |
| 5 | List items are one segment each; a nested list stays with its parent item | `paragraphs.ts` |
| 6 | A paragraph longer than `SENTENCE_SPLIT_THRESHOLD` splits at sentence boundaries | `paragraphs.ts` |

### Why that order

It runs from the constructs that *suspend the other rules* down to the ones that only apply to
ordinary prose.

- **Fences first** because everything below them is ordinary text inside a fence. A `# install`
  line in a shell sample is not a heading; a blank line in a JSON sample does not end a
  paragraph; a `- ` line in a YAML sample is not a list item. Putting rule 1 first means no other
  rule has to know a fence exists.
- **Tag blocks second** because `<instructions> … </instructions>` is one thing the author wrote,
  and rules 3–6 would shred it. Second rather than first because a fence can legitimately contain
  a tag — a prompt showing HTML in a code sample — and the fence has to win there.
- **Headings third**, and they are separators rather than atoms: a heading ends the paragraph
  above it without needing a blank line, which is how markdown actually reads.
- **Blank lines fourth**, the oldest and least surprising rule, and the only one the prototype
  had that has survived unchanged.
- **Lists fifth**, inside a paragraph. A list item is one instruction; a nested list under it is
  part of that instruction, not a sibling. The alternative — every line its own segment, which is
  what the prototype did — makes "rule 3" and its own sub-clauses different bloks that a user
  then has to edit in two places.
- **Sentences last**, and only above a threshold. Splitting every paragraph at every full stop
  produces bloks too small to mean anything; splitting none of them leaves a 4,000-character wall
  as a single unusable segment. The threshold is the compromise, and it is a named constant
  (`SENTENCE_SPLIT_THRESHOLD`, `constants.ts`) rather than a literal precisely because it is a
  judgement that later evidence may move.

### What "order" actually means here

Worth knowing before you change anything: rules 1–4 are applied by one top-down walk over the
lines, so the order only decides **which rule claims a line when two of them could**. Containment
is decided by position, not by priority — whichever block *starts first* wins, and consumes the
lines inside it.

That was verified rather than assumed. Moving rule 3 above rule 1 in the walk changes **nothing**
— not one snapshot — because the fence opener is reached first and the walk jumps past the whole
fence before any heading line inside it is ever examined. If you are reordering rules hoping to
change behaviour, this is the trap: you probably need a different rule, not a different order.

## Deliberate non-goals

These are absences, not oversights:

- **Setext headings** (`===` or `---` under a line). `---` is also a thematic break and, in a
  prompt, most often a divider someone drew by hand. A rule that has to guess between them
  produces output that depends on the guess.
- **Abbreviation-aware sentence splitting.** "e.g. this" splits. An abbreviation table is
  language-specific and someone has to maintain it, which is the opposite of a deterministic rule.
- **Closing quotes as part of the sentence before them.** Tried and reverted: it improves
  `He said "stop." Then left.` and breaks `If the author wrote "this is temporary." in a comment,
  ask when.`, cutting one sentence in half. A boundary we decline to draw costs a blok one
  sentence too long; a boundary we draw wrongly costs a highlight that points at nonsense.
- **Blockquotes, tables, indented code blocks** as block rules. See the experiment below for what
  the last of those would cost.
- **Any model call.** No model chooses a boundary (CLAUDE.md rule 2). Models label and summarise,
  later, from the worker.

## Adding a rule

1. **Write the test first, in `segment.test.ts`,** under a `describe` named for the rule's
   position in the order. If the rule cannot be stated as "this line/range is claimed by X", it
   is not a segmentation rule.
2. **Put it in the right pass.** A rule that suspends other rules belongs in `fences.ts`/`tags.ts`
   and produces an atomic unit. A rule that separates belongs in `units.ts`. A rule that cuts
   inside a paragraph belongs in `paragraphs.ts`.
3. **Keep it linear and index-carrying.** No `indexOf` on segment text — offsets come from the
   scan, or the same sentence appearing twice collapses onto one offset. No nested quantifier
   over the same character class; `segment.perf.test.ts` enumerates every pattern in the module
   and fails on a new one until you add it to `EXPECTED_PATTERNS` and say why it is linear.
4. **Regenerate the snapshots and read the diff:**
   ```
   pnpm --filter @41prompts/core exec vitest run -u
   git diff packages/core/src/segment/fixtures/snapshots/
   ```
5. **Justify every snapshot that moved, and every one that did not.** A rule that changes 20
   snapshots is either much broader than you meant or is being applied in the wrong pass. A rule
   that changes none is not covered by the corpus — add a fixture, or you have shipped an
   untested rule.
6. **Add the rule to the table above, to the doc comment in `segment.ts`, and to the deliberate
   non-goals list if you decide against it.**

### A worked example

Inserting an "indented code block is atomic" rule (CommonMark's four-space rule) between rules 2
and 3, then regenerating, changes **exactly one snapshot**:

```
 M packages/core/src/segment/fixtures/snapshots/tab-indented.snap.txt
 1 file changed, 6 insertions(+), 4 deletions(-)

-1 30 87  "-\tRead the whole thread.\n\t-\tIncluding the quoted replies."
+1 30 54  "-\tRead the whole thread."
+2 56 87  "-\tIncluding the quoted replies."
```

That is the whole argument against the rule, visible in four lines of diff: a tab-indented
sub-bullet is four columns deep, so the rule tears every nested list item away from its parent
and breaks rule 5. One changed snapshot, changed for exactly the reason predicted — that is what
"changes exactly the snapshots it should" looks like when you check it instead of asserting it.

## The corpus

`fixtures/` holds 25 prompts and `fixtures/snapshots/` a committed snapshot of each. It is the
shared truth for every later epic (EPIC-011a's clustering tests, EPIC-013's UI fixtures) so a
boundary change shows up in one diff rather than in three drifting copies of sample text.

The prompts are TypeScript modules, not `.txt` files, for three reasons: `packages/core` does no
IO, so a loader would break its own boundary rule; the invisible cases (CRLF, a BOM, a lone
surrogate, a missing trailing newline) survive an editor and a checkout as escapes but not
reliably as bytes; and a module carries its own SPDX header. Each prompt is built line by line
with `lf()`, `crlf()` or `cr()` from `fixtures/text.ts`, because in a segmenter corpus the line
structure *is* the fixture.

Snapshots are plain text — `index start end` and the segment text as a JSON string — so a rule
change reads as moved offsets on the lines that actually moved. The SPDX header lives inside the
snapshot body, which keeps `reuse lint` satisfied without a sidecar file per snapshot.

## Relationship to the prototype

`docs/design/41prompts-decompiler.html` contains the reference implementation and is the spec for
the rules it has. `segment()` reproduces its output on its own sample prompt exactly — 15
segments, identical offsets, asserted in `segment.fixtures.test.ts`. The deviations, and why each
one was necessary, are listed in `docs/epics/reports/EPIC-010-report.md`.
