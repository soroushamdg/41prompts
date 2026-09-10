# Plan — EPIC-012a: Five detectors

Branch `epic/012a-detectors`. Written after reading the epic, `CLAUDE.md`, EPIC-011a's and
EPIC-011b's reports, and after **running** the prototype's `diagnose()` rather than reading it.

## What the prototype actually reports

Extracted `segment`/`cluster`/`diagnose` verbatim and ran them on the sample: 15 segments, 10 bloks,
**9 findings**.

```
[0] high  -   5 rules, 0 assertions              ← EPIC-012b's, out of scope here
[1] high  b9  Contradiction on "summary"         ← real contradiction, WRONG pair
[2] high  b4  Contradiction on "summary"         ← false positive
[3] med   b4  Rule split across 3 places
[4] low   b4  Politeness padding                 ← real
[5] med   b6  Rule split across 3 places         ← from a false merge (EPIC-011a)
[6] med   b6  Untestable language: "reasonably"  ← real
[7] med   b8  Rule split across 2 places         ← from a false merge
[8] med   b8  Untestable: "best judgement"       ← real
```

Its contradiction rule is: *any* blok containing a negation, paired with *any* blok not containing
one, sharing *any* one of eight hard-coded nouns (`markdown|json|explanation|format|summary|bullet|
list|prose`). That is not a contradiction test, it is a co-occurrence test.

- **[2] is a false positive.** Blok 5 ("The JSON should have these fields… Do not include any
  explanation outside the JSON") and blok 7 (rules about the summary field) share the word *summary*
  and contradict nothing.
- **[1] is real but misattributed.** The genuine contradiction — "Do not use markdown formatting in
  your response. Format the summary as a markdown bullet list" — is **inside one segment**, and the
  prototype reports it against an unrelated blok that happens to share a noun.

That second one is the whole reason decision 6 says this detector inspects *ranges*, not blok pairs.
It also tells me the working unit has to be finer than a range: this contradiction lives inside a
single segment, between two adjacent sentences.

Three of the prototype's nine findings (`[3]`, `[5]`, `[7]`) count fragments of bloks that EPIC-011a
showed were **false merges**, so they do not survive contact with the current clustering at all.

## The five detectors

### `repeated` — and why it cannot mean what the prototype meant

The prototype's "rule split across N places" counts a blok's own fragments. Under EPIC-011a that is
not a finding, it is the clustering output — and decision 6 is explicit: `repeated` "fires across
bloks; never inside one".

But decision 6 also says to reuse EPIC-011a's overlap and threshold, and here is the catch: **any two
bloks that overlap ≥ 0.6 with the same kind and compatible polarity were already merged into one
blok.** A naive port would therefore never fire on the case it is named for.

What it *can* find is the case clustering deliberately refused: two bloks over the threshold that
were kept apart because their **kinds differ**. That is a real and useful finding — "You should
always be professional and friendly" in the role paragraph, and "Always be professional and friendly
in the summary field" as rule 6, are the same instruction said twice in two registers. Polarity
mismatches are excluded, because those are contradictions and belong to the other detector.

### `contradiction` — on sentences, not bloks

Working unit: **sentence spans** inside every range, using the segmenter's own rule-6 boundary so a
finding never points somewhere the segmenter would not have cut. Two spans contradict when they
overlap substantially in normalised tokens **and** either:

- their polarity opposes (EPIC-011a's `polarity.json`, reused rather than re-invented), or
- they differ by an **antonym pair** from a committed list — the case carried from EPIC-011a, where
  "keep the summary short" and "keep the summary long" have 0.75 overlap, no negation, and get merged
  into one blok.

Comparing spans rather than bloks is what lets it see inside a blok, inside a range, and between two
adjacent sentences of one paragraph — which is where the prototype's own sample hides its only real
contradiction.

### `untestable`, `padding` — data, and biased hard toward silence

Committed phrase lists. The epic says these two are the most likely to annoy; both get their
must-not-fire fixtures written first, and neither fires on a phrase that has a legitimate reading in
context. `padding` in particular will not fire on "please" inside quoted example text.

### `too_long` — two exported thresholds

One for a single blok, one for the whole prompt. Both named, both exported, both revisitable when
EPIC-084 has real distribution data.

## A tension to flag now

Criterion 7 says "a contradiction names at least two [blok ids]". The antonym criterion says the
carried-forward case is "a blok containing both 'keep the summary short' and 'keep the summary
long'" — **one** blok.

Those cannot both hold. `bloks` will be a deduplicated set, so a within-blok contradiction names one
blok and a cross-blok contradiction names two; the criterion's "at least two" holds for the case it
describes. Listing the same id twice to satisfy the letter would make `bloks` a bag rather than a
set, and every consumer would have to dedupe it. Flagged in the report.

## Order of work — must-not-fire first

The sequencing that caught real defects in EPIC-011a and EPIC-011b, kept:

1. Epic committed, `CURRENT.md` mirrored, backlog marked. *(done)*
2. **The must-not-fire fixture set, and a test asserting silence on it, before any detector.**
3. `Finding`/`Severity` types, ids, ordering, the invariant checker.
4. One detector at a time: positive fixture, near-miss fixture, snapshot.
5. Whole-prompt fixture with several findings and a committed ordering.
6. The prototype's sample end to end — segment → cluster → summarise → detect — snapshotted and
   compared with the prototype's nine findings in the report.
7. The false-positive audit over all 25 EPIC-010 fixtures, every fired finding listed and judged.
8. Determinism ×100, range-bounds invariant over 1,000 generated inputs, the 100 KB gate with
   detection included.
9. READMEs, self-review, full gate, PR, squash-merge on green.
10. Report, session log, backlog; `CURRENT.md` left on EPIC-012a.

## Risks

- **False positives are the failure mode.** The audit is the deliverable, not a formality: every
  finding on all 25 fixtures gets a one-line judgement in the report, and a finding I cannot defend
  in one line is a detector that needs narrowing.
- **`untestable` and `padding` annoying people.** Both biased to silence, both with near-miss
  fixtures written first.
- **Messages are product copy**, and they go through the forbidden-word grep. Written for a busy,
  slightly sceptical senior engineer: specific, quoting the text, never scolding.
- If a detector cannot be made deterministic without guessing, `docs/epics/BLOCKER-EPIC-012a.md` and
  stop.
