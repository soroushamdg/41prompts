# EPIC-011a fix-up report: two verbs missing from `constraint-output-verb`

Branch `fix/epic-011a-constraint-verbs`. 2026-09-10. Ruled by Soroush the same day, off EPIC-013's
open question 1.

**Status: done.** One `heuristics.json` change. **Accuracy 96.7% (3 misses of 92) → 98.9% (1 miss of
92).** No snapshot moved, no blok merged that did not merge before, 370 tests pass.

---

## The ruling's premise was wrong, and so was my report

The ruling was: *"The three classifier misses are one pattern: a numbered list item whose verb the
`constraint-output-verb` heuristic cannot see past the list marker. Fix it as an EPIC-011a fix-up…"*

That came from EPIC-013's report, and EPIC-013's report was wrong. Measured before changing anything,
with and without the markers:

| segment | with marker | marker removed |
|---|---|---|
| `"1. Read the failing job's logs…"` | context | **still context** |
| `"1. Report differences in spacing…"` | context | **still context** |
| `"- Quote the exact line."` | **constraint** | constraint |

`classify.ts` has stripped a leading list marker before matching **since EPIC-011a itself**:

```ts
const LEADING_MARKER = /^[ \t]*(?:[-*+•][ \t]+|\d{1,9}[.)][ \t]+)/;
```

So the marker was never the blocker, and the change the ruling authorised would have been a no-op.
The three misses are **two causes**, not one shape:

| miss | cause |
|---|---|
| `tool-use-agent[5]` — "1. Read the failing job's logs…" | **"read" is not in the verb list.** Vocabulary. |
| `design-review-screenshots[6]` — "1. Report differences…" | **"report" is not in the verb list.** Vocabulary. |
| `bulleted-with-nesting[4]` — "Anything not covered here: use judgement and flag it." | "use" **is** in the list, but sits after a colon and the pattern is `^`-anchored. Structural. |

This fix-up does the vocabulary half — still one `heuristics.json` change, still what the ruling
intends — and deliberately leaves the `^` anchor alone. Loosening the anchor so a verb anywhere in a
sentence can classify it is a much wider change: `constraint-output-verb` is the second-lowest-priority
rule in the file, and unanchoring it would let a verb buried in any prose sentence claim it as a
constraint. That needs its own evidence and its own decision, not a fix-up.

---

## The change

```diff
-^(?:respond|reply|answer|return|output|format|write|use|include|omit|exclude|keep|limit|wrap|prefix|quote|cite|escalate|classify|group|page|set|name|strip|detect|sign off|prioriti[sz]e|summari[sz]e)\b
+^(?:respond|reply|answer|return|output|format|write|use|include|omit|exclude|keep|limit|wrap|prefix|quote|cite|escalate|classify|group|page|read|report|set|name|strip|detect|sign off|prioriti[sz]e|summari[sz]e)\b
```

Two verbs. Thirty alternatives, no duplicates (asserted while editing — the first attempt inserted a
second `group`).

---

## Accuracy, before and after

```
BEFORE   labelled-table accuracy 96.7% (3 miss(es) of 92)
           bulleted-with-nesting[4]      "Anything not covered here: use judgement and flag it."
           tool-use-agent[5]             "1. Read the failing job's logs before saying anything…"
           design-review-screenshots[6]  "1. Report differences in spacing, type scale, colour…"

AFTER    labelled-table accuracy 98.9% (1 miss(es) of 92)
           bulleted-with-nesting[4]      "Anything not covered here: use judgement and flag it."
```

---

## What it moved across the whole corpus

The ruling asked for every clustering snapshot the change moves, and for a stop if any looked like a
false merge. So the corpus was diffed segment by segment, before against after — not just the tests
re-run, because a green suite proves only that nothing *asserted* changed.

**Four fixtures changed, two more than the two labelled misses**, and every one is an improvement:

| fixture | segment | was | now | correct? |
|---|---|---|---|---|
| `tool-use-agent[5]` | "1. Read the failing job's logs before saying anything about the cause." | context | constraint | **yes** — labelled |
| `design-review-screenshots[6]` | "1. Report differences in spacing, type scale, colour and copy, in that order." | context | constraint | **yes** — labelled |
| `tab-indented[1]` | "- Read the whole thread. — Including the quoted replies." | context | constraint | **yes** — an instruction that was falling through to `context-default` |
| `wall-of-text[1]` | "Read the entire thread before you write anything, including the parts the customer quoted back at us." | context | constraint | **yes** — same, ×4 because that corpus repeats its passage |

All four were imperative instructions landing on `context-default` at confidence 0.2, which is the
fall-through, not a judgement. Neither of the two unlabelled ones is in the accuracy table, so neither
flatters the number above.

### No false merge, and here is why that is not luck

**Blok counts and shapes are identical before and after in all four fixtures:**

```
tool-use-agent              bloks=11 -> 11   shape unchanged (every blok single-range)
tab-indented                bloks=4  -> 4    shape unchanged
wall-of-text                bloks=10 -> 10   shape unchanged (four ranges each, before and after)
design-review-screenshots   bloks=10 -> 10   shape unchanged
```

Findings are unchanged too (1, 0, 0, 1 before and after). Clustering merges on **shared kind plus a
topic key or token overlap**, so changing a segment's kind can only ever *enable* a merge with a blok
of the new kind — and in every case here the reclassified segment's neighbours either already had a
different kind or fell below the overlap threshold. `wall-of-text` is the one to look at hardest,
since it repeats its passage four times and its bloks each own four ranges: those four ranges are the
four copies of the *same sentence*, before and after. Nothing new joined them.

**No committed snapshot moved at all** — 370 tests pass without `-u`. That is consistent rather than
suspicious: `classify()`'s output is not in the segment snapshots, and the fixtures that changed are
not in `CLUSTER_FIXTURES`, whose snapshots are the ones that pin merge decisions.

---

## Verify

```
pnpm --filter @41prompts/core test
```

Expected: 370 tests, and `labelled-table accuracy 98.9% (1 miss(es) of 92)`.

---

## Open question

**The remaining miss needs a decision, not a fix-up.** "Anything not covered here: use judgement and
flag it." has its verb after a colon, and `constraint-output-verb` is `^`-anchored. Options: leave it
(one miss in 92 is 98.9%); allow the pattern to skip a leading clause that ends in a colon; or drop
the anchor entirely, which I would not do — the rule sits second-from-last in the file precisely
because an unanchored verb match is weak evidence. Recommend leaving it until a second example of the
shape appears in the corpus.
