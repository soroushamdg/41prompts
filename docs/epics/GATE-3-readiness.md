<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# GATE 3 — what it can be decided on, and what it cannot

Written 2026-09-15 by Claude Code, after EPIC-034 merged. **This is input to Soroush's decision, not
the decision.** The decision belongs in `docs/decisions/GATE-3.md`, which only he writes.

Stage 3's four built epics are `done` with reports, session logs and browser drives: EPIC-030,
EPIC-031, EPIC-032, EPIC-033, EPIC-034. EPIC-031a is `deferred`. The next row in `docs/backlog.md`
is this gate, and everything after it is behind it.

---

## The six criteria, one at a time

`docs/roadmap.md`: *100 test runs with zero cache misses on repeats, cost within 5% of expected;
budget cap enforced; judge pinning verified by changing config; attribution correct on 10 seeded
failures; five observed users activated; M2 and M3 leading metrics against kill criteria.*

| # | criterion | where it stands |
|---|---|---|
| 1 | 100 test runs, zero cache misses on repeats, cost within 5% | **Provable in substance, never run at 100.** `execute.test.ts` runs the roadmap's own shape — ten inputs, then a re-run answered entirely from cache with zero provider calls. A cache hit spends nothing by construction, so "within 5%" is exact rather than approximate. Nobody has executed 100. |
| 2 | Budget cap enforced | **Proved, against a fake.** EPIC-031 reserves the worst case before a call and releases the overshoot after, refuses an unpriced model, and refuses rather than queues at the cap. Judge calls inherit all of it by going through `executeRun`. Never tested against a real bill. |
| 3 | Judge pinning verified **by changing config** | **Not done as written.** `judge.test.ts` asserts the id is priced and is not a floating alias, which is the property. Nobody has changed the pinned version and watched the behaviour follow, because doing so needs a real provider. |
| 4 | Attribution correct on 10 seeded failures | **Structurally true, not counted to ten.** `CheckResult.blokId` is exactly one blok by construction in `compile()` and is asserted in `grade.test.ts`; EPIC-032 renders it rather than computing it. The e2e and the drive each check one real failure, not ten. |
| 5 | Five observed users activated | **Not done.** It needs recruited people. Skipped under Soroush's standing instruction of 2026-09-15 that human-only work waits. EPIC-034 report §5. |
| 6 | M2 and M3 leading metrics against kill criteria | **Cancelled as a programme** (2026-09-12), so there are no numbers by decision rather than by omission. M3's metric additionally could not be gathered today — see below. |

---

## The one fact that decides most of this

**No model has ever been called by this project.**

`apps/worker/src/runs/anthropic.ts` exists, is imported, and has never executed. There is no
`ANTHROPIC_API_KEY` in Coolify or anywhere else. Every run in every test, every screenshot and every
drive across EPIC-032, EPIC-033 and EPIC-034 was answered by a deterministic fake.

Three consequences for this gate:

1. **Criteria 1–3 are proved in structure and unproved in practice.** The code paths are exercised;
   the thing they were built to talk to has never answered.
2. **M3's metric is not merely unmeasured, it is unmeasurable.** A new user on deployed staging gets
   `provider_not_configured`. "≥60% of signups reach a passing run within 5 minutes" cannot be
   greater than zero.
3. **EPIC-031a exists precisely to close this** and is `deferred` pending one environment variable
   and somebody watching the first call go out.

---

## What a reasonable reading looks like

Two, and both are defensible. **Neither is mine to choose.**

**Go, with EPIC-031a promoted.** Stage 3's software is built, tested and driven; what is missing is a
credential, not an epic. Set the key, do EPIC-031a's watched first call, re-read criteria 1–3
against a real provider, and proceed to Stage 4 — while accepting that EPIC-035, a *loud launch*,
should not happen on a product no real model has ever answered for.

**No-go until the first real call.** The gate's own words are "measured", and five of six criteria
currently rest on a fake. This reading treats EPIC-031a as the gate's blocking item rather than a
deferred row, and it is the reading the gate's phrasing supports most literally.

**What would be wrong either way:** counting criteria 1–4 as met on the strength of the fakes. They
are green, they are honest about what they exercise, and they are not evidence about a provider.

---

## Also due: a release

`PROCESS.md` asks for a release every three epics, and three have merged since the last one
(EPIC-032, EPIC-033, EPIC-034). Under the 2026-09-15 ruling nothing is pushed, so `main` is **15
commits ahead of `origin/main`** and neither staging nor production has any of it.

That makes the release a single decision of Soroush's rather than a routine: push, watch CI go red
or green, tag, deploy. `PROCESS.md`'s "The local pipeline" says to expect the first push after a gap
to go red, and names the Linux and clean-checkout differences a local gate cannot see.
