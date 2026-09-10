<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# Detectors

`detect(bloks, source)` returns findings: specific, defensible problems, each pointing at the text
that causes it.

```ts
detect(bloks: readonly Blok[], source: string): Finding[]
interface Finding {
  id: string; kind: FindingKind; severity: Severity;
  message: string; bloks: readonly string[]; ranges: readonly Range[]; suggestion?: string;
}
```

This is the visible value of the decompiler. Segmentation, clustering and summaries are plumbing
nobody asked for; findings are the reason anyone pastes a prompt in.

> The Scope asks for a README per detector. This is one file with a section each instead — five
> stubs that cross-reference one another would be worse to read than one page you can search, and
> the substance the Scope asks for (what it fires on, what it deliberately does not, how to tune it)
> is here per detector. Flagged in the report.

## The rule that governs all five

**False positives are the failure mode.** A finding somebody disagrees with costs more trust than a
finding they never saw, because it teaches them to stop opening the panel. When a rule is ambiguous,
these stay quiet.

That is not a slogan; it is why `QUIET_FIXTURES` exists and why it was written **before** any
detector. Six prompts, each containing the exact surface feature one detector looks for, used
correctly. They currently produce **zero** findings, and a change that breaks that is a regression
even if it also finds something new.

Findings are advisory. Nothing blocks, nothing is auto-fixed — blocking belongs to publishing.

## `repeated` — `repeated.ts`

**Fires on:** two bloks that say substantially the same thing, using EPIC-011a's normalised-token
overlap and threshold.

**Deliberately does not fire on:** a blok with several ranges. That is not a defect, it is what
clustering is *for*, and EPIC-013 shows the range count on the card.

That constraint has a consequence worth understanding before tuning: any two bloks over the
threshold that also share a kind **were already merged into one blok**, so a naive "overlap ≥ 0.6
across bloks" would never fire at all. What this actually reports is the pair clustering
deliberately refused — most usefully, the same instruction said twice in two registers, once as role
context and once as a numbered rule. On the decompiler prototype's own sample that is a true finding
the prototype misses entirely.

Polarity mismatches are skipped: those disagree rather than repeat, and belong to `contradiction`.

**Tuning:** the threshold is `REPEAT_OVERLAP_THRESHOLD`, re-exported from clustering so there is only
ever one answer to "are these the same thing?". Changing it changes merges too — that is the point.

## `contradiction` — `contradiction.ts`

**Fires on:** two **sentences** that overlap substantially and either oppose in polarity or differ by
an antonym pair from `antonyms.json`.

Sentences, not bloks, and that is the whole design. Three shapes have to be caught and only the first
is visible at blok level:

1. across two bloks — "Always respond in JSON only" against "Never respond in JSON";
2. inside one blok — the case EPIC-011a carried forward, where token overlap merges "keep the summary
   short" and "keep the summary long" into a single blok, so a blok-level detector can never see it;
3. inside one range — two adjacent sentences of one paragraph.

**Deliberately does not fire on:** a negation and a requirement that merely share a noun. The
prototype pairs any blok holding a negation with any blok that does not, sharing any of eight
hard-coded nouns; run on its own sample that produces one false positive for every true finding.

### The limit, measured

There is a real contradiction this does **not** find: "Do not use markdown formatting in your
response." against "Format the summary as a markdown bullet list". `LIMIT_FIXTURES` pins it, because
a limit that is not pinned gets rediscovered as a bug.

It is not caught because nothing lexical separates it from a false positive:

| pair | polarity | overlap | shared tokens inside the negated scope |
|---|---|---|---|
| "Do not use markdown…" / "Format … as a markdown bullet list" | negative/neutral | 0.33 | `["markdown"]` |
| "Never invent a change…" / "Always include the number for each change" | negative/positive | 0.25 | `["change"]` |

The first is a contradiction; the second is two compatible rules about the same noun. The difference
is what the verbs do to the shared object, which needs parsing this package will not do. Change this
only with evidence that separates those two rows.

**Tuning:** add pairs to `antonyms.json`. Pairs only — a scale (`short`/`medium`/`long`) needs an
ordering nobody has agreed on. Every addition must leave `QUIET_FIXTURES` silent.

## `untestable` — `untestable.ts`

**Fires on:** a rule stated so vaguely no check could verify it, from the phrase list in
`untestable.json`.

**Deliberately does not fire on:** a vague-sounding word attached to something concrete. "A good
migration is one that runs in under 30 seconds on 10 million rows" is testable, and a detector that
flagged it would be wrong in a way the reader can see instantly. Several entries carry an explicit
guard for that; `high-quality`, for instance, does not fire when the text goes on to define it.

Nor does it fire on a `context` blok. Context describing who the model is was never going to be
checked, so calling it untestable is noise.

**Tuning:** whole phrases, never suggestive single words. "good" alone fires on the migration
sentence above. This and `padding` are the two most likely to annoy; bias both hard toward silence.

## `padding` — `padding.ts`

**Fires on:** text that costs tokens and carries no instruction — courtesy aimed at the model, and
the model being told what it is.

**Deliberately does not fire on:**

- anything inside an `example` blok. "Please" in quoted example input is the customer's word, not the
  author's padding.
- a phrase that is the *object* of a rule about it. "Never mention that you are an AI model" contains
  "you are an AI model" as the thing the rule forbids saying; flagging it would tell the author to
  delete the subject of their own rule. Entries carry an `unless` pattern for this.

**Tuning:** each entry has `pattern`, a `quote` for the message, and an optional `unless`. Found in
the false-positive audit, not by design — which is what the audit is for.

## `too_long` — `too-long.ts`

**Fires on:** a blok whose longest range exceeds `MAX_BLOK_WORDS`, or a prompt exceeding
`MAX_PROMPT_WORDS`.

**The longest range, not the sum.** A blok's ranges are restatements of one instruction, so a rule
said four times is not four times too long — it is one rule said four times, which is `repeated`'s
business. Summing them put ten findings on the `wall-of-text` fixture, each counting the same
sentence four times.

**Known limit:** this is a length proxy for "carries more than one instruction", and the proxy is
wrong for a single instruction that genuinely needs ninety words. It will fire there. Both thresholds
are exported and revisitable once EPIC-084 has the real distribution.

## Messages

Product copy, for a senior engineer who is busy and slightly sceptical.

- Specific, and quoting the text where it can.
- Never scolding, and never "consider revising" — a suggestion is a concrete rewrite or "add a check
  for this".
- No forbidden word (ADR-003). The compliance job greps these.

## Adding or tuning a detector

1. **Write the must-not-fire case first**, in `QUIET_FIXTURES`. The sequencing has now caught a false
   merge in EPIC-011a, an unreachable rule in EPIC-011b, and two false positives here.
2. Add the positive fixture to `NOISY_FIXTURES`.
3. Regenerate snapshots and read the diff:
   ```
   pnpm --filter @41prompts/core exec vitest run -u
   git diff packages/core/src/detect/fixtures/snapshots/
   ```
4. **Read the false-positive audit.** It prints every finding fired across all 25 EPIC-010 fixtures.
   A finding you cannot defend in one line is a detector that needs narrowing — that is exactly how
   the `too_long` summing bug and the AI-identity padding false positive were caught.
5. A sixth `FindingKind` is an epic, not a patch (decision 3).
