<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# EPIC-033 report — LLM-judge grader

Date: 2026-09-15 · Branch `epic/033-judge-grader` · Commits `b88298c`, `e7910e2`

---

## 1. The finding, which is larger than the epic

**`refuses_to_answer` was unreachable, and nothing said so.**

`checkKindFor` is the only thing in the product that ever sets `Check.kind`. It reads
`rule-shapes.json`, which carried **seven rows covering six kinds**. So of ADR-003's eight, six could
be derived and two could not.

The consequence, in order:

1. `GRADERS.refuses_to_answer` — the grader EPIC-030 wrote, ruled on, and documented — **was dead
   code**.
2. The `needs_judgement` reason it returns **had never been produced by the product**.
3. EPIC-030 handed this epic that reason as its inbox, writing that *"selecting on that reason gives
   exactly the checks a judge should look at, with no new plumbing"*. The plumbing was right.
   **Nothing could ever enter it.**

**Why nobody saw it.** `CHECK_KINDS`, `KIND_BY_PHRASE`, `GRADERS` and `paramsFor` each list all
eight, and three of them are exhaustive over `CheckKind` at compile time — a ninth kind fails to
build in two places. Every table was individually complete. The gap was in **the data one of them
reads**, and a JSON file has no exhaustiveness check. It was found by building a judge for an inbox
and discovering the inbox could not receive anything.

### The fix, and why it was safe to make here

A `refuses-to-answer` row appended to `rule-shapes.json`. **File order is precedence**, so a row at
the end can only claim rules that previously matched *nothing*: no rule that already had a kind can
acquire a different one. That property is what made this safe to do inside this epic rather than
behind its own false-positive audit — and `checks.test.ts` now pins the row's position so that
moving it fails a test rather than quietly changing what the public decompiler says.

**Measured, not assumed:** all 716 core tests pass, including EPIC-012b's `QUIET_FIXTURES`
must-not-fire set — the audit that exists precisely to catch a detector that started firing on
things it should not.

**One consequence for the public decompiler, stated because it is a real change.**
`rule-shapes.json` does three jobs for `rule_without_check`: it is the test for "verifiable", it
supplies the severity, and it writes the suggestion. So `/decompile` will now name a refusal rule as
one a check could cover, where before it stayed silent. That is more useful and it is a change to a
public surface; it is called out here rather than buried in a diff.

`matches_pattern` is **still unreachable and deliberately left so**. It needs a regular expression a
person wrote; `pattern-safety.ts` exists to refuse unsafe ones; and inventing a pattern from prose is
exactly what `paramsFor` declines to do. The test names it as a known gap with its reason, so the
next person meets a decision instead of a silence.

---

## 2. The judge

**Pinned** to `claude-haiku-4-5-20251001` — the cheapest priced row, which matters because a judge
runs once per `needs_judgement` check per input, and the only one of the three whose id carries a
date. Two tests: it is priced, and it does not look like a floating alias (`CLAUDE.md` rule 7).

**A judge call is a run.** It goes through `executeRun`, so the budget reservation, the content
cache, the price table, the typed refusals and rule 6's payload retention are inherited rather than
reimplemented. A second spending path outside the cap would make the cap not a cap (EPIC-031
decision 2), and a judge is the easiest thing in this system to accidentally run ten thousand times.

**The prompt says nothing about the answer wanted.** Built from the blok's verbatim text and the
model output and nothing else; a test asserts it contains neither "pass" nor "fail" nor "expected".
A judge told the answer agrees with it.

**The parser is the line between a judge and a phrase list.** It reads the first non-empty line,
requires exactly one of two tokens, and **never searches the rationale** — a parser that looked for
"refused" anywhere would find it in *"this is not a refusal"* and would have rebuilt the heuristic
`graders.ts` refuses to ship, now with a bill attached and a rationale beside it making the guess
look considered. Eight tests, including a first line carrying both tokens.

**No default, four ways.** No judge configured, a refused call, a budget exhausted, an unreadable
verdict: every one leaves the check `not_graded` with `needs_judgement`. A judge that fails open
calls an unchecked prompt verified; one that fails closed fails somebody's prompt for our outage.

---

## 3. The number EPIC-030 asked for

**44% of expected bloks in the fixture corpus have no derivable check kind — 4 of 9.**
`no-kind-share.test.ts` reports it on every run; it is not gated.

**The sample is thin and the figure should be read that way.** It is a corpus of *segmenter and
detector* fixtures, not a corpus of expected bloks, and nine is not a population. What it is good
for: the four it names are all of one kind — statements of an expected *value* ("Expected response
for an email with no discernible intent: the category other…"), which is `allowed_values` written as
prose rather than as a list. If that holds on real prompts, the next move on `no_kind` is a better
`allowed_values` shape, not a judge.

That is exactly the decision EPIC-030 asked to be deferred until somebody had a number, and this
epic deliberately did not make it: the judge is pointed at `needs_judgement` only.

---

## 4. Acceptance criteria

- [x] A `refuses_to_answer` check is graded by the judge: a refusal passes, an answer fails.
      `judge.test.ts`; `runs-judge.spec.ts:85`; drive checks 4–6.
- [x] `"I cannot stress enough how much I can help"` is not graded a refusal. The named test in
      `judge.test.ts`. **What it asserts** is that an `ANSWERED` verdict carries through to a
      failure, not that a model is clever — the judge is faked.
- [x] The judge model is pinned, and a test fails on an id that looks like a floating alias.
- [x] `JUDGE_MODEL` has a priced row.
- [x] The built prompt says nothing about the wanted verdict.
- [x] An unreadable verdict leaves the check `not_graded` with `needs_judgement`; empty, truncated,
      contradictory and "verdict only in the rationale" are each covered.
- [x] No judge configured leaves every `needs_judgement` check as it was and the run still finishes.
- [x] Judge calls go through the budget — inherited from `executeRun` rather than reimplemented,
      which is stronger than a test of a second path.
- [x] Judge cost and calls are stored and shown separately. `view.test.ts`, `runs-judge.spec.ts:121`,
      drive checks 10–11. Screenshot `04-judge-cost-said-separately.png`.
- [x] A judged failure shows the rationale beside the attributed blok.
      `runs-judge.spec.ts:101`, drive checks 7–9, screenshot `03-`.
- [x] The `no_kind` share is measured and the number is in this report. §3.
- [x] Keyboard and 390px. Drive check 13 measured 0px of horizontal overflow; screenshot `06-`.

---

## 5. Verification

```
pnpm test                         8/8 packages          pnpm typecheck   8/8
pnpm lint                         11/11                 pnpm e2e         201 passed, 4 skipped
node scripts/gates.mjs ci         16/16 on e7910e28, 7m42s
node scripts/drive-epic-033.mjs   13/13 drive checks, 6 screenshots
```

---

## 6. What a green here does not cover

The two `gates.mjs ci` prints itself — the Linux-only visual baselines, and a runner slower than this
machine — plus the four from EPIC-032 §8 that the no-push ruling adds: no second machine, no image
build, nothing deployed, no Linux clean checkout. All still true.

**And one specific to this epic: the judge has never seen a real model.** `anthropic.ts` is still
unexecuted (EPIC-032 §6), and every verdict in every test and every screenshot came from
`withFakeJudge`, steered by an explicit `<<refuses>>` token that nothing real emits. What is proved
is the **pipeline**: the verdict maps to an outcome, the rationale is stored, attributed and
rendered, the spend is counted apart, the cache answers a repeat at zero. What is **not** proved is
that a model is any good at recognising a refusal. That is EPIC-031a's key plus a deliberate look at
real verdicts, and it is the first thing to do when the key exists.

---

## 7. Open questions for Soroush

1. **The public decompiler's output changes.** §1: `/decompile` will now name a refusal rule as one a
   check could cover. Deliberate, tested against the must-not-fire corpus, and yours to veto.
2. **`refuses_to_answer` and `matches_pattern` were both unreachable for the whole of Stage 3.** One
   is fixed. The second is left with a reason. Worth asking what else is complete-looking and
   unreachable — the shape of this defect was four exhaustive tables agreeing with each other about a
   set none of them supplies.
3. **The judge's cost profile is unmeasured on anything real.** One judgement per `needs_judgement`
   check per input; on a 200-input set with three refusal rules that is 600 calls, cached only where
   the model's reply repeats. The cap is the guard and it has never been tested against a real bill.
4. **Whether a judge is the right answer to `no_kind` at all.** §3 suggests the four in the corpus
   want a better `allowed_values` shape instead. Deferred with a number rather than decided.

---

## 8. For the advisor

- The epic file was completed by Claude Code in the advisor's seat, per the 2026-09-15 amendment to
  `PROCESS.md`. Its eight decisions are in the file; the three taken during implementation are in
  `docs/decisions/AUTONOMOUS.md`.
- **Decision 1 held under pressure and is the one to re-read.** The judge grades `needs_judgement`
  only. The temptation was the 44%, and the reason not to is that a `no_kind` check has no derived
  question — judging one means asking a model to invent the criterion and then answer it.
- No ninth `CheckKind` was added. ADR-003's eight are intact; one of them merely became reachable.
- `Evidence` gained a fifth variant, `judgement`. It is the only one `packages/core` can never emit,
  and `grade.test.ts` pins that boundary in the place somebody adding a "quick" heuristic would look.
