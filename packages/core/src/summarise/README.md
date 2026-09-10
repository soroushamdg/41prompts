<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# The summariser seam

A summary is a short line describing what a blok says, so somebody scanning forty cards knows what
each one is without reading its source.

```ts
interface Summary { text: string; source: "heuristic" | "model"; inputHash: string }
interface Summariser { readonly version: string; summarise(blok: Blok, source: string): Summary }
interface AsyncSummariser { readonly version: string; summarise(blok: Blok, source: string): Promise<Summary> }
```

**A summary is metadata about the text, never a replacement for it** (`CLAUDE.md` rule 3). The
compiler emits the blok's verbatim source span; it never emits this. There is no compiler yet, so
`never-compiled.test.ts` holds the rule open as a tripwire that fails the moment one exists, with
instructions — because by the time somebody is writing a compiler, the reason a summary must never
reach its output is three epics behind them, and the failure is silent: a compiled prompt that reads
fine, is shorter than the source, and no longer says what the author wrote.

## Two interfaces, on purpose

`Summariser` is synchronous and `AsyncSummariser` is not. Making one async interface would force
every caller in `packages/core` to await something that never yields, and would hide the difference
that matters: one of these can fail and the other cannot. Two honest shapes beat one that pretends.

`source` is required and is never inferred. A caller can always tell a mechanical summary from a
model's — EPIC-013 shows it rather than presenting both alike, and decision 7 leaves the visual
treatment to that epic and to what EPIC-080 finds out about how far people trust these.

## The cache key

`summaryInputHash(blok, source, version)` covers:

- **every range's text**, length-prefixed, so two different fragment splits of the same characters
  cannot collide;
- **the blok's kind**, because the summary depends on it;
- **the summariser's version**.

It deliberately does **not** cover the ranges' offsets or the surrounding prompt. Moving a rule to a
different place in a prompt does not change what the rule says, so it must not throw the summary
away — and on a canvas where reordering is an ordinary edit, that is the difference between a cache
that helps and one that misses constantly.

### Why the kind is in there

Decision 5 describes the hash as covering "the blok's verbatim text plus the summariser's own
version identifier". Decision 3 has the heuristic prefix the blok's kind. Those two cannot both be
read literally: if the summary depends on the kind and the key does not, a blok reclassified from
`context` to `constraint` keeps its old summary for ever — a stale cache, the one failure a
content-addressed key exists to prevent.

A cache key covers every input the function reads, or it is not a cache key. This is the one place
this module deviates from a literal reading of its epic, and it is flagged in the report.

### Version is the whole invalidation mechanism

There is no cache to purge and no invalidation logic to remember. Change what an implementation
produces — a reworded prompt, a different truncation, a new prefix, a different model — and bump its
`version`; every summary the old behaviour produced becomes unreachable at once.

The worker's version is `model@1:<pinned model id>`, so changing model invalidates everything by
construction rather than by anybody remembering to.

## The heuristic is deliberately dumb

First sentence, kind-prefixed, truncated at `SUMMARY_MAX_LENGTH` (84). It does not paraphrase, does
not extract keywords, does not score anything, and does not guess what the author meant.

That is the design, not a limitation. A summary that is obviously mechanical is safer than one that
sounds confident and is wrong, and EPIC-080 exists partly to find out how far users trust these at
all. Resist making it cleverer until that study says something.

**A multi-range blok summarises the blok, not its first range** (decision 8). If every range's first
sentence is identical, that sentence is the summary. If they disagree, the summary is
`"<Kind> stated in N places"` and makes **no content claim at all** — showing only the first range
would be lying by omission on a card whose whole job is to say what the blok contains, and the count
is the honest and useful fact, because a rule stated in several places is itself the defect the
product exists to surface.

`context` gets no prefix. It is the default kind — what a segment is when nothing more specific
fired — so prefixing it would put a confident label on the least confident classification in the
package.

## Adding an implementation

1. **Pick the interface.** Synchronous and pure ⇒ `Summariser` and it can live in `packages/core`.
   Anything that goes somewhere for its answer ⇒ `AsyncSummariser`, and it lives in `apps/worker`
   (`CLAUDE.md` rule 2: models label and summarise, from the worker).
2. **Give it a `version`**, and put anything that changes its output into that string — the model id,
   the prompt revision, the truncation.
3. **Run the shared contract suite over it.** `SUMMARY_CONTRACT_CASES` and `checkSummaryContract()`
   are one file; `packages/core` and `apps/worker` both import it, so the two implementations cannot
   drift into satisfying different contracts. The cases are the shapes that make summarisers throw:
   empty, whitespace-only, a single character, no ranges, 10,000 characters with no sentence end,
   punctuation only, a lone surrogate, and a multi-range blok whose ranges disagree.
4. **Never trust output shape.** The worker collapses and truncates whatever the model returns. A
   contract that only holds when the model cooperates is not a contract.
5. **Fail soft.** A failed summary must never fail a decompile. Fall back to the heuristic and return
   `source: "heuristic"` with the heuristic's own cache key — a fallback keyed to the model version
   would sit in the cache pretending to be a model summary.
