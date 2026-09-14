# EPIC-033: LLM-judge grader
Stage: 3 · Depends on: EPIC-031 · Size: S

**Started as a stub on 2026-09-14** by Claude Code, to carry two pieces of inherited context into the
file that gets read when the epic is built. Goal and scope come from `docs/roadmap.md`; **the advisor
completes the rest before this is worked on.**

## Goal
Expectations that need judgement, graded by a pinned model.

---

## Inherited context — what EPIC-030 hands this epic

Both of these are in `docs/epics/reports/EPIC-030-report.md` §12, and a handover recorded only in the
report of the epic that created it is a handover nobody reads.

### 1 · The `no_kind` queue, and it is larger than it sounds

`checkKindFor` derives one of ADR-003's eight kinds from `detect/rule-shapes.json`, and **returns
`undefined` whenever no shape matches** — deliberately, because the two ways of manufacturing an
answer are both worse than none: a ninth kind would contradict ADR-003, and defaulting to
`must_contain` would assert a substring nobody wrote.

`grade()` turns that into `not_graded` with `reason: "no_kind"`.

**That is expected to be the commonest `not_graded` reason in practice**, because there are seven
shapes and expected bloks are written in English. It is honest, and it is also a lot of rules that
nothing checks. **This epic inherits that queue**: `no_kind` is the population the judge exists to
serve, and its size is the thing to measure before deciding how much of it a judge should attempt.

**Do not close the gap by adding a ninth `CheckKind`.** ADR-003 fixes the set at eight and `CLAUDE.md`
records what treating that list casually already cost — a phrase for a prohibition was declared
missing when "must not contain" had been there the whole time. A judge is a **grader for existing
kinds and for kindless checks**, not a new kind.

### 2 · `refuses_to_answer` is explicitly waiting for this epic

It is one of the eight and it **never grades deterministically**. `GRADERS.refuses_to_answer` returns
`not_graded` with `reason: "needs_judgement"` for every input, by Soroush's ruling of 2026-09-14.

The reason, kept because it is the trap: recognising a refusal is a judgement, and any deterministic
version is a phrase list. A phrase list **fires on any output containing "I cannot"** — and
`graders.test.ts` pins the case that makes this concrete:

> `"I cannot stress enough how much I can help"` → **not graded**

That is a sentence a real assistant really writes, and a phrase list marks it a refusal. False
positives are what EPIC-012a spent an epic avoiding.

**So `needs_judgement` is this epic's inbox, and it is already typed.** Selecting on that reason
gives exactly the checks a judge should look at, with no new plumbing.

### 3 · Params derivation is deliberately strict, and that is a product question

`paramsFor` declines text a person would consider obvious:

| written | derives | why not |
|---|---|---|
| `Reply in at most 80 words.` | ✅ a limit of 80 | — |
| `Reply briefly.` | ❌ nothing | no number; a default would assert one nobody wrote |
| `Always include "order number".` | ✅ the quoted phrase | — |
| `Always include the order number.` | ❌ nothing | nothing is quoted; inferring the phrase from prose would invent the assertion |

These surface as `not_graded` with `params_not_derivable`, which is a **third** population, distinct
from `no_kind` and from `needs_judgement`. Whether the strictness is right is best judged against
real prompts rather than in advance — and this epic is the first that will see enough of them to say.

---

## Scope (from `docs/roadmap.md`, to be completed by the advisor)
`judge` check kind — **see the warning above; read this as "judge grading", not a ninth kind**;
rubric derived from the expected blok; judge prompt in the worker (proprietary); pinned version in
config; evidence includes the rationale.

## Tests
Mocked judge fixtures; pinned version on every row.

## Review
Judge prompt does not leak the expected answer. Judge cost shown separately.

**One more, from `CLAUDE.md` rule 7:** judge models are pinned by version, and never a floating alias.
