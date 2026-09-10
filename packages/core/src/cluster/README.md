<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# Clustering

`cluster(segments)` turns a flat list of segments into bloks. A blok is one thing the author meant
and **every place in the source where they said it**.

```ts
cluster(segments: readonly Segment[]): Blok[]
interface Blok { id: string; kind: BlokKind; ranges: readonly Range[] }
```

`ranges` is always an array, even for one range (`CLAUDE.md` rule 5). That is the product, not
defensive typing: a rule stated in the opening paragraph and restated in a numbered list at the end
is *one* blok the user edits once, and every feature downstream inherits the plural — failure
attribution can point at three places at once, and recompiling emits the rule in one place. The
type-level half of that promise is in `ranges-are-plural.ts`, which stops compiling if `Blok` is ever
widened to admit a bare range.

## The merge rule

Two segments join when they share a **kind** and either a **topic key** or a normalised-token
**overlap ≥ `MERGE_OVERLAP_THRESHOLD`** (0.6) — and none of the guards below says no.

Normalisation is the prototype's: lowercase, drop everything that is not a letter, digit or
underscore, split on whitespace, drop words of three characters or fewer and the committed stop
list. No stemming; it is locale-sensitive, and a merge that depends on the process's locale is not
deterministic.

Overlap is measured against the group's **first** fragment, not its most recent, so the result does
not depend on the order a group happened to grow in.

### Why the guards exist

Decision 10 ranks the two failures, and they are not symmetric. A missed merge leaves the user two
bloks they can join in one gesture. A wrong merge hides text inside a blok they never expected to own
it — and hides a contradiction from EPIC-012a, whose detector compares bloks and cannot see inside
one.

Collapsing the prototype's eight kinds onto six makes this sharper: `constraint` is now a catch-all,
so "share a kind" filters far less than it did, and the merge rule sees many more candidate pairs.

Each guard below exists because `fixtures/prompts.ts`'s **`false-merge`** fixture proved it
necessary. That fixture was written before the merge rule, which is the only order in which it could
have proved anything.

1. **A topic key names a policy, not a subject.** `\bmarkdown\b` is a subject, and a subject key
   merges every rule that happens to be about that subject. This is not hypothetical: the
   prototype's `json-shape` key — `/\b(fields?|schema|category|priority|needs_human)\b/i` — fuses
   "keep the summary field short", "set the priority field to high" and "be professional in the
   summary field" into a single blok, on the word *field*. `json-only` is a policy; the dropped
   `json-shape` was not.
2. **Polarity.** A rule never merges with its own contradiction, however strong the token overlap.
   "Always respond in JSON only." and "Never respond in JSON when the caller asked for plain text."
   share two of three normalised tokens — 0.667, over the threshold — and classify the same. The
   cost is real and is the one decision 10 asks us to pay: "always respond in JSON" no longer merges
   with "do not include any explanation outside the JSON", which are two phrasings of one intent.
   Bare "no" is deliberately **not** a negative marker, because "with no extra text" is a positive
   requirement phrased with a negative word.
3. **`MIN_OVERLAP_TOKENS`.** Normalisation drops short words, so "Use markdown." is the single token
   `{markdown}`, and one shared token out of one scores 1.0 — the highest the measure can produce,
   on the least evidence it can have. At 1, a heading-style rule gets filed inside a "use markdown"
   blok.

### A known limit

Token overlap cannot tell "keep the summary short" from "keep the summary long": 0.75 overlap, no
negation, same kind. They merge, and that is a contradiction hidden inside one blok. There is no
deterministic fix here that is not an antonym table, and an antonym table is a locale-sensitive
guess. EPIC-012a's contradiction detector is the right place for it, and its own tests should cover
this shape.

## Blok ids and order

Ids are `blok_` plus sixteen hex digits of FNV-1a over the kind and every range's offsets and exact
text. Derived from content rather than a counter, so re-running over the same input produces the same
ids and a diff of two runs is empty rather than renumbered. Including the offsets makes ids unique
within a prompt by construction — two bloks cannot share a first range — so there is no collision
tie-break to make non-deterministic.

Bloks are ordered by the `start` of their first range. Ranges within a blok are sorted, never
overlap, and are **never coalesced**, even when exactly adjacent: decision 6 says a range must never
cover text the blok does not own, and never coalescing is that rule with no edge cases left to get
wrong.

## Adding a topic key

1. **Make it a policy, not a subject.** See guard 1. If the key would match any sentence merely
   *about* a subject, it will merge unrelated rules about that subject.
2. **Add it to `topics.json`.** Order is precedence — `topicOf` returns the first match — so a broad
   key placed early shadows narrower ones after it.
3. **Regenerate and read the diff.**
   ```
   pnpm --filter @41prompts/core exec vitest run -u
   git diff packages/core/src/cluster/fixtures/snapshots/
   ```
4. **Justify every snapshot that moved and every one that did not.** A key that moves nothing is not
   covered by a fixture; add one, or you have shipped an untested key.
5. **The `false-merge` test must still pass.** It is not a snapshot — it is four assertions, each
   naming the threshold or key that would have to change to break it. A new topic key that breaks it
   is a wrong key, not a fixture to update.

### A worked example

Adding a subject-shaped key to `topics.json`:

```json
{ "key": "record-fields", "flags": "i", "pattern": "\\b(?:summary|priority) field\\b" }
```

Regenerating changes **exactly two snapshots** — `false-merge` and `prototype-sample`, the two
prompts that mention those fields — and fails two tests:

```
 M packages/core/src/cluster/fixtures/snapshots/false-merge.snap.txt
 M packages/core/src/cluster/fixtures/snapshots/prototype-sample.snap.txt

-# 9 blok(s), 0 of them multi-range
+# 8 blok(s), 1 of them multi-range
-[2] blok_b58e2e60 constraint ranges=1
+[2] blok_7b9cc265 constraint ranges=2

× the false-merge fixture > keeps three unrelated rules apart even though each mentions a field
  → expected 2 to be 3
```

That is the prototype's defect recreated in miniature, in one line of data, caught by a test that
says which rule it broke. The lesson is the point of the section above: the snapshots tell you *what*
changed, and `false-merge` tells you whether you were allowed to change it.

An earlier attempt at this example, keyed on `\bsummary field\b`, changed **nothing** — because
`topicOf` returns the first match and "Always be professional and friendly in the summary field"
matches `tone-of-voice` before it ever reaches a later key. Worth knowing before you conclude your
new key is harmless: it may simply be shadowed.
