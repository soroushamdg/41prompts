# Plan — EPIC-011a: Classifier and clustering

Branch `epic/011a-classifier-clustering`. Written after reading
`docs/epics/EPIC-011a-classifier-clustering.md`, `CLAUDE.md`, `docs/PROCESS.md`, EPIC-010's report
and `packages/core/src/segment/`, and after **running** the decompiler prototype's classifier and
clustering against its own sample rather than reading them.

## What the prototype actually produces

Extracted the prototype's `segment`, `classify`, `overlap`, `topicOf` and `cluster` verbatim from
`docs/design/41prompts-decompiler.html` into a harness and ran it. 15 segments → **10 bloks**, 3 of
them multi-range:

```
[0] role        tone         1  0..157
[1] procedure   -            1  159..232
[2] instruction -            1  234..240      "Rules:"
[3] constraint  -            1  241..352
[4] format      json-only    3  353..435, 679..809, 1227..1294
[5] constraint  ai-identity  1  436..478
[6] format      json-shape   3  479..551, 552..616, 617..677
[7] example     json-shape   1  811..936
[8] conditional json-shape   2  938..1007, 1134..1225
[9] format      markdown     1  1009..1132
```

This is the reference, and reading its multi-range bloks is the single most useful thing in this
plan, because **all three of them are wrong in ways this epic exists to avoid**:

- **Blok 6** merges rules 4, 5 and 6 — "keep the summary field reasonably short", "if the customer
  sounds angry set the priority field to high", "always be professional and friendly in the summary
  field". Three unrelated rules, merged because each contains the word *field*, which is one of the
  `json-shape` topic key's alternatives (`/\b(fields?|schema|category|priority|needs_human)\b/i`).
- **Blok 8** merges "when the email mentions a chargeback, set needs_human to true" with "if you are
  unsure about the category, use your best judgement" — same key, again on a bare noun match.
- **Blok 4** is the defensible one: two genuine restatements of "JSON only" plus a third fragment
  about the JSON *shape* that matched `json-only` through "valid json". Half right.

Decision 10 says wrong merges are worse than missed merges, and criterion 5 demands a fixture that
tempts a false merge and does not fall for it. So the prototype's `json-shape` key cannot be ported
as written; reproducing blok 6 would be shipping the exact defect the epic is guarding against, and
it would also hide contradictions from EPIC-012a, whose contradiction detector works *between*
bloks. The report will name this as the deviation criterion 8 asks about.

## Kinds: the prototype's eight map onto the epic's six

`CLAUDE.md` and decision 2 fix the set at `context | constraint | example | expected | image_ref |
image_input`. The prototype has eight kinds, none of them the last three.

| Prototype | Here | Why |
|---|---|---|
| `role`, `procedure`, `instruction` | `context` | Who the model is, what the job is, and anything unclassified. None of it constrains output; it is the safe default decision 2 asks for. |
| `constraint`, `format`, `tone`, `conditional` | `constraint` | All four are rules about the output. A conditional rule is still a rule; a tone rule is still a rule. |
| `example` | `example` | Straight across. |
| — | `expected` | New, and deliberately narrow: only explicit expectation language ("expected output:", "must equal", "should return exactly"). An `expected` blok compiles to a **check, not text**, so a false positive here would silently invent a check. |
| — | `image_ref` | New: a concrete image asset — markdown image, `<img>`, a path or URL with an image extension. |
| — | `image_input` | New: a slot for an image supplied at run time — `{{image}}`, `<image>`, `[IMAGE]`, "the attached/uploaded/provided image". |

The collapse has a consequence worth stating up front: **`constraint` becomes a catch-all**, so far
more segment pairs now share a kind than did in the prototype, and the merge rule's "share a kind"
precondition filters much less. That is the mechanism by which this epic could easily over-merge, and
it is why the false-merge fixture comes first.

## Contract

```ts
// src/classify/types.ts
export type BlokKind = "context" | "constraint" | "example" | "expected" | "image_ref" | "image_input";
export interface Classification { kind: BlokKind; confidence: number; matched: string }
export function classify(segment: Segment): Classification;

// src/cluster/types.ts
export interface Range { start: number; end: number }
export interface Blok { id: string; kind: BlokKind; ranges: Range[] }
export function cluster(segments: readonly Segment[]): Blok[];
export const MERGE_OVERLAP_THRESHOLD = 0.6;
```

`Range` moves into `src/segment/types.ts` and is re-exported, rather than being declared twice —
`paragraphs.ts` already has a structurally identical internal one.

Invariants, each a test:

1. **`ranges` is always an array**, even for one range (rule 5, decision 6). Checked at runtime over
   every fixture *and* at type level, with a compile-time test that a bare range is not assignable.
2. **Sorted, non-overlapping, in bounds** within each blok.
3. **Never coalesced.** Two ranges a blok owns stay two ranges even when adjacent — decision 6 says a
   range must never cover text the blok does not own, and never coalescing is the version of that
   rule with no edge cases.
4. **Blok order** by the `start` of the first range.
5. **Ids content-derived and stable**: same input ⇒ same ids, byte for byte, across 100 runs.
6. **Every segment lands in exactly one blok**, and every blok has at least one range — the
   clustering analogue of EPIC-010's "nothing is dropped".

## Data files

Per decision 4 and the standing research note, every judgement is data:

- `src/classify/heuristics.json` — an ordered list of `{ id, kind, confidence, pattern, flags }`.
  First match wins. `id` is what `classify()` returns as `matched`.
- `src/cluster/topics.json` — `{ key, pattern }`, narrower than the prototype's.
- `src/cluster/stopwords.json` — the prototype's stop list, as data.
- `src/cluster/polarity.json` — *if and only if* the false-merge fixture proves it is needed. See
  below; I am not writing it before the fixture says so.

JSON rather than TypeScript because the epic's Scope names these files. That needs an import
attribute under `NodeNext` (`with { type: "json" }`) and a `.license` sidecar each for `reuse lint`,
since JSON cannot carry a comment header. Both get verified before the data is written, not after.

Patterns as data means EPIC-010's nested-quantifier check no longer sees them, so the detector moves
out of `segment.perf.test.ts` into `src/pattern-shape.ts` — zero imports, pure string analysis, so it
stays inside `core-is-pure` — and every committed pattern goes through it.

## The merge rule, and the fixture that comes before it

Decision 7: same kind, and either a shared topic key or normalised-token overlap ≥ 0.6. The
threshold is fixed by the decision, so any additional conservatism has to come from extra *necessary*
conditions, which decision 10 explicitly authorises.

**Order of work here is not negotiable** (epic's notes): build `false-merge` first, watch the naive
rule fail it, then add the minimum guard that fixes it. Candidate contents, derived from the
prototype's real defects and from the token arithmetic:

- Three unrelated rules that each mention "field" — the prototype's blok 6, verbatim in spirit. Fixed
  by narrowing the topic keys, not by a new guard.
- `"Always respond in JSON only."` against `"Never respond in JSON; use plain text."` Normalised
  tokens `[always, respond, json]` and `[never, respond, json, plain, text]` overlap 2/3 = 0.667,
  over the threshold, same kind — so the naive rule merges two rules that **contradict** each other,
  which both hides the contradiction from EPIC-012a and puts text in a blok the user would not expect
  to own it. Expected guard: a negated segment never merges with a non-negated one.
- A short-token pair such as `"Use JSON."` against `"JSON is forbidden."`, where normalisation leaves
  one or two tokens and the ratio hits 1.0 on a single shared word. Expected guard: a minimum token
  count before the overlap path is allowed to fire at all.

Known limit, to be written down rather than papered over: token overlap cannot tell "keep the summary
short" from "keep the summary long" (2/3 overlap, no negation). That is a contradiction, and
contradictions are EPIC-012a's job — but only if the two stay separate bloks, so the report will
carry it as a named risk with a test recording current behaviour.

## Blok ids

Content-derived (decision 8), so: a small FNV-1a over `kind`, then each range's `start`, `end` and
exact text, rendered `blok_` + 8 hex. Including offsets makes ids unique within a prompt by
construction — two bloks cannot share a first range — so there is no counter and no collision
tie-break to make non-deterministic. A collision test over the whole corpus guards the claim.

## Fixtures

- The **60-example labelled table**, `src/classify/fixtures/labelled.json` (+ sidecar): segment text
  and expected kind, drawn from the EPIC-010 corpus and the prototype's sample as the epic requires.
  Labels written from the text alone, before measuring, and misses reported rather than relabelled.
- The corpus contains **no image segments and no expectation segments**, so three of the six kinds
  get no coverage from it. Rather than pad the accuracy table with text I wrote to match my own
  patterns, those three kinds get a separate small labelled set and their own unit tests, and the gap
  goes in the report as something EPIC-013's fixtures will need.
- Five whole-prompt clustering fixtures with committed snapshots: `prototype-sample` (the parity
  case), `multi-range` (built for a rule stated in the opening paragraph and restated in a numbered
  list at the end), `false-merge` (above), `single-range-only`, `all-context`.

## Carry-over: flatten `tags.ts`

The growth-exponent gate reads 1.35 on CI against a bar of 1.6 — 1.19× of margin, thinner than the
runner-to-runner variance EPIC-010 measured. The cause is allocation: `tokenize()` builds one object
per tag and slices every line containing a `<`.

Plan: one regex pass over the whole document with a line cursor advanced in step, instead of a
per-line slice; parallel typed arrays (`Int32Array` line, `Uint8Array` kind and flags) instead of an
object per token. Keep the bar at 1.6 and report the exponent before and after, local and CI.

## Order of work

1. Epic committed as-is; `CURRENT.md` mirrored; backlog updated. *(done)*
2. `pattern-shape.ts` + move the nested-quantifier check off `segment.perf.test.ts`.
3. Types, `Range` moved to `segment/types.ts`, JSON import mechanics verified.
4. **`false-merge` fixture, and the naive merge rule failing it.**
5. `classify()` + heuristics data + the labelled table; iterate to ≥ 90% and record the misses.
6. `cluster()` + topics + stopwords + the guards the fixture demanded; the other four fixtures.
7. Invariants, determinism ×100, 1,000 generated inputs, id-collision test.
8. `tags.ts` flattening; exponent before/after.
9. READMEs, including the topic-key worked example (criterion 9) run for real.
10. Self-review, full gate, push, PR, squash-merge on green.
11. Report, session log, backlog; `CURRENT.md` left on EPIC-011a.

## Risks

- **Over-merging**, from `constraint` becoming a catch-all. Mitigated by building the false-merge
  fixture first and by narrowing the topic keys; measured by the multi-range fixture staying correct
  while `false-merge` stays split.
- **Circular labelling** — writing labels that flatter my own heuristics. Mitigated by labelling
  from the text before any heuristic exists, and by reporting the surviving misses verbatim.
- **`expected` false positives**, which would invent checks. Mitigated by keeping its patterns
  explicit-phrase-only and by leaning on decision 2's safe default.
- **The tags.ts rewrite breaking EPIC-010's snapshots.** They are committed; any change to them is a
  regression, not an update, and the report must say zero snapshots moved.
- If research findings arrive mid-epic, stop and ask (epic's notes). If a rule cannot be made
  deterministic, `docs/epics/BLOCKER-EPIC-011a.md` and stop.
