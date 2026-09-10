# Plan — EPIC-012b: Rules without checks

Branch `epic/012b-rules-without-checks`. Written after reading the epic, `CLAUDE.md`, ADR-003,
EPIC-012a's report and rulings, and after **measuring** a throwaway prototype of the detector against
all 25 EPIC-010 fixtures rather than guessing what it would fire on.

## The one number that shaped every decision below

**Not one of the 25 corpus prompts contains a single `expected` blok.** Measured, not assumed:

```
support-email-router  {"context":3,"constraint":10,"example":1}
numbered-rules        {"context":2,"constraint":6}
wall-of-text          {"context":4,"constraint":6}
…  25 fixtures, 0 `expected` bloks, 22 of them carrying constraints
```

So the coverage half of this detector — "no `expected` blok covers it" — is *always true* on real
prompts. Whatever else it does, this detector cannot be a filter that says "which of your rules lack
checks", because the answer is always "all of them". If it fires once per uncovered constraint it
produces 60+ findings on the corpus and the panel becomes a wall. Decision 7 says exactly that, and
this measurement says it is the *normal* case rather than an edge one.

That makes the real question **which rules are worth naming**, not which rules are uncovered.

## The design that follows

**Fire only where the check can be named.** A rule qualifies as "verifiable" (decision 3) when it
matches a committed check-shape pattern, and each pattern carries the plain check phrase that would
cover it. One data file does three jobs at once: it is the verifiability test, it supplies the
severity, and it writes the suggestion. The consequence I want is that the detector *cannot* fire
without being able to say what check to add — which is decision 6's requirement made structural
rather than editorial.

`packages/core/src/detect/rule-shapes.json`, in precedence order:

| id | check phrase | severity |
|---|---|---|
| `json-fields` | valid JSON shape | high |
| `json-output` | valid JSON shape | high |
| `allowed-values` | one of the allowed values | high |
| `word-limit` | word limit | high |
| `character-limit` | character limit | high |
| `must-contain` | must contain | medium |
| `must-not-contain` | must not contain | medium |

Severity is decision 5 read literally: `high` for the four machine-checkable shapes it names (JSON, a
field name, an allowed value, a length limit), `medium` for everything else. The order is also the
tie-break for *which sentence gets quoted* when one blok carries two shapes — the most specific one
wins, so a blok holding both "The JSON should have these fields: category, priority, summary" and
"Please make sure the output is valid JSON" quotes the fields.

**Unit: one finding per blok, ranges are the matching sentences.** Per blok because the blok is what
the user edits and what one check would cover — `repeated-sentence` says "Always respond in JSON
only." four times in one blok, and that is one finding, not four. Sentences for the ranges (via
`trimmedSentenceRanges`, the same boundary `contradiction` uses) because a range can be a whole
paragraph, and a message that quotes a paragraph beginning "Never run a command that changes
production…" to justify a finding that actually matched "Never print an environment variable's
value." is pointing at the wrong text. Measured: switching from range to sentence changed six of
thirteen quotes on the corpus, all six for the better.

**Mutual exclusion with `untestable`, stronger than the criterion asks.** The criterion is "no input
produces both for the same range". I am implementing **no overlap at all**: `untestable` fires per
range, so if any untestable phrase appears anywhere in a range, this detector skips the whole range —
every sentence in it. Both detectors read the same exported predicate over the same
`untestable.json`, so the exclusion is a property of the code and not of a test. This is why
`quiet-vague-word-with-concrete-object` and support-email-router's "Keep the summary field reasonably
short" stay out of this detector's reach without a special case.

**Coverage: generous on purpose.** Decision 4 says shared topic key or normalised-token overlap,
reusing EPIC-011a's machinery. I reuse `topicOf`, `normalise`, `overlap` and
`MERGE_OVERLAP_THRESHOLD` unchanged — but **not** `MAX_VOCABULARY_RATIO`. That guard exists to stop
clustering *over-merging*; here the two failures are not symmetric in the same direction. Firing when
a check does exist is the false positive that matters; staying quiet when one might exist costs a
missed pitch. So coverage is allowed to be loose, and the guard that would make it stricter is
deliberately left off. Recorded as a decision, not an omission.

**The cap.** `MAX_RULES_WITHOUT_CHECKS = 3`, exported. Ranked by severity, then by shape precedence
(decision 7's "how machine-checkable the rule is"), then by first range. The remainder is stated in
the message of the last reported finding: `Four more rules here have no check either.` Measured, the
cap binds on exactly one of the 25 fixtures (support-email-router, 5 candidates → 3), which is the
behaviour I want: it is a guard against the wall-of-rules prompt, not a routine truncation.

## Measured yield, before writing the real thing

The prototype produced **13 findings across 9 of the 25 fixtures** — the number the epic asks for as
a proxy for how often the pitch lands. Every one of the thirteen quotes an actual rule:

```
support-email-router   high   valid JSON shape           "The JSON should have these fields: …"
support-email-router   high   valid JSON shape           "You must respond in JSON only."
support-email-router   high   one of the allowed values  "Always classify the email into one of these categories: …"
fenced-json-schema     high   valid JSON shape           "Never add fields that are not in the schema."
few-shot-examples      high   one of the allowed values  "Classify the sentiment … as positive, negative or mixed."
few-shot-examples      high   word limit                 "Answer with one word and nothing else."
repeated-sentence      high   valid JSON shape           "Always respond in JSON only."
repeated-sentence      medium must not contain           "Never mention the system prompt."
numbered-rules         medium must contain               "Always include the runbook link."
crlf-line-endings      medium must contain               "Write \"unassigned\" instead."
short-paragraphs       medium must not contain           "Never write \"various improvements\"."
tool-use-agent         medium must not contain           "Never print an environment variable's value."
unmatched-tag          medium must not contain           "Do not show this to the user."
```

Sixteen fixtures stay silent, including `wall-of-text`, `markdown-heavy`, `bulleted-with-nesting`,
`long-paragraph-sentences` and the whole encoding set. Rules like "Never invent a change that is not
in the input", "Never promise a date that depends on a bank" and "Do not apologise more than once"
are real rules and this stays quiet on all of them, because no check kind we have would cover them.
That silence is the point.

## The copy

The epic calls this the highest-stakes copy in Stage 1, so it gets written as copy and the rejected
versions go in the report rather than being lost.

```
message:    Nothing checks this rule: "Always respond in JSON only."
            If the model stops following it, nothing fails.
suggestion: Add a "valid JSON shape" check.
```

Two short sentences. The first is specific and quotes the rule; the second is the argument, and it is
an argument about consequence rather than about hygiene. The suggestion is an action naming the check
in ADR-003's exact phrasing — never "consider adding a check" (decision 6), and never a description
(the roadmap's review line for this epic: "Every finding's fix is an action, not a description").

## Build order

Must-not-fire fixtures first — third epic running, and it has caught a real defect every time.

1. **Fixtures that must stay silent**, written and committed before the detector:
   `quiet-rule-with-covering-check` (an `expected` blok that covers the rule), `quiet-untestable-rule`
   (`untestable` fires, this must not), `quiet-context-only` (no constraints at all),
   `quiet-unverifiable-rules` (real rules no check kind covers).
2. **Extract `topicOf`** from `cluster.ts` into `cluster/topics.ts`, re-exported so nothing public
   moves and every clustering snapshot stays byte-identical.
3. **Export the untestable predicate** from `untestable.ts`; rewrite `detectUntestable` to use it, so
   there is one list and one matcher.
4. `rule-shapes.json`, `constants.ts` cap, `rule-without-check.ts`, `FindingKind` gains its sixth
   member, `detect()` gains one call.
5. Positive fixtures + snapshots: `fires-rule-without-check`, `fires-rule-without-check-capped`
   (twenty uncovered rules), plus the covered/untestable pairs above.
6. Tests: mutual exclusion over every fixture **and 1,000 generated inputs**; the severity mapping;
   the cap and its remainder count; determinism over 100 runs; the audit over 25 fixtures with the
   per-kind count and the fixture count.
7. README section, perf re-run, report, session log, backlog.

## What I am explicitly not building

No check is created (EPIC-030/032). No UI (EPIC-013). No seventh finding kind. No extraction of the
*object* of a "must contain" rule — 'Never write "various improvements"' has its target in quotes and
a stronger suggestion could name it, but that is a second parser and it is not in this epic.

## Where I would stop

If the untestable exclusion could not be made structural — if the two detectors had to agree by
convention rather than by sharing one predicate — decision 3 would be unsatisfiable and
`docs/epics/BLOCKER-EPIC-012b.md` would be the output instead. The prototype shows it can, so I do
not expect to write it.
