# EPIC-012b report: Rules without checks

Branch `epic/012b-rules-without-checks`. 2026-09-10.

**Status: done.** `rule_without_check` is the sixth and last `FindingKind` of Stage 1. `detect()`'s
signature is unchanged, zero new dependencies, 358 tests. The audit stands at **13 findings across 9
of the 25 EPIC-010 fixtures** — every one judged below, none of them a false positive — and 17
findings in total, still under the standing cap of 20. `pnpm test`, `pnpm typecheck`, `pnpm lint`,
`pnpm compliance` and `pnpm binary-files` are clean.

Mutual exclusion with `untestable` is not just proven, it is **structural**: one list, one exported
predicate, and a range vetoed whole. The property test asserts something stronger than the criterion
asked for — no *overlap*, not merely no identical range — over every fixture, every named edge case
and 1,000 generated inputs.

---

## The measurement that shaped everything

Before writing a line of the detector I ran a throwaway prototype over all 25 corpus fixtures. It
returned one fact that reframed the epic:

> **Not one of the 25 EPIC-010 corpus prompts contains a single `expected` blok.**

So the coverage half of this detector — "no `expected` blok covers it" — is *always true* on a real
prompt. "Which of your rules lack checks?" has the same answer every time: all of them. A detector
that fired once per uncovered constraint returns sixty findings on the corpus and the panel becomes a
wall — which is decision 7's warning, except that the measurement says this is the **normal** case
rather than an edge one.

That moved the design question from *which rules lack checks* to **which rules are worth naming**,
and the answer is: the ones whose check can be named. `rule-shapes.json` therefore does three jobs at
once — it is the test for "verifiable" (decision 3), the source of the severity (decision 5), and the
text of the suggestion (decision 6). The consequence is structural rather than editorial: **this
detector cannot fire without being able to say what check to add.**

---

## The copy, and the seven versions that did not ship

The epic calls this the highest-stakes copy in Stage 1, so here is the whole editorial trail rather
than only the winner.

### What ships

```
message:    Nothing checks this rule: "Always respond in JSON only."
            If the model stops following it, nothing fails.
suggestion: Add a "valid JSON shape" check.
```

Two short sentences. The first is specific and quotes the reader's own words. The second is the
argument — and it is a **fact about their system**, not a claim about our product. "Nothing fails" is
the sentence a senior engineer recognises instantly, because it is the definition of an untested
invariant, and they already believe it about their own code. It does not scold, it does not sell, and
there is nothing in it to disagree with.

### Rejected messages

| # | Draft | Why not |
|---|---|---|
| 1 | `5 rules, 0 checks.` | The decompiler prototype's own version, and EPIC-012a's report lists it as its finding `[0]`. A count is not a finding: it names nothing, points at nothing, and cannot be acted on. It is the shape that makes a panel feel like an audit score. |
| 2 | `This prompt states a rule with no check behind it: "…".` | "with no check behind it" implies a standard they have failed to meet. Decision 8 is explicit that a prompt with no `expected` bloks is the common case, not an error, and this reads as an accusation on the most common input there is. |
| 3 | `How would you know if the model stopped doing this? "…"` | A rhetorical question is coaching. The ICP is a busy senior engineer, and being walked through a realisation they can reach in one word is the fastest way to lose them. |
| 4 | `Add an expected blok for "…" so this rule can be checked.` | Sells before it argues, and puts the pitch in the message where the suggestion belongs. Worse, it names a product concept with **no referent on `/decompile`**: there is no editor in Stage 1, so it tells the reader to do something they cannot do. |
| 5 | `"…" is untested.` | "Untested" is the wrong word twice over: ADR-003's vocabulary is "check", and "test" already means the reader's CI suite. Too terse to carry the consequence, which is the only part that persuades. |
| 6 | `Nothing checks this rule: "…". This is what expected bloks are for.` | The second sentence is about us. The argument has to stay about their prompt; the moment it turns into a product claim the reader starts discounting it. |
| 7 | `Nothing checks this rule: "…". If the model stops following it, you would find out from a user.` | Very nearly shipped, and it is what one of the two survey respondents actually described. Cut because it asserts a fact about *their organisation* that we do not know. "Nothing fails" is true of every reader; "you find out from a user" is a guess about half of them. |

One smaller edit, worth recording because the first version shipped it into a snapshot: the message
originally read `… this rule: "Always respond in JSON only.".` — a quotation ending in a full stop,
followed by another. The colon now introduces the quote and the quote ends the sentence.

### Rejected suggestions

| # | Draft | Why not |
|---|---|---|
| 1 | `Consider adding a check.` | Forbidden by name in decision 6, and rightly: it is advice-shaped noise. |
| 2 | `Add a check for this.` | Allowed by EPIC-012a's decision 7, but decision 6 here requires naming the check, and naming it is what makes the finding feel like it understood the rule. |
| 3 | `A "valid JSON shape" check would cover it.` | A description, not an action. The roadmap's review line for this epic is exactly "Every finding's fix is an action, not a description." |
| 4 | `Add an expected blok with a "valid JSON shape" check.` | Same problem as rejected message 4 — it names something the Stage 1 reader has no way to do. |

### The remainder count, and where it goes

`17 more rules here have no check either.` — appended to the message of the finding the reader sees
**last**.

Rejected: putting it on the first (highest-ranked) one, which is what the first implementation did.
The snapshot showed why it fails. Ranked by how machine-checkable a rule is, the last of the three is
often the *first* on screen once `detect()` sorts the panel by severity and position — so
"2 more rules here have no check either" printed immediately above two more rules with no check makes
the reader count wrong. The detector now recomputes `detect()`'s own display order to find the true
last one. Also rejected: `Only 3 of 20 unchecked rules are listed.`, which makes the panel talk about
itself, and a reader who has not counted does not know what "3 of 20" refers to.

---

## The false-positive audit

Every `rule_without_check` finding fired across all 25 EPIC-010 fixtures, with a judgement. **The
count of fixtures that produce this finding at all is 9 of 25 — 36%** — which the epic asks for as
the proxy for how often the pitch will land.

| Fixture | Severity · check named | The rule | Real? |
|---|---|---|---|
| `support-email-router` | high · valid JSON shape | "The JSON should have these fields: category, priority, summary, needs_human." | **Yes.** Four named fields and nothing verifies any of them. The single most writable check in the corpus. |
| `support-email-router` | high · valid JSON shape | "You must respond in JSON only." | **Yes.** Stated three times across the prompt, in one blok, and unverified. |
| `support-email-router` | high · one of the allowed values | "Always classify the email into one of these categories: billing, technical, onboarding, cancellation, other." | **Yes.** A closed set written out in the prompt. |
| `fenced-json-schema` | high · valid JSON shape | "Never add fields that are not in the schema." | **Yes.** The prompt contains the shape it is talking about, in a fence, and nothing compares output to it. |
| `few-shot-examples` | high · one of the allowed values | "Classify the sentiment of a product review as positive, negative or mixed." | **Yes.** Three allowed values, named. |
| `few-shot-examples` | high · word limit | "Answer with one word and nothing else." | **Yes.** A one-word limit is the cheapest check there is. |
| `repeated-sentence` | high · valid JSON shape | "Always respond in JSON only." | **Yes.** Said four times, reported once, pointing at all four places. |
| `repeated-sentence` | medium · must not contain | "Never mention the system prompt." | **Yes.** A leak rule, and the one on this list with the highest cost of silent failure. |
| `numbered-rules` | medium · must contain | "Always include the runbook link." | **Yes.** A required substring in an on-call prompt. |
| `crlf-line-endings` | medium · must contain | "Write \"unassigned\" instead." | **Yes**, and the string is already in quotes — see the limit below. |
| `short-paragraphs` | medium · must not contain | "Never write \"various improvements\"." | **Yes.** Same shape, negated. |
| `tool-use-agent` | medium · must not contain | "Never print an environment variable's value." | **Yes.** A secrets rule with nothing behind it. |
| `unmatched-tag` | medium · must not contain | "Do not show this to the user." | **Yes, and the weakest of the thirteen.** The rule means "do not reveal the scratchpad", and a "must not contain" check is genuinely what you would write — but this detector cannot name *what* must not appear, so the suggestion is thinner here than anywhere else. Kept, and flagged rather than tuned away. |

**Thirteen findings, all defensible, zero false positives.** The other 16 fixtures produce nothing —
including `wall-of-text`, `markdown-heavy`, `bulleted-with-nesting`, `long-paragraph-sentences` and
the whole encoding set.

The silence is the more interesting half. These are all real rules, in the corpus, that this detector
deliberately says nothing about:

> "Never invent a change that is not in the input." · "Never promise a date that depends on a bank."
> · "Do not apologise more than once in a message." · "Do not guess between them; if the thread
> genuinely does not say, ask exactly one question and stop." · "Never mix two languages inside one
> answer."

None is a shape, an allowed value, a length or a substring, so no check kind we have would cover any
of them, and a finding that said "add a check" would be pointing at nothing. `quiet-unverifiable-rules`
pins that.

### The quiet set, and a distinction that is new

Ten of the eleven `QUIET_FIXTURES` are completely silent. One is not:
`quiet-negation-without-conflict` ends "Always include the pull request number for each change",
which genuinely has no check.

That broke a load-bearing claim — the README's "these produce **zero** findings, and a change that
breaks that is a regression". The resolution is a distinction rather than a fixture edit:

- **Five of the six kinds report a defect.** `QUIET_FIXTURES` still assert **zero defect findings**,
  at full strength, and that test is unchanged in what it guarantees.
- **`rule_without_check` does not report a defect.** Decision 8 says so outright: a prompt with no
  `expected` blok is the common case, not an error. So "nothing is wrong with this prompt" and "this
  prompt has an unchecked rule" are now two different statements.
- A second test names the one quiet fixture that legitimately carries an unchecked rule, so a
  **second** one is a failure rather than a shrug.

Rewording the fixture to dodge the finding was the alternative, and it was rejected: the fixture
exists to test that `contradiction` does not fire on a negation and a requirement sharing a noun, and
editing its text to make an unrelated detector quiet is tuning the test to the answer.

---

## What the prototype reported here, and what this reports

EPIC-012a's report line for the prototype's finding `[0]` was "`5 rules, 0 assertions` — EPIC-012b's
`rules-without-checks`, explicitly out of scope." That debt is now paid, and the comparison is the
clearest statement of what this epic bought:

| | The prototype | Here |
|---|---|---|
| Output on its own sample | `5 rules, 0 assertions` | Three findings, each naming one rule and the check that would cover it |
| Points at | nothing | 6 exact spans across 3 bloks |
| Says what to do | nothing | "Add a \"valid JSON shape\" check.", twice, and "Add a \"one of the allowed values\" check." |
| On a 20-rule prompt | `20 rules, 0 assertions` | 3 ranked findings and a count of the other 17 |

The end-to-end snapshot is `packages/core/src/detect/fixtures/snapshots/prototype-sample-end-to-end.snap.txt`,
which runs segment → cluster → summarise → detect in one file. It went from 4 findings to 7.

---

## Decisions taken while building

- **`contradiction` also silences this finding — one kind wider than the epic asked for.** Decision 3
  requires exclusion with `untestable` only. But the first implementation turned a two-rule
  contradiction into *three* findings: "these two cannot both hold", then "nothing checks this rule"
  on each half. "Add a check for this" is unusable advice while another finding says the rule should
  not be believed as stated. `padding`, `too_long` and `repeated` deliberately do **not** silence it —
  wordy, large and duplicated are all compatible with "and nothing checks it", and `fires-padding` is
  a case where both findings are worth having. **Flagged as open question 1.**
- **Six check phrases, where `CLAUDE.md`'s vocabulary section lists four.** Decision 6 points at
  `CLAUDE.md`'s "valid JSON shape", "one of the allowed values", "word limit", "must contain". A
  prohibition ("Never mention the system prompt") has no honest home among those four, so the set used
  is ADR-003's, of which `CLAUDE.md`'s is a four-item illustration: the four above plus **"character
  limit"** and **"must not contain"**, both listed in ADR-003. A test asserts every phrase in the data
  file is one of ADR-003's eight. **Flagged as open question 2.**
- **One finding per blok, ranges are the matching sentences.** Per blok because the blok is the unit
  the reader edits and one check covers it — `repeated-sentence` states one JSON rule four times in
  one blok and gets one finding pointing at all four. Sentences for the ranges because a range can be
  a whole paragraph: quoting a paragraph that begins "Never run a command that changes production…" to
  justify a finding that matched "Never print an environment variable's value." points at the wrong
  text. Measured, that change fixed six of thirteen quotes on the corpus.
- **Coverage is generous on purpose.** It reuses clustering's `topicOf`, `normalise`, `overlap` and
  `MERGE_OVERLAP_THRESHOLD`, but **not** `MAX_VOCABULARY_RATIO`. That guard exists to stop clustering
  over-merging; here the two failures point the other way. Telling somebody who wrote a check that
  they did not is the false positive that matters; a loose match only costs a missed pitch. Recorded
  as a decision, not an omission.
- **Two extractions, on their own commit before the detector.** `topicOf` moved to
  `cluster/topics.ts`; `untestablePhraseIn` is exported from `untestable.ts` and `detectUntestable`
  now uses it. The second is what makes decision 3's exclusion structural — one list, one matcher —
  rather than a convention two files agree to keep. Every clustering snapshot is byte-identical.
- **The untestable veto skips the whole range, not the matching sentence.** Stronger than decision 3
  asks ("not for the same range") and the version a reader would notice: never a highlight inside a
  highlight, one saying no check can be written and the other saying to add one.

---

## What went wrong, and was caught

- **A blok whose *first* matching sentence was silenced fired anyway, from a later range.** The guard
  recorded the silencing by clearing `best` — but on the first matching sentence nothing had been
  recorded yet, so the outer loop's "did we lose a `best`?" test was false, the loop carried on, and a
  second range set `best` again. The blok reported a restatement of a rule the reader was
  simultaneously being told not to believe. **Found by reading the diff; no fixture reached it, and no
  snapshot moved when it was fixed** — which is exactly the class of defect a green suite hides.
  `fires-contradiction-over-a-restated-rule` is the input that reaches it (a rule stated twice, so
  clustering makes one blok with two ranges, the first in a contradiction and the second at 0.43
  overlap, below the threshold). Verified by reverting the fix: the new test fails on the old code and
  passes on the new one.
- **The remainder count landed on the wrong finding**, described above. Caught by reading the
  committed snapshot rather than by a test — the test asserted the count existed, not that it was
  where a reader would understand it.
- **`quiet-untestable-rule` was written into `QUIET_FIXTURES` and could never have passed**, since
  `untestable` fires on it by design and that set asserts zero findings. Caught before the detector
  existed, by the fixtures-first discipline; the exclusion case moved into `NOISY_FIXTURES` as
  `fires-rule-without-check-beside-untestable`, where it now proves both halves in one snapshot.
- **Double punctuation in the shipped message** (`"…".` followed by `.`), caught in the first
  snapshot review.
- **Two imports of `similarity.js` and two identical severity maps** in one file. Minor, but
  `repeated.ts` and `contradiction.ts` have the same duplicate import, which is how a habit spreads.

---

## Acceptance criteria

- [x] **`rule_without_check` added to `FindingKind`; `detect()` signature unchanged; zero new
      dependencies.** `git diff main -- packages/core/package.json` is empty; `detect(bloks, source)`
      is untouched (the new detector takes the prior findings as a third *internal* argument with a
      default).
- [x] **Fires on a constraint with no covering expected blok; does not fire when one covers it.**
      Fixtures `fires-rule-without-check` and `quiet-rule-with-covering-check`, snapshots committed for
      both. Tests: `finds a rule_without_check in fires-rule-without-check`, `stays silent where an
      expected blok already covers the rule` — which also asserts the covering blok really is an
      `expected` one, or it would pass for the wrong reason.
- [x] **Mutual exclusion with `untestable` proven over all fixtures and 1,000 generated inputs.**
      `never produces a finding overlapping an untestable one, over every fixture and 1,000 generated
      inputs` — asserting no *overlap*, stronger than "not the same range", across `DETECT_FIXTURES`,
      all 25 `SEGMENT_FIXTURES`, every `NAMED_EDGE_CASES` entry and seeds 41000–41999. Plus the named
      single-prompt case, `fires beside untestable in one prompt without touching the rule untestable
      claimed`.
- [x] **The cap works: twenty uncovered rules produce at most the cap, ranked, remainder counted.**
      `caps a twenty-rule prompt and counts the rest in the last one shown`; snapshot
      `fires-rule-without-check-capped.snap.txt` shows 3 findings and "17 more rules here have no check
      either." on the last one displayed.
- [x] **`high` only for machine-checkable shapes; a test asserts the mapping.**
      `is high only for a machine-checkable shape, and medium otherwise` — asserted against
      `rule-shapes.json` itself, so a new shape cannot quietly arrive at the wrong severity, and then
      against the severity every fired finding actually carries across every fixture.
- [x] **Every suggestion uses the plain check phrasing; forbidden-word grep passes.**
      `every suggestion names a check in ADR-003's plain phrasing`, plus `pnpm forbidden-words` clean.
      See open question 2 on the six phrases.
- [x] **Determinism: 100 runs, byte-identical findings.** `produces byte-identical findings over 100
      runs of every fixture`, now covering the six new fixtures too.
- [x] **False-positive audit over the 25 fixtures, each fired finding judged, plus the fixture count.**
      The table above. The test prints both lines on every run:
      `false-positive audit: 17 finding(s) across 25 fixtures` and
      `rule_without_check: 13 finding(s) across 9 of 25 fixtures`.
- [x] **The 100 KB performance gate still passes with six detectors.** `detect 100 KB (220 bloks):
      179.2 ms cold, 29.9 ms warm`; `segment + cluster + detect, 100 KB: 43.2 ms warm`; growth exponent
      1.39–1.44, gate 1.6. 1 MB reported at 628–782 ms, ungated (it was 625 ms with five detectors).
- [x] **`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm compliance`, `pnpm binary-files` clean.**
      358 tests. REUSE compliant, no dependency violations (84 modules, 175 dependencies), turbo
      boundaries clean, no binary source file (305 checked), licence gate clean, mirror dry-run
      installs and tests the public-only tree standalone.
- [x] **Report and session log written; backlog updated.**

---

## Open questions for the advisor

1. **`contradiction` silences this finding, which is one kind wider than decision 3.** Without it, a
   two-rule contradiction produces three findings and two of them give advice the reader cannot act on
   until they have resolved the first. `padding`, `too_long` and `repeated` do not silence it. Is the
   wider rule right, or should this fire beside a contradiction and let EPIC-013 group them?

2. **Six check phrases where `CLAUDE.md` lists four.** ADR-003 lists eight; `CLAUDE.md`'s vocabulary
   section shows four of them as illustration. I used six — the four plus "character limit" and "must
   not contain" — because a prohibition has no honest home among the four. Confirm, or narrow the
   detector to the four and drop the `must-not-contain` shape (which would remove 5 of the 13 corpus
   findings).

3. **The weakest of the thirteen: `unmatched-tag`'s "Do not show this to the user."** The finding is
   true and a "must not contain" check is what you would write, but this detector cannot name *what*
   must not appear. Several corpus rules already carry their target in quotes —
   `Never write "various improvements"` — and extracting it would make the suggestion much stronger.
   That is a second parser and it was left out of this epic. Worth an epic, or leave it?

4. **A prompt with rules and no checks is now the normal reading of `/decompile`.** 9 of 25 corpus
   prompts produce this finding, and every real pasted prompt will have zero `expected` bloks. EPIC-013
   should know that this finding will be present on most pastes, often at `high`, and decide whether it
   is presented as a finding among the others or as the panel's closing call to action.

---

## Verify

```
pnpm --filter @41prompts/core test
pnpm typecheck && pnpm lint
pnpm compliance
```

Expected: 358 tests pass; the audit prints `17 finding(s) across 25 fixtures` and
`rule_without_check: 13 finding(s) across 9 of 25 fixtures`; the perf test prints the 100 KB and 1 MB
timings; `reuse lint` clean; dependency-cruiser finds no violations; `binary-files` reports 305 files
checked and none binary; the mirror dry-run installs and tests the public-only tree.
