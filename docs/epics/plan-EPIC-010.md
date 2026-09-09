# Plan — EPIC-010: Deterministic segmenter

Branch `epic/010-segmenter`. Written after reading `docs/epics/EPIC-010-segmenter.md`,
`docs/PROCESS.md`, `CLAUDE.md`, `docs/design/41prompts-decompiler.html` (the reference
implementation), `.dependency-cruiser.cjs`, `REUSE.toml`, `scripts/forbidden-words.mjs` and the
existing `packages/core` tree.

## What the prototype actually does

`docs/design/41prompts-decompiler.html` lines 195–212 are the whole reference algorithm:

```js
function segment(text){
  var segs = [], cursor = 0;
  function push(str){
    str = str.trim(); if (!str) return;
    var s = text.indexOf(str, cursor);          // ← offsets by search, not by scan
    if (s < 0) return;                          // ← silently drops text
    segs.push({ text:str, start:s, end:s + str.length });
    cursor = s + str.length;
  }
  text.split(/\n{2,}/).forEach(function(para){  // ← blank lines only
    var lines = para.split(/\n/);
    var listy = lines.filter(function(l){ return /^\s*(\d+[.)]|[-*•])\s+/.test(l); }).length >= 2;
    if (listy){ lines.forEach(push); }
    else if (para.trim().length > 190){ para.split(/(?<=[.!?])\s+/).forEach(push); }
    else push(para);
  });
  return segs;
}
```

Three rules (blank line, list, sentence threshold 190), and three defects the epic's decisions
already forbid: `indexOf` for offsets (decision 5), `\n{2,}` missing CRLF entirely (a CRLF file is
one paragraph, because `\r\n\r\n` has no `\n\n`), and `if (s < 0) return` silently dropping a
segment (decision 3 forbids dropping). The prototype has no fence rule, no tag rule, no heading
rule. It is the spec for the rules it *has* — thresholds, marker set, list-vs-sentence precedence —
and the epic's decision 4 is the spec for the rest.

**Deviations from the prototype, decided up front** (all reported in the report):

| # | Prototype | Here | Why |
|---|---|---|---|
| D1 | `indexOf(str, cursor)` | index scan, offsets carried through every pass | Decision 5. `indexOf` after a trim is also how the prototype loses text. |
| D2 | `split(/\n{2,}/)` | a real line scanner over `\n`, `\r\n` and lone `\r` | Decision 3 (CRLF fixture must segment like the LF one). |
| D3 | drops on `s < 0` | nothing is ever dropped; every non-whitespace character lands in exactly one segment | Decision 3. |
| D4 | list ⇒ every line is a segment | list ⇒ every *item* is a segment; continuation and nested lines stay with the parent item | Decision 4.5 ("a nested list stays with its parent item"). Lines before the first marker stay together as one lead-in segment, which keeps the prototype's count on its own sample. |
| D5 | no fence / tag / heading rule | rules 1–3 as in decision 4 | Decision 4. |
| D6 | `split(/(?<=[.!?])\s+/)` | linear index scan for the same boundary | Decision 5 and 7; same boundary definition, no lookbehind, no intermediate string array. |

Everything else is kept: `SENTENCE_SPLIT_THRESHOLD = 190`, "two or more markers make a list", the
marker set `-` `*` `+` `•` `1.` `1)`, no sentence-splitting inside a list, segment text trimmed.

## Contract

```ts
export interface Segment {
  readonly text: string;  // === input.slice(start, end), verbatim (rule 3)
  readonly start: number; // inclusive, UTF-16 code unit
  readonly end: number;   // exclusive, UTF-16 code unit
}
export function segment(text: string): Segment[];
export const SENTENCE_SPLIT_THRESHOLD: number;
```

Invariants, each one a property test:

1. **Reconstruction.** Gaps + segments = input, byte for byte.
2. **Verbatim.** `s.text === input.slice(s.start, s.end)`.
3. **Ordered and disjoint.** `s[i].end <= s[i+1].start`.
4. **Non-empty and edge-trimmed.** `start < end`; neither end character is whitespace.
5. **Gaps are whitespace only.** Every non-whitespace character of the input belongs to exactly
   one segment. This is the invariant that stops a stub `return []` from passing the property
   test, and the one that makes D3 checkable rather than aspirational.
6. **Idempotent and pure.** Same input ⇒ byte-identical output, every time.

Whitespace means ECMAScript `\s` / `String.prototype.trim` whitespace, which includes U+FEFF. A
BOM therefore sits in a gap rather than at the head of the first segment; documented, tested.

## Passes

All linear, all index-carrying, no `indexOf` on segment text.

1. **`lines.ts`** — one scan over the input producing, per line, `start`, `contentEnd` (before the
   terminator) and `end` (after it). Terminators: `\r\n`, `\n`, lone `\r`.
2. **`fences.ts`** — rule 1. ``^ {0,3}(`{3,}|~{3,})`` opens; the same character, at least as
   long, alone on its line, closes; EOF closes. A backtick fence's info string may not contain a
   backtick (CommonMark). Produces a per-line "inside a fence" map used by every later pass.
3. **`tags.ts`** — rule 2. One pass over non-fenced lines collecting tag tokens
   (`<name …>`, `</name>`, `<name …/>`), then one stack pass matching each opener to its closer —
   O(n) total, not O(n²) per opener. A line whose first token is a matched, non-self-closing
   opener at column ≤ 3 starts an atomic block ending at the end of the closer's line.
4. **`blocks.ts`** — rules 3 and 4. Walks lines; a fenced block or a matched tag block is one
   atomic unit; an ATX heading line (`^ {0,3}#{1,6}(\s|$)`) is its own unit and ends the paragraph
   before it; a blank line ends a paragraph; everything else accumulates.
5. **`paragraphs.ts`** — rules 5 and 6. A paragraph with ≥ 2 top-level list markers splits into
   one segment per item (lead-in lines before the first marker become one segment; continuation
   and deeper-indented lines join the current item). Otherwise, a paragraph whose trimmed length
   exceeds `SENTENCE_SPLIT_THRESHOLD` splits after `.`, `!` or `?` (plus any run of closing
   quotes/brackets) followed by whitespace. Otherwise it stays whole.
6. **`segment.ts`** — orchestration, edge trimming by index arithmetic, and the public `segment()`.

Atomic units are never sentence-split or list-split; that is what "atomic" buys.

Deliberate non-goals, documented in the README so the next reader does not think they were missed:
setext headings (`---` under a line is ambiguous with a thematic break, and ambiguity is a
determinism hazard), abbreviation-aware sentence splitting ("e.g." splits; language-specific
abbreviation tables are not deterministic across locales and are not needed for a boundary that
later epics only cluster), and blockquote (`>`) as a block rule.

## Fixtures

`packages/core/src/segment/fixtures/` — 25 prompts, **one TypeScript module each**, aggregated by
`fixtures/index.ts` and re-exported from `packages/core` as `SEGMENT_FIXTURES`.

TypeScript modules rather than raw `.txt`:

- `packages/core` may not do IO in non-test source (`core-is-pure` in `.dependency-cruiser.cjs`),
  and a shared `.txt` loader would have to be a non-test file importing `node:fs`. Modules make
  the corpus importable by EPIC-011a's tests *and* EPIC-013's web UI with no loader at all.
- Byte-exactness survives editors and git: CRLF, BOM, a lone surrogate and trailing-newline
  presence are written as escapes (`\r\n`, `\uFEFF`, `\uD800`) instead of depending on a
  `.gitattributes` rule nobody will remember.
- REUSE: each module carries a real SPDX header. Raw `.txt` fixtures would each need a
  `.txt.license` sidecar or an edit to `REUSE.toml`, which `CLAUDE.md` puts out of bounds.

Readability is kept by writing each prompt as a template literal, so the prompt reads as a prompt
in the source. The corpus covers, at minimum, every case the epic names: fenced code, XML tags,
numbered rules, markdown-heavy, a single 4,000-character wall, CRLF, tabs, emoji + combining
marks, right-to-left text, BOM, nearly empty, whitespace only — plus the prototype's own sample,
an empty string, nested lists, an unterminated fence, a duplicated sentence, and no trailing
newline.

Snapshots: `fixtures/snapshots/<name>.snap.txt`, one per fixture, written through vitest's
`toMatchFileSnapshot` so `vitest -u` regenerates them. The snapshot body is a fixed-format table
(`index start end JSON-escaped-text`) with an SPDX header inside the file, so it is REUSE-clean
without a sidecar and readable in a PR diff — a rule change shows as changed offsets, not as an
opaque blob.

## Tests

| File | Covers |
|---|---|
| `segment.property.test.ts` | invariants 1–5 over 1,000 generated inputs and over every fixture. Generator: a seeded 32-bit LCG (`seed = 41_000 + i`), no `Math.random`; a fixed prelude of hand-written edge inputs (empty, whitespace only, no trailing newline, CRLF, lone surrogates, a 10,000-character line) so those are always exercised and named in the failure output. |
| `segment.test.ts` | rule-by-rule unit tests, including the two fence tests (blank line inside, heading-looking line inside), matched tag blocks, headings, list items and nested lists, the threshold boundary either side, the duplicated-sentence offset test, BOM, CRLF, empty and whitespace-only, and idempotence ×100. |
| `segment.fixtures.test.ts` | all 25 fixtures against committed snapshots. |
| `segment.perf.test.ts` | 1 MB under 200 ms; adversarial inputs under 100 ms each; a structural scan of the module's regex literals rejecting nested quantifiers (decision 7 as a failing test, not a review comment). |

The property test is written and committed **before** the rules (epic's note), against invariant 5
so that a stub cannot pass it.

## Order of work

1. Epic committed as-is; `CURRENT.md` mirrored; backlog updated. *(done)*
2. `types.ts`, `constants.ts`, property test, stub `segment()` — commit with the stub failing
   invariant 5, then make it pass with the blank-line rule only.
3. Rules bottom-up: lines → paragraphs (list, sentence) → blocks (heading) → fences → tags, each
   with its unit tests.
4. Fixture corpus + snapshots.
5. Performance, adversarial and regex-structure tests.
6. README with the rule order, the reasons, and the "adding a rule" section — verified by actually
   inserting a throwaway rule, recording which snapshots move, and reverting.
7. Self-review, `pnpm test / typecheck / lint / compliance`, push, PR, squash-merge on green.
8. Report, session log, backlog status; `CURRENT.md` left pointing at EPIC-010.

## Risks

- **Tag matching going quadratic** on many unmatched openers. Mitigated by the single stack pass
  in step 3, and covered by an adversarial perf test (10,000 unmatched `<a>` lines).
- **Trimming and lone surrogates.** Boundaries only ever land on whitespace, line ends or after
  `.!?`, none of which are surrogates, so a pair can never be cut; asserted in the property test.
- **Snapshot churn hiding a real regression.** The README's "adding a rule" section requires
  reporting *which* snapshots changed and why, and the fixture test prints the segment count, so a
  count change is visible in the diff without reading offsets.
- **A blocker.** If a rule cannot be made deterministic or linear, `docs/epics/BLOCKER-EPIC-010.md`
  and stop (epic's note). Nothing in the plan currently needs one.
