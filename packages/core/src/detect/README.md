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

> The Scope asks for a README per detector. This is one file with a section each instead — six
> stubs that cross-reference one another would be worse to read than one page you can search, and
> the substance the Scope asks for (what it fires on, what it deliberately does not, how to tune it)
> is here per detector. Flagged in the report.

## The rule that governs all six

**False positives are the failure mode.** A finding somebody disagrees with costs more trust than a
finding they never saw, because it teaches them to stop opening the panel. When a rule is ambiguous,
these stay quiet.

That is not a slogan; it is why `QUIET_FIXTURES` exists and why it was written **before** any
detector. Eleven prompts, each containing the exact surface feature one detector looks for, used
correctly. They produce **zero defect findings**, and a change that breaks that is a regression even
if it also finds something new.

**Zero *defect* findings, not zero findings — and the distinction is new in EPIC-012b.** Five of the
six kinds report something wrong with the prompt. `rule_without_check` does not: a prompt with no
`expected` blok at all is the common case, not an error, so "nothing is wrong with this prompt" and
"this prompt has an unchecked rule" are two different statements. Ten of the eleven quiet prompts are
completely silent; `quiet-negation-without-conflict` ends "Always include the pull request number for
each change", which genuinely has no check, and the test names that one fixture so a *second* one is
a failure rather than a shrug.

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

## `rule_without_check` — `rule-without-check.ts`

**Fires on:** a rule this prompt states that nothing in it verifies — a `constraint` blok carrying a
sentence that matches a shape in `rule-shapes.json`, where no `expected` blok covers it.

This is the finding that connects the decompiler to the rest of the product: it is the argument for
expected bloks, for checks and for the publish gate, made about the reader's own prompt before they
have signed up for anything.

### The measurement it is built on

**Not one of the 25 EPIC-010 corpus prompts contained a single `expected` blok** when this detector was written; EPIC-013 added two that do. So the coverage half
of this detector is always true on a real prompt, and "which of your rules lack checks" has the same
answer every time: all of them. An uncapped version reports sixty findings on the corpus.

The useful question is **which rules are worth naming**, and the answer here is: the ones whose check
can be named. `rule-shapes.json` does three jobs at once — it is the test for "verifiable", it
supplies the severity, and it writes the suggestion — so this detector *cannot* fire without being
able to say what check to add. That is decision 6 made structural rather than editorial.

| shape | check named | severity |
|---|---|---|
| `json-fields` | valid JSON shape | high |
| `json-output` | valid JSON shape | high |
| `allowed-values` | one of the allowed values | high |
| `word-limit` | word limit | high |
| `character-limit` | character limit | high |
| `must-contain` | must contain | medium |
| `must-not-contain` | must not contain | medium |

`high` is exactly the four machine-checkable shapes EPIC-012b's decision 5 names — JSON, a field
name, an allowed value, a length limit. File order is precedence, and it also decides **which
sentence is quoted** when one blok carries two shapes: a blok holding both "The JSON should have
these fields: category, priority, summary" and "Please make sure the output is valid JSON" quotes the
fields, because that is the more specific rule.

**Deliberately does not fire on:**

- a rule `untestable` claimed. Both read one list through one predicate
  (`untestablePhraseIn`), and one vague phrase anywhere in a range skips the **whole** range — so the
  two findings never overlap, which is stronger than "never the same range" and is the version a
  reader would notice. Never a highlight inside a highlight, one saying no check can be written and
  the other saying to add one.
- a rule `contradiction` claimed. "Add a check for this" is unusable while another finding says the
  rule should not be believed as stated; without this guard, a two-rule contradiction produced three
  findings. This one is wider than the epic asked for and is argued in the source.
- a rule `padding`, `too_long` or `repeated` claimed. Those say the rule is wordy, large or
  duplicated, all compatible with "and nothing checks it" — `fires-padding` is a case where both
  findings are worth having.
- **a rule no check kind covers.** "Never invent a change that is not in the input", "Never promise a
  date that depends on a bank", "Do not apologise more than once" are real rules, and this is silent
  on every one of them. `quiet-unverifiable-rules` pins that.

**One finding per blok**, ranges are the matching sentences. `repeated-sentence` states one JSON rule
four times in one blok: one rule, one check, one finding pointing at all four places. Sentences
rather than ranges because a range can be a whole paragraph, and quoting a paragraph that begins
"Never run a command that changes production…" to justify a finding that matched "Never print an
environment variable's value." points at the wrong text — measured, that change fixed six of thirteen
quotes on the corpus.

**Coverage is generous on purpose.** It reuses clustering's `topicOf`, `normalise`, `overlap` and
threshold, but **not** `MAX_VOCABULARY_RATIO`. That guard exists to stop clustering over-merging;
here the failures point the other way. Telling somebody who wrote a check that they did not is the
false positive that matters; a loose match only costs a missed pitch.

**Tuning:** add shapes to `rule-shapes.json`, each with the ADR-003 phrase for the check it names —
never an internal identifier, and never a phrase that is not a check kind the product will have. The
cap is `MAX_RULES_WITHOUT_CHECKS`, exported; it binds on exactly one corpus fixture. Every
addition must leave the quiet set free of new findings.

**Known limit:** the phrase lists are English. `right-to-left`'s "أجب دائماً بصيغة JSON فقط." is a
JSON rule this does not fire on, because the verb it needs is Arabic. And the *object* of a
"must contain" rule is not extracted, so 'Never write "various improvements"' produces "Add a
\"must not contain\" check" rather than naming the string that is already in quotes.

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
4. **Read the false-positive audit.** It prints every finding fired across the whole corpus.
   A finding you cannot defend in one line is a detector that needs narrowing — that is exactly how
   the `too_long` summing bug and the AI-identity padding false positive were caught.
5. A **seventh** `FindingKind` is an epic, not a patch. EPIC-012a's decision 3 said "exactly five"
   scoped to that epic; EPIC-012b's decision 2 added `rule_without_check` as the planned sixth and
   the last one in Stage 1.
