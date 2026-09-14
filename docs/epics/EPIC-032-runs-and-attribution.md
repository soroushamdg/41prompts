# EPIC-032: web — inputs, run, results, attribution
Stage: 3 · Depends on: EPIC-031, EPIC-021b · Size: M

**Started as a stub on 2026-09-14** by Claude Code, to carry one inherited requirement into the file
that gets read when the epic is built rather than leaving it in the report of the epic that found it.
Goal, scope and criteria below come from `docs/roadmap.md`; **the advisor completes the rest before
this is worked on.**

## Goal
The Runs page, wired: inputs go in, a run happens, and every result resolves to the blok that caused
it.

---

## Inherited requirement — the `fullyChecked: false` sentence

**Named here because this is the only place the state ever becomes visible to a person, and this is
the moment the EPIC-017 shape does not repeat.**

EPIC-030 ships a `RunSummary` with **two booleans and deliberately no `passed` field**:

- `noFailures` — no check failed. Gates Live, per `CLAUDE.md` rule 9.
- `fullyChecked` — every check ran *and* every one passed.

A prompt with ten ungradable checks has `noFailures: true` and `fullyChecked: false`. It is
publishable, by Soroush's ruling of 2026-09-14, because rule 9 blocks on **failure** and ten
ungradable checks have failed nothing — blocking there would refuse to publish a prompt for being
simple.

**So the only thing standing between a user and the belief that their prompt was verified is a
sentence on this page.** Core made that structurally impossible to fudge: there is no `passed` field
for a caller to read as the answer, and `passed` exists only as a count. The words are the last mile,
and they are a UI decision, which makes them this epic's.

**The requirement, stated so it can be checked:**

1. **`fullyChecked: false` gets its own sentence at the publish moment**, distinct from anything said
   about failures, and it is **never folded into a pass**. "All checks passed" must not appear when
   nothing was checked.
2. It says **how many** could not be checked and **why**, from `CheckResult.reason` — `no_kind`,
   `params_not_derivable`, `pattern_rejected`, `needs_judgement` are four different situations and
   the user can act on two of them.
3. **Not by colour.** `CLAUDE.md` rule 10: green, red and amber are pass, fail and drift, and this is
   none of them. It is words.
4. A test fails if a prompt whose checks are all `not_graded` renders the same text as one whose
   checks all passed. That is EPIC-030's criterion arriving on the surface where a person reads it.

**Why this is written down before the epic is.** `EPIC-017` sat `todo` through the whole of Stage 2
with live pages saying they were not written yet, and shipped past EPIC-014 and EPIC-015 because the
dependency lived in a row nobody read at the moment it mattered. A handover recorded only in the
report of the epic that created it is a handover nobody reads.

Source: `docs/epics/reports/EPIC-030-report.md` §4 and §12.1.

---

## Inherited requirement — the cost shown to a user must say what it counts

**From EPIC-031, ruled 2026-09-14.** A second requirement alongside the `fullyChecked` sentence, and
it arrives for the same reason: the code makes the state unambiguous, and the only place it becomes
visible to a person is a number on this page.

**A cache hit spends nothing.** It calls nobody, so it costs nothing, so it reserves nothing against
the budget — which is correct, and which means **a re-run is free and the number in front of the user
stops matching what they ran.**

Somebody who runs 200 inputs, sees "$1.40", changes one blok and re-runs, will see a much smaller
number for what looks like the same work. Both numbers are true. Neither is self-explanatory, and a
cost display that silently means two different things on two consecutive screens is the same class of
problem as a pass that silently means two different things.

**The requirement:**

1. **The cost says what it counts** — spend on this run, not the cost of everything on screen.
2. **Cache hits are visible as such**, so a smaller number has a reason attached rather than looking
   like a price change or a mistake.
3. A test asserts a re-run of an identical prompt shows **zero calls and zero spend**, distinctly from
   a first run that cost something.

Source: `docs/epics/EPIC-031-run-engine.md` decision 5.

---

## Scope (from `docs/roadmap.md`, to be completed by the advisor)
Input sets from CSV and manual rows; run trigger (Anthropic only); results by check with meters and
pass/fail icons alongside colour; KPI strip; polling progress; failure detail with the failing region
highlighted; attributed blok card; "Create constraint from this failure" opens a preview of the
suggested blok text before it is added; run history.

## Tests
Playwright end to end with a mocked provider, including the preview step. Progress without reload.

## Review
A failure with no attributable blok is shown honestly — and so is a check that could not be graded.
