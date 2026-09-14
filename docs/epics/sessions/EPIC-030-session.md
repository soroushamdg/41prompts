<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# Session · EPIC-030 · checks and deterministic graders

Date: 2026-09-14 · Branch `epic/030-checks-and-graders`

## Prompt sent

Four rulings — conservative pattern filter with `not_graded` on rejection and its false rejections
listed; `noFailures` gates Live while `fullyChecked` gets its own sentence and is never folded into a
pass; `refuses_to_answer` left to EPIC-033; a suggested check rather than a suggested rewording —
then "merge #82 and implement".

## What reading the existing code changed

Twice, and both times it made the epic smaller.

**`Check` already existed**, with the eight kinds, ADR-003's phrases verbatim, a compile-time
exhaustiveness guard, and `checkKindFor` deriving a kind from the same `rule-shapes.json` the
decompiler uses. EPIC-020 had built the model and marked it provisional, naming this epic as the one
that settles it. So the work was params, grading, the result schema and the suggestions — not the
model.

**`pattern-shape.ts` already had the scanner** the pattern filter needs, including the two cases a
regex-based version of the same check had missed: a group inside a group, and a `)` inside a
character class. Reused rather than rewritten. Writing a second copy would have been the exact
mistake Soroush had just praised avoiding in the roadmap's check-kind list, one message earlier.

## The decision I would most want reviewed

**`fullyChecked` versus `noFailures` as two booleans rather than one.** The whole schema hangs off it,
and it is the thing that would be most annoying to change later because every caller reads it.

The argument for two is in the ruling: ten ungradable checks have failed nothing, so blocking Live
would refuse to publish a prompt for being simple — but calling that "passed" claims evidence that
does not exist. The argument against is that two booleans are two things a caller can get wrong.

What tipped it: there is no honest single name. `passed` would have to mean one of the two and
mislead about the other, and a field called `passed` gets used as the answer whatever its doc comment
says. So there is no `passed` field at all, only a count, and a test asserts that.

## A gate caught something and was right to

`pattern-shape.test.ts` enforces EPIC-010 decision 7 — every regex literal in `packages/core` on a
reviewed list — and my seven new ones failed the build. Correct: a new pattern in this package is a
decision, and they are now listed with why each is linear.

**It also surfaced a real defect in the audit's own usefulness.** Because it blanks quoted strings
before scanning, a `"` inside a regex literal comes back mangled — mine appeared as
`[""”]{1,200})["”]`. A pattern whose audited form is corrupted is one nobody can review, which
defeats the point of a reviewed list. Fixed on my side by writing quote characters as escapes so what
the audit prints is what the code contains. The audit's blanking is still the right call; the
mitigation belongs in the patterns.

## Two things I flagged in the plan and would flag again

- **`refuses_to_answer` is not a decidable fact**, and the ruling agreed. The test that matters is
  the one asserting *"I cannot stress enough how much I can help"* is not graded — that is the false
  positive a phrase list produces, and it is a sentence a real assistant really writes.
- **Word and character counting each hide a definition.** `Intl.Segmenter` was available and refused:
  locale- and ICU-version-dependent, so the same output could be 79 words on one Node build and 80 on
  another. A crude rule that is identical everywhere beats a clever one that is not, and the unit is
  named in the evidence so the number can be reproduced.

## Decisions inside the epic's latitude

- **`not_graded` carries a typed reason** rather than a boolean, so EPIC-032 can say which of four
  situations it is and EPIC-033 can select the one it owns.
- **The pattern filter runs at derivation, not at grade time.** A refused pattern therefore never
  reaches the engine at all, rather than being caught on the way in.
- **`must_not_contain`'s evidence is the excerpt on failure and the absence on success** — the
  failing case is the one with something to show.
- **Suggestions are produced only for checks that did not grade.** Advice attached to something
  working is noise; EPIC-012b's report records what that does to the advice that matters.

## What took longer than expected

Nothing in the grading. The time went on the reviewed-list gate and the mangled-literal problem
underneath it, which was not obvious from the failure message and took a hand-written extractor to
see properly.

## Verification

```
test        8 checked, 8 passed        (core: 146 new tests under src/check/)
typecheck   8 checked, 8 passed
lint        11 checked, 11 passed
e2e         178 passed, 4 skipped, 0 failed
compliance  all OK
core deps   none
```

## Open questions

Report §12: the `fullyChecked` sentence belongs in EPIC-032 before it is built; `no_kind` will be the
commonest reason and is the queue EPIC-033 inherits; and params derivation is deliberately strict in
a way best judged against real prompts.
