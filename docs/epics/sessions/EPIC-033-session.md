<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# Session · EPIC-033 · LLM-judge grader

Date: 2026-09-15 · Branch `epic/033-judge-grader`

## Prompt sent

"continue" — the second epic of a session whose first was EPIC-032. No new instruction; the standing
one is Soroush's of 2026-09-15: build the next epic, nothing is pushed, skip rows that need a person.

## Plan summary

The epic file was a stub that said "the advisor completes the rest before this is worked on". Under
the 2026-09-15 amendment to `PROCESS.md` that seat is Claude Code's when nobody is relaying, so the
file was completed first — eight decisions, scope, out of scope, twelve criteria — and only then
`docs/epics/plan-EPIC-033.md` and the code. Roughly an hour of the session went on the epic file, and
it earned it: decision 1 is the one that kept the epic small when the 44% showed up.

## The finding, and how it was found

**`refuses_to_answer` was unreachable.** The report's §1 has it in full. What belongs here is the
sequence, because it is the lesson.

The e2e was written before the judge was wired, and it failed with "the check reads Not checked". The
first instinct was a wiring bug in `runSuite`. The second was the fake judge not being selected.
**Both were guesses.** What settled it in under a minute was printing `checkKindFor` over six rule
texts a person would actually write and finding that none of them derived `refuses_to_answer` —
then dumping `rule-shapes.json` and counting the rows: seven rows, six kinds, eight in ADR-003.

That is the same move that settled EPIC-032's two mysteries — probe the thing, do not reason about
it — and it is now three for three in two epics. `PROCESS.md`'s "'Environmental' is a hypothesis, not
a finding" is the written form; the practical version is *print the value*.

**The defect's shape is worth remembering.** Four tables listed all eight kinds. Three were
exhaustive over `CheckKind` at compile time. Every one of them was individually complete and
correct. The hole was in a JSON file one of them reads, and a data file has no exhaustiveness check —
so a compile-time guarantee about a *type* said nothing about the *supply*.

## Decisions inside the epic's latitude

Logged in `docs/decisions/AUTONOMOUS.md`; the reasoning is there and the short version here.

- **Append the shape rather than write a BLOCKER.** File order is precedence, so a row at the end can
  only claim rules that previously matched nothing — no existing rule changes kind. That made the
  blast radius provable rather than argued, and the must-not-fire corpus proved it.
- **Point the judge at `needs_judgement` only**, with the `no_kind` population measured and left. The
  44% was a real pull in the other direction.
- **Two fakes, one seam.** `FAKE_JUDGE=1` wraps whatever provider was already selected and
  intercepts only judge-model calls, so the thing under test stays whatever it would have been.
- **The fake is steered by a token, not by reading the reply.** A fake that answered `REFUSED` on
  "I cannot" would be the phrase list this epic exists to replace, and the suite would then be
  proving the judge works by consulting it.

## What took longer than expected

Three cache collisions, each the same lesson arriving in a new costume. A judge call is a run, so it
is cached on its content — the rubric and the model's reply. A marker in a *context blok* does not
change either, so three tests in a row judged nothing and read a cached verdict. EPIC-032 learned
this about model calls two commits earlier and it still had to be learned again about judge calls,
because the thing that varies is different.

## Verification

```
pnpm test  8/8    pnpm typecheck  8/8    pnpm lint  11/11    pnpm e2e  201 passed, 4 skipped
node scripts/gates.mjs ci        16/16 on e7910e28, 7m42s
node scripts/drive-epic-033.mjs  13/13, 6 screenshots
```

The drive's first run produced a screenshot with the judge's rationale hidden behind the analytics
banner — the one thing the drive existed to photograph. Both drives now decline analytics first.

## Open questions

Report §7. The one to read first: the public decompiler's output changes, deliberately, and it is
Soroush's to veto.
