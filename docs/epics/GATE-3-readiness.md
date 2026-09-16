<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# GATE 3 — what it can be decided on, and what it cannot

Written 2026-09-15 by Claude Code, after EPIC-034 merged. **This is input to Soroush's decision, not
the decision.** The decision belongs in `docs/decisions/GATE-3.md`, which only he writes.

Stage 3's five built epics are `done` with reports, session logs and browser drives: EPIC-030,
EPIC-031, EPIC-032, EPIC-033, EPIC-034. The next row in `docs/backlog.md` is this gate, and
everything after it is behind it.

> **Amended 2026-09-15, later the same day, and three facts in the original text are now wrong.**
> The note was written before the key was set and before EPIC-031a was planned. What changed:
> **(a)** `ANTHROPIC_API_KEY` **is** set on staging in Coolify — $5 balance, $5 cap, no
> auto-recharge — so "there is no key anywhere" below is corrected in place; **(b)** EPIC-031a is
> no longer `deferred`: it has a plan (`docs/epics/EPIC-031a-first-real-call.md`) and a verifier
> (`scripts/verify-first-call.mjs`), and what it now waits on is a **push**; **(c)** the release
> figures have moved. **What has not changed is the finding**: no model has ever been called by
> this project, and every criterion below stands exactly where it did.

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

`apps/worker/src/runs/anthropic.ts` exists on local `main`, is imported by `provider.ts`, and has
never executed. Every run in every test, every screenshot and every drive across EPIC-032, EPIC-033
and EPIC-034 was answered by a deterministic fake.

**Corrected 2026-09-15: the key is no longer the missing piece; the code is.** `ANTHROPIC_API_KEY`
is set on staging in Coolify. What staging does not have is the call site — `origin/main` is at
`c18ea03` and carries neither `apps/worker/src/runs/anthropic.ts` nor `provider.ts`, both of which
arrived in EPIC-032 and later. Verified rather than assumed: `git ls-tree origin/main
apps/worker/src/runs/` lists only `execute.ts`, `execute.test.ts` and `prices.ts`. **There is no key
on this machine either** — the root `.env` has no `ANTHROPIC_API_KEY` — so the local rehearsal
EPIC-031a's Decision 1 asks for cannot run here today without one.

Three consequences for this gate:

1. **Criteria 1–3 are proved in structure and unproved in practice.** The code paths are exercised;
   the thing they were built to talk to has never answered.
2. **M3's metric is not merely unmeasured, it is unmeasurable.** A new user on deployed staging gets
   `provider_not_configured`. "≥60% of signups reach a passing run within 5 minutes" cannot be
   greater than zero.
3. **EPIC-031a exists precisely to close this.** It is planned rather than deferred as of
   2026-09-15, and it waits on a push: staging cannot make the call from a commit that has no call
   site in it. Its local rehearsal additionally waits on a key in this machine's `.env`.

---

## What a reasonable reading looks like

Two, and both are defensible. **Neither is mine to choose.**

**Go, with EPIC-031a promoted.** Stage 3's software is built, tested and driven; what is missing is
a deploy, not an epic. **Corrected 2026-09-15: the credential is no longer what is missing** — the
key is set. Push, let staging take the code, do EPIC-031a's watched first call, re-read criteria 1–3
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
(EPIC-032, EPIC-033, EPIC-034). Under the 2026-09-15 ruling nothing is pushed, so `main` is ahead of
`origin/main` and neither staging nor production has any of it.

**The figures, re-measured 2026-09-15 at `2079633` — the note first said 15 commits and it is now
20.** `main` is **20 commits ahead of `origin/main`** (`c18ea03`, which is what staging is serving).
Production is at `af089c7` and is **69 commits / 402 files behind**; the newest tag is `v0.5.0`, so a
release would be `v0.6.0`. `docs/epics/RELEASE-DUE.md` carries the commit list.

That makes the release a single decision of Soroush's rather than a routine: push, watch CI go red
or green, tag, deploy. `PROCESS.md`'s "The local pipeline" says to expect the first push after a gap
to go red, and names the Linux and clean-checkout differences a local gate cannot see.
