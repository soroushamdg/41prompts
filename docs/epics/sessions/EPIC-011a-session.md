# EPIC-011a session log

**Date.** 2026-09-09.

**Prompt sent.** Same autonomy as EPIC-010: commit the advisor's
`docs/epics/EPIC-011a-classifier-clustering.md` as-is, mirror it into `CURRENT.md`, mark EPIC-011a
current in `docs/backlog.md`, plan into `docs/epics/plan-EPIC-011a.md`, then implement, self-review,
push, PR, squash-merge once CI is green. Two explicit instructions: read the decompiler prototype's
clustering JavaScript before writing anything, and **build the false-merge fixture before the merge
rule**. Also carried in: the growth-exponent ruling — do not widen the bar, do not accept red builds,
flatten the allocation in `tags.ts`, folded into this epic because it is the same module.

**Plan summary.** `docs/epics/plan-EPIC-011a.md`, written after extracting the prototype's
`classify`/`overlap`/`topicOf`/`cluster` verbatim into a harness and **running** them rather than
reading them. That produced the fact the whole plan is built around: 15 segments → 10 bloks, three of
them multi-range, and all three false merges. Blok 6 fuses "keep the summary field short", "if angry
set the priority field to high" and "always be professional and friendly in the summary field" — three
unrelated rules — because each contains the word *field*, one alternative of its `json-shape` topic
key.

**Decisions made and why.**

- **The prototype's topic keys could not be ported.** Reproducing blok 6 would ship the exact defect
  decision 10 and criterion 5 exist to prevent, and it would hide contradictions from EPIC-012a
  permanently, because that detector compares bloks and cannot see inside one. A topic key names a
  **policy**, not a subject: `json-only` qualifies, a bare `markdown` or `fields?` does not.
- **`constraint` becomes a catch-all**, because the prototype's eight kinds collapse onto the epic's
  six. Named in the plan up front, because it means "share a kind" filters far less than it did and
  is the mechanism by which this epic could over-merge.
- **The false-merge fixture first, and it earned its place immediately.** Run against the naive rule
  it failed two of its three temptations — the third was already fixed by narrowing the topic keys.
  Every guard in `cluster.ts` is the minimum that fixture demanded, not a guard I thought sounded
  wise. Written and committed before `cluster.ts` existed, in `c1ad047`.
- **The labelled table before the heuristics.** 60 rows drawn from the corpus and the prototype's
  sample, each keeping its provenance, labelled from the text alone and committed before a single
  pattern existed. That is the only defence against a table that flatters the classifier it measures,
  and it is why the surviving misses are reported rather than relabelled. First run: 95.0%.
- **`expected` is deliberately narrow.** It compiles to a check rather than to text, so a false
  positive does not mislabel a blok — it invents a check that can fail a publish. There is a test
  that ordinary rule language ("You must respond in JSON only.", "Make sure the output is valid
  JSON.") never comes back as `expected`.
- **Data files as `.json` with `.license` sidecars**, as the epic's Scope names them. Verified first
  that a `with { type: "json" }` import typechecks under `NodeNext` and runs under vitest, and that a
  sidecar satisfies `reuse lint` — before writing any data, rather than discovering it after.
- **The generator moved to `segment/fixtures/generate.ts`** so EPIC-010's reconstruction property and
  this epic's blok invariants run over the same 1,000 inputs from the same seeds. A failure in either
  now names the same input, which is worth more than each test having a generator tuned to itself.
- **`pattern-shape.ts` as production code, not a test helper.** The patterns that decide a kind live
  in committed JSON now, where the source-scanning check EPIC-010 used cannot see them.

**What took longer than expected / went wrong and was caught.**

- **Self-review found seven things, and three were serious.** Two were false merges the guards were
  supposed to make impossible:
  - The **polarity guard consulted only a group's first fragment**, so a neutral opener let a positive
    and a negative rule both join it. Reachable only by ordering the fragments so the guard never saw
    a polarity to disagree with — which is why the fixture had not caught it.
  - **`overlap()` divides by the smaller vocabulary**, so containment scores a perfect 1.0 and
    "Always use YAML format." swallowed a forty-word audit paragraph containing all three of its
    words. Prototype-faithful, and wrong.

  The third: **`cluster()` was O(n²) in segment count** (192 ms at 2,000 distinct segments, 726 ms at
  4,000) with no throughput gate, while `segment()` had two. A corpus-built input can never show it,
  because a repeated corpus saturates into a fixed number of groups — which is exactly why it hid.
  Two candidate indexes took 2,000 from 192 ms to 7.9 ms and 4,000 from 726 ms to 16.8 ms.
- **My own scaling probe was wrong twice before it measured anything.** The first version made every
  segment share the words "keep item tidy short" so all 4,000 merged into one group; the second still
  shared "always", "before" and "proceeds" and hit exactly 0.6. Only the third — no shared word at
  all — reproduced the quadratic the reviewer had measured. A performance probe that does not produce
  the shape you think it does is worse than no probe.
- **The nested-quantifier detector missed `((a|b)+)+` and `([a-z)]+)+`** at the moment it became
  responsible for patterns in JSON. A regular expression matching group bodies cannot see a group
  inside a group or survive a `)` in a character class. Rewritten as a scanner.
- **The carry-over's premise did not hold.** Flattening `tags.ts` was specified to give the
  growth-exponent gate headroom. It removed the last regex from the segmenter and about 10% of
  absolute time, and moved the exponent not at all. Measuring four shapes says why: one paragraph
  grows at 0.996 and plain lines at 1.026, while anything yielding one segment per line sits near
  1.15 whether or not a tag is involved. The exponent tracks output segment count — per-segment
  allocation — and `Segment.text` staying the verbatim slice is a ruled decision, so that floor stays.
  The bar is untouched; a differential test that compares the same shape with and without tags is
  added, and measures 0.04 against a 0.5 bar.
- **And then CI corrected me.** The exponent there went 1.35 to 1.19 — the flattening *did* help, on
  the machine where the gate actually fails, and a laptop with spare memory bandwidth could not see
  it. I had written "moved the exponent not at all" and would have handed the advisor a wrong
  conclusion off a local measurement. The lesson is the same one this session kept teaching: measure
  on the machine that runs the gate.
- **The first fixture edit made `false-merge` do two jobs.** The polarity-order shape's neutral and
  positive fragments genuinely should merge, which broke that fixture's blunt "nothing here merges"
  assertion — the assertion that makes an unexpected merge fail loudly rather than only in the case
  somebody thought of. Split into `polarity-order`.
- **Two attempts at the topic-key worked example changed nothing** before one worked, because
  `topicOf` returns the first match and the segment I aimed at already matched an earlier key. In the
  README now, because "my new key is harmless" and "my new key is shadowed" look identical from
  outside.
- **Broadening the literal audit needed a fix of its own.** Without blanking quoted strings first, the
  `/classify/` inside an import path reads as a regex literal: 34 "patterns", 29 of them module paths.

**Verification output (tail).**

```
labelled-table accuracy 96.7% (2 miss(es) of 60)
  miss: bulleted-with-nesting[4] expected constraint, got context via context-default
  miss: tool-use-agent[5] expected constraint, got context via context-default
100 KB (102400 code units): 61.7 ms cold, 2.3 ms warm
1 MB (1048576 code units): 28.9 ms cold, 26.9 ms warm (reported, not gated)
tag-matching excess 0.04 (tagged 1.27, control 1.23)
growth exponent 1.18 (4.2 ms -> 21.6 ms for 4x input; 1.0 linear, 2.0 quadratic)
cluster 100 KB (1126 segments): 193.8 ms cold, 9.8 ms warm
cluster 1 MB (11506 segments): 189.0 ms cold, 146.1 ms warm (reported, not gated)
cluster 2,000 distinct segments: 12.0 ms cold, 7.9 ms warm
cluster growth exponent 1.09 (3.7 ms -> 16.8 ms for 4x segments)
      Tests  247 passed (247)

and from the CI runner, which is where the gates actually bind:

100 KB: 8.2 ms warm | growth exponent 1.19 (was 1.35 before the tags rewrite) | tag excess 0.06
cluster 100 KB: 18.9 ms warm | cluster 2,000 distinct: 14.8 ms | cluster exponent 1.07

✔ no dependency violations found (54 modules, 92 dependencies cruised)
Forbidden-word grep clean (packages/ui/src, apps/web/app, apps/web/lib).
[mirror-dry-run] OK -- the public-only tree installs and tests standalone
```

**Open questions for the advisor.** Five, all at the end of the report: the corpus's missing image and
expectation segments; the antonym limit that belongs to EPIC-012a; `cluster()`'s remaining worst-case
quadratic and whether EPIC-013 should cap input size; the two standing labelled-table misses and why
closing them would cost more than it buys; and `polarity.json` as a fourth data file the Scope did
not name.

**Context for the next session.** `classify()` and `cluster()` are the public contract now, alongside
`segment()`. EPIC-011b should take `Blok` as its input and add summaries as *metadata* — nothing in a
summary may change a range or a kind. `checkBlokInvariants()` is exported, so any epic that splits,
joins or re-anchors bloks can check itself against the same list rather than inventing its own idea
of a well-formed blok. Every judgement in this epic is a data file: `heuristics.json`, `topics.json`,
`stopwords.json`, `polarity.json` — which is what makes EPIC-080's and EPIC-005's findings a data
change here rather than a rewrite, as the standing note requires.
