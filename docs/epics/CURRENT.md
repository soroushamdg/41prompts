# EPIC-033: LLM-judge grader
Stage: 3 · Depends on: EPIC-031 · Size: S

**Started as a stub on 2026-09-14**, to carry two pieces of inherited context into the file that gets
read when the epic is built. Goal and scope came from `docs/roadmap.md`.

**Completed 2026-09-15.** The stub said "the advisor completes the rest before this is worked on".
`docs/PROCESS.md` was amended that morning: when no advisor is relaying, Claude Code writes the epic
file itself and logs every decision it makes in that seat to `docs/decisions/AUTONOMOUS.md`. That is
what happened here. Everything from "Decisions" down is new; the inherited context above it is
untouched.

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

## Decisions — settled, do not re-litigate

**1. The judge grades `needs_judgement`, and this epic does not point it at `no_kind`.**

`needs_judgement` is `refuses_to_answer`, and it arrives with its kind already known: the question
to ask is fixed — *did this output refuse?* — and the blok supplies what it was supposed to refuse
about. A `no_kind` check has no derived question at all. Judging one means asking a model to invent
the criterion out of English prose, which is precisely the failure `paramsFor` refuses on purpose
(`Always include the order number.` derives nothing rather than guessing the phrase). A judge that
invents the criterion **and** answers it is grading its own homework.

EPIC-030 asked for the size of the `no_kind` queue to be measured before deciding how much of it a
judge should attempt, and that instruction is honoured literally: **this epic measures it and does
not grade it.** Decision 7 says what the measurement is.

**2. A judge call is a run.** It goes through `executeRun` with the judge model, which means it
inherits — rather than reimplements — the budget reservation, the content cache, the price table,
the typed refusals, and rule 6's payload retention with its twelve-month purge. A second call path
that spent money outside the cap would make the cap not a cap (EPIC-031 decision 2), and a judge is
the easiest thing in the system to accidentally run once per check per input.

**3. The judge model is pinned by version and a floating alias is refused** (`CLAUDE.md` rule 7). Not
"pinned by convention": a test fails on an id that looks like an alias, because the whole value of a
judge is that today's verdict and next month's were produced by the same thing.

**4. Judge spend is counted separately and never folded into model spend.** They answer different
questions — "what did it cost to run my prompt" and "what did it cost to check it" — and a person
deciding whether checking is worth it cannot do so from one number. This extends EPIC-032's
inherited requirement rather than replacing it: the cost still says what it counts.

**5. The judge is never told which verdict is wanted.** The prompt is built from the blok's verbatim
text and the model output, and from nothing else. It does not carry the expected answer, the other
checks' results, or any word about passing. This is the epic's `Review` line made testable, and the
reason it matters is that a judge told the answer will agree with it.

**6. A judge that does not answer leaves the check `not_graded`, still `needs_judgement`.** No judge
configured, a refused call, a budget exhausted, an unparseable verdict: all of them mean judgement
was needed and not reached, which is what that reason already says. **No new `NotGradedReason`**, and
emphatically no defaulting to `pass` or to `fail` — a judge that fails open calls an unchecked prompt
verified, and one that fails closed fails a prompt for our outage.

**7. The `no_kind` measurement is a number in the report, produced by a test.** Over
`packages/core/src/fixtures.ts`, count the expected bloks whose `checkKindFor` returns nothing, as a
share of all expected bloks. It is reported, not gated — the point is to hand EPIC-034 and whoever
revisits this a figure instead of an impression.

**8. Evidence carries the rationale, as a fact rather than a sentence.** `Evidence` gains a fifth
variant carrying the judge's own words and the pinned model id. `packages/core` still writes no
English (rule 3's reasoning applied to output, EPIC-032 note 3); `apps/web` turns it into prose.

---

## Scope

**`packages/core`** — types only, no IO, still zero dependencies:

- a fifth `Evidence` variant, `judgement`, carrying `rationale` and the pinned `judge` id;
- nothing else. **No ninth `CheckKind`** (the warning above), no grader that calls anything, and
  `grade()` stays pure and synchronous. The judge cannot live here and the boundary is the point.

**`apps/worker`** — the judge itself, proprietary:

- the judge prompt, built from the blok's verbatim text and the model output (decision 5);
- `JUDGE_MODEL`, pinned, with a priced row;
- a verdict parser that is strict: anything it cannot read is `not_graded`, never a guess;
- the call, through `executeRun` (decision 2), with its cost accumulated separately (decision 4);
- `runSuite` asking the judge only for results that came back `needs_judgement`.

**`packages/db`** — `suite_runs` gains `judgeCalls` and `judgeCostCents`. One migration.

**`apps/web`** — the judge's cost said separately in the run summary, and a judged result rendering
its rationale in the failure detail beside the attributed blok.

## Out of scope

- **Judging `no_kind` checks.** Decision 1. Measured, not graded.
- **A ninth check kind.** ADR-003 fixes the set at eight.
- **A second judge, or a judge the user can choose.** One pinned model. Provider choice is EPIC-042.
- **Judging the other seven kinds.** They grade deterministically and a judge would be a worse
  answer to a question that already has an exact one.
- **Rubric editing.** The rubric is the blok's own text. A rubric a person can tune separately is a
  second source of truth about what a blok means.
- **Re-judging an old run.** Same reason `suite_checks` freezes the text: EPIC-040 owns versions.

## Acceptance criteria

- [ ] A check of kind `refuses_to_answer` is graded by the judge: an output that refuses is `pass`
      against a blok asking for a refusal, and one that answers is `fail`. Fixtures, not a live call.
- [ ] `"I cannot stress enough how much I can help"` — the sentence `graders.test.ts` pins as the
      phrase-list trap — is **not** graded a refusal by the judge fixture path. The named test.
- [ ] The judge model id is pinned, and a test fails if it looks like a floating alias.
- [ ] `JUDGE_MODEL` has a priced row, asserted by a test, because an unpriced model does not run.
- [ ] The built judge prompt contains the blok text and the model output and **no statement of which
      verdict is wanted**. A test asserts it, per decision 5.
- [ ] A verdict the parser cannot read leaves the check `not_graded` with `needs_judgement`, and a
      test covers empty, truncated and contradictory replies.
- [ ] No judge configured leaves every `needs_judgement` check exactly as it was, and the run still
      finishes. The EPIC-032 refusal shape, inherited.
- [ ] Judge calls go through the budget: a judge call at the cap is refused and does not spend.
- [ ] Judge cost and judge calls are stored separately from model cost and model calls, and the run
      summary says both, distinctly. Playwright.
- [ ] A judged failure shows the judge's rationale beside the attributed blok in the failure detail.
      Playwright, and the browser drive.
- [ ] The `no_kind` share of the fixture corpus is measured and the number is in the report.
- [ ] Every interactive element added works by keyboard and at 390px (rule 12).

## Verification

```
pnpm test                         # core: the variant; worker: the judge, the parser, the pin
pnpm e2e                          # the judge path end to end against a fake judge
node scripts/gates.mjs ci         # the gate before the merge
node scripts/drive-epic-033.mjs   # the built app, by hand, screenshotted
```

## Notes for the implementer

**1. The fake provider already echoes the last line**, which is how EPIC-032's e2e chose the model's
answer through the CSV. A judge needs a *second* fake whose reply is a verdict, and the two are
selected by the same `providerFor` seam. Do not add a second mechanism; extend the one that exists,
with the same three guards.

**2. `executeRun` caches by content hash**, so two identical judge calls cost once — which is right,
and which means an e2e asserting "the judge was called" must make its content unique or assert
against the cache the way EPIC-032's cost test learned to.

**3. The verdict parser is where a judge quietly becomes a phrase list.** Ask for one token, parse
exactly that token, and refuse everything else. A parser that searches the rationale for "yes" has
reinvented the thing decision 1 of `graders.ts` exists to avoid.

**4. Rule 7 is about the id, not about intent.** `claude-sonnet-5` with no date is an alias whatever
anybody meant by it.

**5. Vocabulary.** check, blok, span, Draft, Live. The word **judge** is not in ADR-003's forbidden
list and is used here as a noun for the grader. Never "assertion", never "block".

**6. Do not let the judge see the other checks.** One check, one output, one verdict. A judge given
the whole result set will start being consistent with it instead of with the output.
