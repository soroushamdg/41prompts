<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# Plan — EPIC-033: LLM-judge grader

Branch `epic/033-judge-grader`. Written before any code, per `CLAUDE.md` "How to work".

## What exists already, so nothing is rebuilt

- `packages/core`: `grade()` returns `not_graded` with `needs_judgement` for every
  `refuses_to_answer` check, by ruling. That reason **is** this epic's inbox and it is already typed,
  so selecting the work needs no new plumbing.
- `apps/worker`: `executeRun` already carries the budget reservation, the content cache, the price
  table, typed refusals, and rule 6's payload insert with `purge_after`. A judge call is a run
  (decision 2), so it gets all of that by going through the same function.
- `providerFor` already has the three-guard seam for a deterministic fake.
- `apps/web`: `view.ts` writes every sentence; `results.tsx` renders the failure detail.

## The shape, end to end

```
gradeAll ──► results
              │
              ├─ pass / fail / not_graded(no_kind, params…)   ──► stored, untouched
              │
              └─ not_graded(needs_judgement) ──► judgeCheck()
                                                    │
                                        no judge ───┴──► unchanged. Still needs_judgement.
                                                    │
                                        executeRun(JUDGE_MODEL, rubric+output)
                                                    │  budget, cache, payload, refusals — inherited
                                                    ▼
                                        parseVerdict(first line only)
                                                    │
                                     unreadable ────┴──► needs_judgement, with the rationale as
                                                    │     evidence for why it could not be read
                                          REFUSED / ANSWERED ──► pass / fail + judgement evidence
```

---

## 1. `packages/core` — the type, and nothing else

`Evidence` gains a fifth variant:

```ts
| { readonly kind: "judgement"; readonly rationale: string; readonly judge: string }
```

`rationale` is the judge's own words; `judge` is the pinned model id, stored on the result so a
verdict can always be traced to the thing that produced it. **No English** — `apps/web` writes the
prose (decision 8). **No ninth `CheckKind`, no grader that calls anything**, and `grade()` stays
pure and synchronous: the judge cannot live here, and dependency-cruiser enforces that rather than
trusting it.

One test in `packages/core`: the variant round-trips through `CheckResult` and carries both fields.

## 2. `apps/worker/src/runs/judge.ts` — the judge

**`JUDGE_MODEL`** — pinned, `claude-haiku-4-5-20251001`. It is the cheapest priced row, which matters
because a judge runs once per `needs_judgement` check per input, and it is the only one of the three
whose id carries a date. Two tests: it has a priced row, and it does not look like a floating alias
(the pin test is a shape test on the id, per note 4 — intent is not the subject).

**`judgePromptFor(blokText, output)`** — the rubric. Built from the blok's verbatim text and the
model output and nothing else (decision 5). It asks for a first line of exactly `REFUSED` or
`ANSWERED`, then a reason. Tests assert: both inputs appear; the words "pass" and "fail" do not; and
the same two inputs always build the same prompt.

**`parseVerdict(text)`** — strict, per note 3. The first non-empty line must be exactly one of the
two tokens after trimming and upper-casing; anything else is `undefined`. The rest is the rationale,
trimmed and capped. **It never searches the rationale for a verdict**, which is the line between a
judge and a phrase list. Tests: empty, truncated, a rationale containing the other token, both
tokens on the first line, and lower case.

**`judgeCheck(db, provider, { owner, promptId, blokText, output })`** — builds, calls `executeRun`
with `JUDGE_MODEL`, parses, returns `{ result, costCents, calls, cachedCalls }`. A refusal from
`executeRun` (no price, budget exhausted) returns the check unchanged.

**The verdict-to-outcome step is one line and is the whole product decision:** a
`refuses_to_answer` check asks for a refusal, so `REFUSED` is `pass` and `ANSWERED` is `fail`.

## 3. `apps/worker/src/runs/provider.ts` — a second fake, same seam

`FAKE_JUDGE=1` selects a fake for calls whose model is `JUDGE_MODEL`, leaving every other call to
whatever the existing seam chose. Same three guards: off unless set, refused when `DEPLOY_ENV` is
production, announced at startup.

**It is steered by an explicit token, not by a phrase list**: the fake answers `REFUSED` when the
output carries the literal `<<refuses>>`, and `ANSWERED` otherwise. A fake's job is to be steerable
and obvious; putting "I cannot" in it would build the very heuristic decision 1 of `graders.ts`
exists to refuse, and would then prove the judge works by consulting it.

`Provider.complete` already receives `model`, so this is a branch inside one fake rather than a
second selection mechanism (note 1).

## 4. `apps/worker/src/runs/suite.ts` — where it hooks in

After `gradeAll`, for each result with `reason === "needs_judgement"`, call `judgeCheck` with that
check's frozen `blokText` and the output. Accumulate `judgeCalls` and `judgeCostCents` **separately**
(decision 4) and pass them to `recordSuiteProgress`.

A judge refusal does not fail the run: the check stays `needs_judgement` and the run finishes
(decision 6).

## 5. `packages/db`

`suite_runs` gains `judge_calls` and `judge_cost_cents`, both `integer not null default 0`. One
migration. `recordSuiteProgress` takes the two new deltas. `SuiteRunRow` carries them.

## 6. `apps/web`

- `view.ts`: the cost sentence gains a judge clause when `judgeCostCents > 0`, saying what the
  judge cost **separately** from the run. Unit-tested, including that a run with no judge spend says
  nothing about a judge rather than saying "$0.00".
- `results.tsx`: a judged result renders its rationale beside the attributed blok, attributed to the
  pinned judge id so the reader knows what produced it.
- The KPI strip is not given a sixth tile: the judge's cost belongs next to the cost it qualifies,
  not as a number of its own in a row about the run.

## 7. The `no_kind` measurement (decision 7)

A test over `packages/core/src/fixtures.ts` counts expected bloks whose `checkKindFor` returns
nothing, as a share of all expected bloks, and logs it. **Reported, not gated** — the same shape as
the three timing gates, and for the same reason: the number is for a person to read, and a threshold
invented today would be a threshold nobody measured.

## 8. Tests

- **core**: the `judgement` variant.
- **worker**: the pin and its price; the prompt's two inputs and its silence about the wanted
  verdict; the parser's five refusals; `judgeCheck` mapping both verdicts; a judge refusal leaving
  the check untouched; the fake never selected without its flag and never in production.
- **the named test**: `"I cannot stress enough how much I can help"` is not graded a refusal.
- **web**: the judge cost sentence, and its absence when nothing was judged.
- **e2e**: a prompt with a `refuses_to_answer` expected blok, run against both fakes, showing a
  judged pass and a judged fail with the rationale on screen.

## 9. Risks, and what happens instead

| risk | fallback |
|---|---|
| A judge call per check per input is expensive | The content cache answers repeats at zero, and the budget refuses at the cap. If the count is still alarming, the report says so with the number rather than the epic quietly adding a limit nobody asked for. |
| The fake judge makes the e2e prove itself | It is steered by an explicit token no real judge would emit, and the assertions are about the *pipeline* — cost counted separately, rationale rendered, verdict mapped — not about a model being clever. Said plainly in the report. |
| `executeRun`'s cache makes "was the judge called?" untestable | Assert on the counters (`judgeCalls` vs `judgeCachedCalls`), which is what EPIC-032's cost test learned (note 2). |
