# EPIC-012a report: Five detectors

Branch `epic/012a-detectors`. 2026-09-10.

**Status: done.** Five detectors, `detect()` and the `Finding` type exported from `packages/core`,
zero new dependencies. 328 tests. **The false-positive audit stands at 4 findings across all 25
EPIC-010 fixtures, and all four are real** — the table below judges each. `pnpm test`,
`pnpm typecheck`, `pnpm lint` and `pnpm compliance` are clean.

The audit is the deliverable, not a formality, and it earned that on its first run: it caught two
false positives in my own detectors before any reviewer saw them.

## The must-not-fire set came first

Eight prompts, each containing the exact surface feature one detector looks for, used correctly —
"please" inside quoted example input where it is the customer's word; a forbidding rule and a
requiring rule that are compatible; vague-sounding words each attached to something checkable; a
short rule whose every word appears inside a long paragraph; a rule and its own scoped precondition.

They were written and committed (`9af5a84`) before any detector existed. Six passed on the first run
of the detectors; two were added later, during review, for shapes the first six missed. All eight are
silent now, and a change that breaks that is a regression even if it also finds something new.

## What the prototype reports, and what this reports

Extracted the prototype's `segment`/`cluster`/`diagnose` and **ran** them: 15 segments, 10 bloks,
**9 findings**. This produces **4** on the same prompt. Every difference is accounted for:

| # | Prototype finding | Here | Why |
|---|---|---|---|
| 1 | `5 rules, 0 assertions` | — | EPIC-012b's `rules-without-checks`, explicitly out of scope. |
| 2 | Contradiction on "summary" (b10 vs b7) | — | A real contradiction, **reported against the wrong pair**. The genuine one is inside a single segment; see the limit below. |
| 3 | Contradiction on "summary" (b5 vs b7) | — | **A false positive.** Two bloks sharing the word *summary* and contradicting nothing. |
| 4 | Rule split across 3 places (b5) | — | Not a finding: `repeated` never fires inside one blok (decision 6). Clustering merges it and EPIC-013 shows the range count. |
| 5 | Politeness padding (b5) | ✓ `padding` | Same finding. |
| 6 | Rule split across 3 places (b7) | — | Came from one of the **false merges** EPIC-011a found. It does not exist under current clustering. |
| 7 | Untestable "reasonably" (b7) | ✓ `untestable` | Same finding. |
| 8 | Rule split across 2 places (b9) | — | Also from a false merge. |
| 9 | Untestable "best judgement" (b9) | ✓ `untestable` | Same finding. |
| — | — | ✓ `repeated` | **New.** The role paragraph's "always be professional and friendly" against rule 6's. The prototype misses it entirely. |

So of the prototype's nine: one is another epic's, one is a false positive, three are artefacts of
false merges, three are reproduced, and one is real-but-misattributed. Plus one true finding it never
had. The end-to-end snapshot is
`packages/core/src/detect/fixtures/snapshots/prototype-sample-end-to-end.snap.txt`, which runs
segment → cluster → summarise → detect in one file.

## The false-positive audit

Every finding fired across all 25 EPIC-010 fixtures, with a judgement:

| Fixture | Finding | Real? |
|---|---|---|
| `support-email-router` | `repeated`: the role paragraph's "always be professional and friendly" and rule 6's | **Yes.** Two places to edit, and the user has to find both. |
| `support-email-router` | `untestable`: "reasonably short" | **Yes.** The prototype flags it too. No check can be written against it. |
| `support-email-router` | `untestable`: "use your best judgement" | **Yes.** Same. |
| `support-email-router` | `padding`: "please" | **Yes.** "Please make sure the output is valid JSON. Thank you!" costs tokens and changes nothing. |

**Four findings, on one fixture, all defensible.** The other 24 fixtures produce nothing — including
`wall-of-text`, `markdown-heavy`, `tool-use-agent` and the whole encoding set.

It did not start there. The first run produced **15**, and two were mine:

- **`too_long` summed a blok's ranges**, so `wall-of-text` — a corpus repeated four times — produced
  ten findings, each counting the same sentence four times. A blok's ranges are restatements of one
  instruction; a rule said four times is not four times too long. It counts the longest range now.
- **`padding` fired on "Never mention that you are an AI model."** The phrase is the *object* of the
  rule, not padding, and the finding would have told the author to delete the subject of their own
  rule. Entries carry an `unless` guard now.

## Decisions taken while building

- **`repeated` cannot mean what the prototype meant.** Decision 6 says it fires across bloks and
  never inside one — but any two bloks over the threshold that share a kind were *already merged by
  clustering*, so a naive port would never fire at all. What it reports is the pair clustering
  deliberately refused: the same instruction in two registers, once as role context and once as a
  numbered rule. That is a real finding, and it is the one the prototype misses.
- **`contradiction` works on sentences, not blok pairs.** Only sentences catch all three shapes:
  across bloks, inside one blok (the antonym case EPIC-011a carried forward, where token overlap
  merges both halves into one), and inside one range.
- **`bloks` is a deduplicated set.** Criterion 7 says a contradiction names at least two blok ids;
  the antonym criterion describes one blok containing both halves. Those cannot both hold. A
  within-blok contradiction names one, a cross-blok contradiction names two, and both are tested.
  Listing the same id twice to satisfy the letter would make `bloks` a bag and push the dedupe onto
  every consumer. **Flagged as open question 1.**
- **One README with a section per detector**, where the Scope asks for one README per detector. Five
  cross-referencing stubs would read worse than one searchable page, and the substance the Scope
  asks for — what it fires on, what it deliberately does not, how to tune it — is there per
  detector. **Flagged as open question 2.**
- **Similarity, polarity and the sentence boundary were extracted** so the detectors reuse them
  rather than growing second copies (decision 6). A second similarity measure would let a pair be
  "similar enough to merge" and "not similar enough to report" at once.

## The limit, measured and pinned

There is a real contradiction this does **not** find: "Do not use markdown formatting in your
response." against "Format the summary as a markdown bullet list." It is the one the prototype
appears to catch — and it does not really, since the rule that catches it produces a false positive
for every true one on the same sample.

Measured, it is indistinguishable from a pair that must stay quiet:

| pair | polarity | overlap | shared tokens inside the negated scope |
|---|---|---|---|
| "Do not use markdown…" / "Format … as a markdown bullet list" | negative/neutral | 0.33 | `["markdown"]` |
| "Never invent a change…" / "Always include the number for each change" | negative/positive | 0.25 | `["change"]` |

One is a contradiction, one is two compatible rules about the same noun, and the difference is what
the verbs do to the shared object. Decision 5 ranks the failures, so this stays quiet.
`LIMIT_FIXTURES` holds the case so it is not rediscovered as a bug.

## What went wrong, and was caught

Self-review found six things, plus one that predates this epic:

- **A literal NUL byte in `cluster.ts`**, written there by my own generator script in EPIC-011a. Git
  treats the file as binary, so it has shown **no textual diff for two epics** and neither review
  could see its changes. It is an escape sequence now; every clustering snapshot is byte-identical.
  This is the finding I would most want to know about, because it silently removed a file from
  review.
- **`detect()` was quadratic and had no throughput gate** while `segment()` and `cluster()` have two
  each: **12.6 seconds on a 1 MB prompt**, on the main thread, in the browser tab EPIC-013 runs it
  in. Indexing by shared token — clustering's fix — only reached 6.2 s, because a repeated corpus
  gives every sentence identical twins that share every token. What works is indexing on what a
  contradiction *requires*: a positive sentence only needs comparing against negative ones, an
  antonym-bearing one only against sentences bearing its partner, and identical twins share a
  polarity so they can never contradict. **625 ms at 1 MB, exponent 1.91 → 1.39.**
- **The containment guard was dropped in transit.** `repeated` and `contradiction` reuse clustering's
  overlap and threshold but not the ratio guard that travels with them, so a short rule whose every
  word appears in a long paragraph scored 1.0 — the exact case EPIC-011b's review found in
  clustering, reintroduced by copying two of three things.
- **A rule and its scoped precondition fired at severity high.** "Always escalate billing questions"
  against "Do not escalate them until you have checked the FAQ" — which says *when*, not *whether*.
  The most expensive kind of false positive there is, and the existing negation fixture passed for
  the wrong reason because its two rules were about different subjects.
- **Three antonym pairs were dead.** Normalisation drops words of three characters or fewer, so
  `high`/`low`, `add`/`remove` and `all`/`none` could never match anything. Antonyms are matched
  against the text now.
- **`repeated`'s message quoted the wrong fragments** when one blok's ranges bracket the other's, and
  **`too_long` threw** on a zero-range blok, which `detect()` can be handed since it is a public
  export.

Also raised the repeat floor from three tokens to four: at three, two shared tokens score 0.667, and
"You triage billing questions." read as a repeat of "Always escalate billing questions to a human
agent."

## Acceptance criteria

- [x] **`detect()` and `Finding` exported; zero new dependencies.** `git diff main -- packages/core/package.json` is empty.
- [x] **All five kinds implemented, each with a positive fixture, a near-miss that does not fire, and
      a snapshot.** Positives: `finds a repeated in fires-repeated`, `… contradiction in
      fires-contradiction-across-bloks`, `… contradiction in fires-contradiction-inside-one-blok`,
      `… untestable in fires-untestable`, `… padding in fires-padding`, `… too_long in
      fires-too-long`. Near-misses: `stays silent on quiet-similar-subject-no-repeat`,
      `… quiet-negation-without-conflict`, `… quiet-scoped-precondition`, `… quiet-containment`,
      `… quiet-polite-example-text`, `… quiet-vague-word-with-concrete-object`,
      `… quiet-many-short-rules`, `… quiet-short-clean-prompt`. Sixteen snapshots in
      `src/detect/fixtures/snapshots/`.
- [x] **The antonym case carried from EPIC-011a is a named test.** `finds the antonym contradiction
      EPIC-011a carried forward, pointing at both ranges` — and it asserts the clustering really did
      hide it inside one blok, or the test would not be testing what it claims.
- [x] **False-positive audit listed with a judgement per finding.** The table above; the test prints
      the same list on every run.
- [x] **Determinism over 100 runs.** `produces byte-identical findings over 100 runs of every fixture`.
- [x] **Ranges in bounds and pointing at real text.** `keeps every range inside the source and
      pointing at real text`, over every detector fixture, plus the invariant holding across the 25
      EPIC-010 fixtures in the audit.
- [x] **`bloks` names at least one existing blok; a contradiction names at least two.**
      `names at least one existing blok, and a cross-blok contradiction names two`. See open
      question 1 for the within-blok case.
- [x] **Forbidden-word grep passes over every message and suggestion.** `pnpm forbidden-words` clean.
- [x] **The prototype's sample compared, with each deviation justified.** The table above, and
      `runs the prototype's sample end to end: segment, cluster, summarise, detect`.
- [x] **The 100 KB gate passes with detection included.** `segment + cluster + detect, 100 KB: 34.2 ms
      warm`. `detect()` alone: 21.6 ms warm, 100.4 ms cold. 1 MB reported at 625 ms, ungated.
- [x] **`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm compliance` clean.**
- [x] **Report and session log written; backlog updated.**

## Requirements carried into later epics

### EPIC-013 — show both kinds on a `repeated` card

`repeated` reports pairs whose **kinds differ**, and that is correct behaviour rather than a defect:
any two bloks over the threshold that share a kind were already merged by clustering, so the pair it
reports is by construction a cross-kind one — most usefully the same instruction stated once as role
context and once as a numbered rule.

**Ruled 2026-09-10: correct behaviour, but a presentation problem.** A card reading "these two bloks
say the same thing" for a `context` blok and a `constraint` blok will read as wrong unless the UI
shows both kinds. EPIC-013 owns that.

## The advisor's rulings on the open questions

1. **`bloks` is a deduplicated set**, so a within-blok contradiction names one blok where criterion 7
   said "at least two".

   **Ruling: confirmed** (2026-09-10). The two criteria contradicted each other, and the set is the
   only reading that satisfies both. Criterion 7's wording is amended in
   `docs/epics/EPIC-012a-detectors.md` to say so.

2. **One README with a section per detector**, where the Scope asks for one README per detector.

   **Ruling: fine as one file** (2026-09-10).

3. **`repeated` reports what clustering refused, not what it merged.** See the EPIC-013 requirement
   above — **ruled correct behaviour**, and recorded there as a presentation requirement.

4. **`too_long` is a length proxy** for "carries more than one instruction", and will fire on a
   single instruction that genuinely needs ninety words.

   **Ruling: accepted; both thresholds wait for EPIC-084** (2026-09-10) and its real distribution.

## Verify

```
pnpm --filter @41prompts/core test
pnpm compliance
```

Expected: 328 tests pass; the audit prints 4 findings across 25 fixtures; `reuse lint` clean;
dependency-cruiser finds no violations; the mirror dry-run installs and tests the public-only tree.
