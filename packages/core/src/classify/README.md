<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# The classifier

`classify(segment)` gives a segment one of the six kinds in `CLAUDE.md`, a confidence, and the id of
the heuristic that decided it.

```ts
classify(segment: Segment): { kind: BlokKind; confidence: number; matched: string }
```

No model is involved and none will be without an ADR (`CLAUDE.md` rule 2). A kind decides how text
compiles; a compilation that changed because a model was in a different mood is not a prompt layer,
it is a liability.

## The six kinds

`context | constraint | example | expected | image_ref | image_input`, and `src/classify/types.ts`
is the only place they are spelled. The standing research note says EPIC-080's findings can change
how kinds are *presented* — so presentation must never re-spell them.

**`context` is the safe default.** Anything nothing else claims lands there, at confidence 0.2,
because context compiles to text unchanged: a wrong `context` costs a label, where a wrong
`expected` invents a check that can fail a publish. Both of the labelled table's current misses fall
this way, which is the failure direction to want.

## What fires, in what order

`heuristics.json` is an ordered list and **first match wins**, so the file's order *is* the
precedence and reordering it changes behaviour. The groups, top down:

| Order | Group | Why here |
|---|---|---|
| 1 | `image_ref`, `image_input` | Most specific patterns in the file, and the two kinds no other rule can produce. |
| 2 | `expected` | Narrow on purpose — explicit expectation phrasing only. This kind compiles to a check rather than to text, so a false positive does not mislabel a blok, it invents a check. |
| 3 | `example` | Before the constraint markers, because an example that states a rule is still an example: the rule is being *demonstrated*, not imposed. |
| 4 | `context` role patterns | Before the constraint markers too, because "you must" inside a persona sentence describes who the model is rather than adding a rule. |
| 5 | `constraint` | Modal verbs, conditionals, prohibitions, output shape, output verbs, tone. The bulk of any real prompt. |
| 6 | `context` procedure, then the default | Everything left. |

A leading list marker is stripped before matching. "2. Set a priority" is the same rule as "Set a
priority", and every `^`-anchored heuristic would otherwise miss every numbered rule in every
prompt — which is most of the rules in most prompts.

## Confidence

A number in `[0, 1]` that is **not a probability**. It is an ordering device: it says which of two
classifications rests on more specific evidence, so a UI can hedge and a later epic can prefer one
signal over another. Nothing divides by it and no threshold treats it as a frequency. Do not invent
calibration for it.

## Accuracy, and what it does not cover

`fixtures/labelled.json` holds 60 examples drawn from the EPIC-010 corpus and the decompiler
prototype's sample, each keeping its provenance — fixture name and segment index — so it is
checkable that the text is real prompt text and not written to suit a pattern. **The labels were
chosen before any heuristic existed.** That is the only defence against a table that flatters the
classifier it is meant to measure, and it is why the two current misses are reported rather than
relabelled: sixty rows I chose myself would tell me nothing if I also got to move the target.

Current accuracy is 96.7%, against a target of 90%.

The corpus contains **no image segment and no expectation segment** — 25 real prompts, not one of
them multimodal or written as a check. So three of the six kinds get no coverage here at all. They
have a small separate labelled set in `classify.test.ts`, marked for what it is, and the gap is a
real finding: until EPIC-013's fixtures include multimodal prompts, those heuristics have never seen
a prompt somebody actually wrote.

## Adding a heuristic

1. **Decide where in the order it goes**, and say why in the same commit. A pattern added at the
   bottom fires only for text nothing else claimed; one added at the top can quietly take work from
   every rule below it.
2. **Add the row to `heuristics.json`** — `id`, `kind`, `confidence`, `pattern`, `flags`. The `id` is
   what `classify()` returns as `matched`, so make it name the evidence, not the kind:
   `constraint-modal` tells you what to go and look at, `constraint-3` does not.
3. **Run the labelled table.** It prints every miss with the heuristic that fired.
   ```
   pnpm --filter @41prompts/core exec vitest run src/classify
   ```
4. **Then run the clustering snapshots**, because a kind change moves merges: two segments only ever
   join when they share a kind.
   ```
   pnpm --filter @41prompts/core exec vitest run src/cluster
   ```
5. **Check the pattern is linear.** `src/pattern-shape.ts` rejects a quantified group whose body is
   already quantified, and `cluster.test.ts` runs every committed pattern through it. A new pattern
   that trips it is a build failure, not a review comment.
