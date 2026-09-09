# CURRENT

**EPIC-010 is done** — every acceptance criterion below is checked with evidence in
`docs/epics/reports/EPIC-010-report.md`, and the session log is
`docs/epics/sessions/EPIC-010-session.md`. Four open questions for the advisor are at the end of
the report. This file stays pointed at EPIC-010 until the next epic is written and copied here per
`docs/PROCESS.md`'s loop.

This is a mirror of `docs/epics/EPIC-010-segmenter.md`. EPIC-010 was the current epic. EPIC-080 (prototype study) and EPIC-005 (interviews) are deferred, not cancelled:
their findings arrive mid-stage and will change EPIC-011a, EPIC-011b and EPIC-013. EPIC-010 is
interview-proof, so it runs first.

---

# EPIC-010: Deterministic segmenter
Stage: 1 · Depends on: EPIC-000 · Size: M

## Goal
`segment(text)` cuts any prompt into segments with exact character offsets, identically on every run, on every
machine. This is the foundation the decompiler, the blok model, and span linking all stand on: if offsets drift by
one character, every highlight in the product is wrong.

## Why this ships before the research epics
EPIC-080's study and the customer interviews can change what a blok is *called*, how summaries are presented, and
which findings matter. None of that changes where a paragraph ends. This epic is interview-proof; EPIC-011a onward
is not, and waits.

## Decisions (do not re-litigate)
1. `packages/core`, pure TypeScript, zero dependencies, no DOM, no IO (rule 11). No model call anywhere near a
   boundary decision (rule 2).
2. Signature: `segment(text: string): Segment[]` where `Segment = { text: string; start: number; end: number }`.
   `start` inclusive, `end` exclusive, both in **UTF-16 code units** (JavaScript string indices), documented
   explicitly because a Python SDK will later read the same offsets and must convert.
3. **Reconstruction is the contract**: concatenating every segment's source slice in order, plus the gaps between
   them, reproduces the input byte for byte. A property test enforces this on every fixture and on generated
   input. Nothing is normalised, trimmed, or dropped ; not whitespace, not CRLF, not a BOM.
4. Rule order, applied top down, documented in the source and in the report:
   1. Fenced code blocks (``` and ~~~) are atomic; never split inside one.
   2. XML/HTML-style tag blocks whose open and close tags match are atomic.
   3. Markdown headings are separators; the heading line is its own segment.
   4. Blank lines separate paragraphs.
   5. List items (`-`, `*`, `+`, `1.`) are one segment each; a nested list stays with its parent item.
   6. A paragraph longer than `SENTENCE_SPLIT_THRESHOLD` characters is split at sentence boundaries; shorter
      paragraphs are never split. The threshold is a named exported constant, not a literal.
5. Offsets are produced by **scanning with an index**, never by `indexOf` on segment text ; identical text
   appearing twice must not collapse to the same offset.
6. Determinism is absolute: no `Date`, no `Math.random`, no locale-sensitive comparison, no object-key iteration
   that could vary. Same input, same output, forever.
7. No catastrophic backtracking: every regex is linear on adversarial input. Nested quantifiers over the same
   character class are a build failure, not a code review comment.
8. The fixture corpus is committed and is the shared truth for every later epic; EPIC-011a's clustering tests and
   EPIC-013's UI fixtures read from it.

## Scope
- `packages/core/src/segment/`: `segment.ts`, the rule implementations, `types.ts`, and the exported constant.
- `packages/core/src/segment/fixtures/`: 25 real prompts, each with a committed snapshot of its segmentation.
  Include at minimum: a system prompt with fenced code, one with XML tags, one with a numbered list of rules, one
  markdown-heavy, one single 4,000-character wall of text, one with CRLF line endings, one with tabs, one with
  emoji and combining characters, one with right-to-left text, one with a BOM, one nearly empty, one that is only
  whitespace.
- Property tests, generated-input tests, idempotence test, performance test.
- A short `packages/core/src/segment/README.md`: the rule order, why it is that order, and how to add a rule
  without breaking existing snapshots.

## Out of scope
- Classification of what a segment *is*. (EPIC-011a.)
- Clustering segments into bloks. (EPIC-011a.)
- Summaries. (EPIC-011b.)
- Findings and detectors. (EPIC-012a.)
- Any UI. (EPIC-013.)

## Acceptance criteria
- [x] `segment()` is exported from `packages/core` with the documented signature and no dependencies added.
      Evidence: `package.json` diff showing zero new deps.
- [x] Reconstruction property: for 1,000 generated inputs (including empty string, whitespace only, no newline at
      end, CRLF, lone surrogates, 10,000-character lines), segments plus gaps reproduce the input exactly.
      Evidence: test name and the generator's seed strategy.
- [x] Idempotence: segmenting the same input 100 times produces byte-identical output. Evidence: test name.
- [x] Every fixture has a committed snapshot; all 25 pass. Evidence: test output.
- [x] Fenced code and matched tag blocks are never split, including a fence containing blank lines and a fence
      containing what looks like a heading. Evidence: two test names.
- [x] Offsets are correct when the same sentence appears twice in one prompt. Evidence: test name.
- [x] A 1 MB input segments in under 200 ms on CI. Evidence: timing output.
- [x] No regex in the module backtracks catastrophically; an adversarial input test completes in under 100 ms.
      Evidence: test name and the input used.
- [x] Rule order is documented in the source and the README, and adding a rule to the middle of the order is shown
      to change exactly the snapshots it should. Evidence: the README section.
- [x] `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm compliance` clean.
- [x] Report and session log written; backlog updated.

## Verification
```
pnpm --filter @41prompts/core test
pnpm compliance
```

## Notes for the implementer
- `docs/design/41prompts-decompiler.html` contains a reference implementation of this algorithm in its JavaScript.
  Read it, port the rules and its sample prompt into the fixture corpus with its known segment count, and say in
  the report where you deviated and why. The prototype is the spec until it conflicts with a rule above.
- Write the property test before the rules; it will catch the off-by-one you would otherwise ship.
- If a rule cannot be made deterministic or linear, write `docs/epics/BLOCKER-EPIC-010.md` and stop.
- The offsets are a public contract from the moment the SDK exists; get the units and the inclusivity right now.
