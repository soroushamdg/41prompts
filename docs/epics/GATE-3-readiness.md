<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# GATE 3 — what it can be decided on, and what it cannot

Written 2026-09-15 by Claude Code, after EPIC-034 merged. **This is input to Soroush's decision, not
the decision.** The decision belongs in `docs/decisions/GATE-3.md`, which only he writes.

Stage 3's built epics are `done` with reports, session logs and browser drives: EPIC-030, EPIC-031,
EPIC-031a, EPIC-032, EPIC-033, EPIC-034. The next row in `docs/backlog.md` is this gate, and
everything after it is behind it.

> **Amended 2026-09-15**, hours after it was written, when the key was set and EPIC-031a was planned
> rather than deferred. **Amended again 2026-09-16, and this time the finding itself changed.**
>
> The original document turned on one sentence — *no model has ever been called by this project* —
> and on 2026-09-16 that stopped being true. EPIC-031a made two real calls to `claude-sonnet-5` from
> deployed staging, through the product's own Runs page, for `$0.02`. The criteria table below is
> re-read against that, the "one fact" section is replaced by what actually decides this now, and
> **both readings are kept and neither is chosen.** Choosing is still Soroush's.

---

## The six criteria, one at a time

`docs/roadmap.md`: *100 test runs with zero cache misses on repeats, cost within 5% of expected;
budget cap enforced; judge pinning verified by changing config; attribution correct on 10 seeded
failures; five observed users activated; M2 and M3 leading metrics against kill criteria.*

| # | criterion | where it stands, 2026-09-16 |
|---|---|---|
| 1 | 100 test runs, zero cache misses on repeats, cost within 5% | **Proved in structure; two runs executed for real, and the repeat was not one of them.** `execute.test.ts:73` runs the roadmap's own shape against a fake — ten inputs, then a re-run answered by ten cache hits and zero provider calls — and `:87` pins that a hit costs 0, so "within 5%" is exact by construction rather than approximate. What EPIC-031a added is a real price for a real call: `$0.02` for a 2-input run, re-derived from the stored token counts against the price table exactly, which is the first evidence that "expected" was ever the right number. **The cached repeat was not driven against the real provider** — the drive's cleanup removed its user between runs, so a repeat had no account to hit the cache from. EPIC-031a's report §3 leaves that box unticked. Nobody has executed 100. |
| 2 | Budget cap enforced | **Proved against a fake, and reconciled once against a real bill.** EPIC-031 reserves the worst case before a call, releases the overshoot after, refuses an unpriced model, and refuses rather than queues at the cap. EPIC-031a watched the reconciliation happen with real money: spend moved by the **actual** `2c` of a `500c` cap, not by the reserved worst case. The cap itself has still never been *hit* by a real call — that path remains fake-only. |
| 3 | Judge pinning verified **by changing config** | **Not done as written, and the judge has still never met a real model.** `judge.test.ts:38` asserts the id is not a floating alias and `:42` that it has a priced row, which is the property rule 7 is about. Changing the pinned version and watching behaviour follow needs a real provider, and EPIC-031a's last checklist item — a `refuses_to_answer` check graded by a real `claude-haiku-4-5-20251001` — was **not driven**, because the example prompt has no `refuses_to_answer` blok. This is the criterion the first real call moved the least. |
| 4 | Attribution correct on 10 seeded failures | **Structurally true; one real failure now counted, not ten.** `CheckResult.blokId` is exactly one blok by construction in `compile()` and is asserted in `grade.test.ts`; EPIC-032 renders it rather than computing it. EPIC-031a is the first time a **model's own words** failed a check and the failure was attributed on screen to the blok that owns the rule. One, driven by hand, not ten seeded. |
| 5 | Five observed users activated | **Not done.** It needs recruited people. Skipped under Soroush's standing instruction of 2026-09-15 that human-only work waits. EPIC-034 report §5. |
| 6 | M2 and M3 leading metrics against kill criteria | **Cancelled as a programme** (2026-09-12), so there are no numbers by decision rather than by omission. **The 2026-09-15 note additionally called M3's metric *unmeasurable*, and that is now false** — see below. |

---

## What changed on 2026-09-16, and what it did and did not settle

**The project has now called a real model.** Twice, on purpose, from deployed staging, through the
Runs page a user would use, with no fake anywhere in the path. `docs/epics/reports/EPIC-031a-report.md`
is the record; the numbers are `$0.02`, `59` in / `607` out tokens on one call, and `3,765 ms` and
`8,384 ms` of latency.

**The strongest thing it settled is not a criterion.** The example prompt contradicts itself on
purpose — one blok forbids "sorry", the last one demands an apology — and the real model obeyed the
nearest instruction and broke the stated rule. The run came back not verified, the failure was
attributed to the owning blok, and the model's own sentence was on screen with the offending region
marked. That is the product's entire claim executed end to end, and before 2026-09-16 it had never
happened.

**Three consequences for this gate, replacing the three the 2026-09-15 note listed:**

1. **Criteria 1–4 move from "proved in structure, unproved in practice" to "proved in structure,
   and sampled once in practice".** One real run is not 100 runs and one real failure is not ten
   seeded ones. But the class of thing the fakes could not speak to — does the provider answer, in
   the shape we assumed, at the price we assumed — has now been sampled, and it did not all hold.
2. **M3's metric is measurable again.** The 2026-09-15 note said a new user on staging gets
   `provider_not_configured`, so "≥60% of signups reach a passing run within 5 minutes" could not be
   greater than zero. Staging now makes real calls, so the number can be gathered. The *programme*
   is still cancelled, which is a separate decision and Soroush's.
3. **The first real call found a real defect, which is what it was for.** `result.response?.body`
   came back undefined, so `anthropic.ts` stored the SDK's **normalised view** and `CLAUDE.md`
   rule 6's *raw provider payload* was not raw — the tell was `inputTokens` in camelCase where
   Anthropic's own body writes `input_tokens`. **The resolved model id was therefore never
   captured**, so a call that cost real money still cannot say which model produced its verdict,
   which is precisely what rule 7 exists to make answerable. Fixed in `ca70def` without pretending
   the body was obtained: `modelId` is captured and the fallback labels itself `normalised: true`.

---

## The one fact that now decides most of this

**The fix is not on staging, because it has not been pushed.**

| | commit | |
|---|---|---|
| production | `af089c7` | 79 commits / 411 files behind local `main` |
| staging | `22d9021` | `= origin/main`; 3 commits behind local `main` |
| local `main` | `b62433f` | EPIC-031a merged |

Measured 2026-09-16 against `/healthz` on both, not remembered. The three commits staging is missing
are exactly the adapter fix, its evidence and the merge — so **the deployed environment that made the
first real call is the version that made it wrongly**, and the three unticked criteria from
EPIC-031a's report §3 (the resolved model id, the cached repeat at zero, and one real judge call)
all need a push before any of them can be closed.

Three unticked criteria, three cheap drives, one push. That is the whole of the distance between
where this gate is and where its own words ask it to be on criteria 1–3.

---

## What a reasonable reading looks like

Two, and both are defensible. **Neither is mine to choose.**

**Go, with the three drives as a condition.** Stage 3's software is built, tested, driven, and has
now been answered by a real model at a known price. What is missing is a push and three short
drives, not an epic. Push, let staging take `b62433f`, close the resolved-model-id, cached-repeat
and real-judge boxes, and proceed to Stage 4 — while accepting that EPIC-035, a *loud launch*,
should not happen on a product whose judge has never met a model and whose retention promise is
currently kept by a normalised view.

**No-go until the gate's own words are met.** The gate says *measured*: 100 runs, 10 seeded
failures, judge pinning verified by changing config, five observed users. One real run, one real
failure and zero real judge calls is a sample, not a measurement, and the sample of one already
turned up a rule-6 defect — which is an argument that more sampling is exactly what is owed. This
reading treats the three unticked boxes plus a counted attribution set as the gate's blocking items.

**What would be wrong either way:** reading EPIC-031a's `$0.02` as evidence about criteria 1–4 at
their stated sizes. It is one sample. It is a good one, it is the first this project has ever had,
and it is not 100 runs or 10 failures.

**One question sits underneath both and is not a criterion.** EPIC-031a's report §7 asks whether a
normalised view satisfies rule 6, because the privacy page describes that retention to users.
Obtaining the provider's real body means a `fetch` wrapper, which is a bigger change than the epic
that found it. Answering it before Stage 4 is cheaper than answering it after EPIC-042 adds two more
providers to the same adapter shape.

---

## Also due: a release

`PROCESS.md` asks for a release every three epics. Four have merged since the last one — EPIC-032,
EPIC-033, EPIC-034 and EPIC-031a — and `docs/epics/RELEASE-DUE.md` carries the commit list, written
at `f3fa8a2` and therefore two commits short of the current head.

**The figures, re-measured 2026-09-16 at `b62433f`:** production is at `af089c7`, **79 commits and
411 files behind**; the newest tag is `v0.5.0`, so a release would be `v0.6.0`. Staging is at
`22d9021` and 3 commits behind.

That makes the release a single decision of Soroush's rather than a routine: push, watch CI, tag,
deploy. `PROCESS.md`'s "The local pipeline" says to expect the first push after a gap to go red and
names the Linux and clean-checkout differences a local gate cannot see — though the 2026-09-16 push
of 27 commits went green on the first attempt, which is one data point against that expectation.
