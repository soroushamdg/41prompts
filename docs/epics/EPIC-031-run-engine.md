# EPIC-031: worker — run engine, Anthropic
Stage: 3 · Depends on: EPIC-004, EPIC-030 · Size: M

**Written 2026-09-14 by Claude Code**, because Stage 3 had no epic file for this. Goal and tasks come
from `docs/roadmap.md`; the decisions below are Soroush's rulings of 2026-09-14, recorded here rather
than only in the plan and the report — **a decision that lives only in a report is one the next
person will be tempted to "simplify".**

## Goal
Runs execute safely in the background: a prompt and an input go to a provider, the answer comes back
graded, and nothing about the run is unbounded — not its cost, not its retention, not its retries.

## Decisions (do not re-litigate)

### 1 · `purge_after` is written at insert, never derived at read

**The one most likely to be "simplified" later, so it is first.**

Every run row is stamped with the date its payload may be deleted, at the moment it is written. The
tempting alternative is to drop the column and have the purge ask
`WHERE created_at < now() - interval '365 days'` — one less column, one less thing to keep right.

**It is wrong, and silently.** That query re-derives the window *every time it runs*, against
whatever the constant says *today*. So the moment anyone changes the retention period, every row
already in the table is retroactively re-dated: rows written under a twelve-month promise quietly
acquire whatever the new promise is. If the window shortens, data a person was told would be kept is
deleted early; if it lengthens, data they were told would be gone is still there.

**A promise travels forward, not backward.** A stored date keeps the promise each row was written
under, whatever the product later decides for new rows. `purgeAfterFor()` is the single place the
stamp is computed, from the same constant the privacy page imports, and
`purge-run-payloads.test.ts` asserts the date does not move.

### 2 · At the cap: refuse. Not queue, not degrade

**Refuse.** The run is rejected with a typed reason and nothing is called.

> **A queue that never drains is an outage that looks like patience.**

That is the reason, kept verbatim because it is the argument. A queue needs expiry, visibility and a
way to cancel before it is honest, and all three are EPIC-032's surface — until they exist, "queued"
is indistinguishable from "silently broken".

**Degrade is out** and stays out: a pass under a degraded run is not a pass, and `CLAUDE.md` rule 9
hangs publishing on that pass meaning something.

### 3 · Reserve an estimate, reconcile on completion

Cost is known only *after* a call; the cap must act *before* it. So the budget reserves
**input tokens plus the model's maximum output, at list price**, increments before calling,
and releases the difference when the real usage comes back.

The alternative — check the cap, call, then increment the actual — was rejected: *"exceedable by one
call" is unbounded when that call carries a 200k-token context.* A reservation wrong by a margin is a
rounding error; a cap any single call can blow is not a cap.

### 4 · An unpriced model does not run

A model absent from the dated price table has no list price, and **reserving against a price you do
not have is not a reservation.** The run is refused with its own reason rather than run at an assumed
zero — `runs.costCents` is nullable precisely so that "unknown" is expressible, and recording zero
would spend nothing against a budget whose entire job is to stop spending.

### 5 · A cache hit spends nothing

It calls nobody, so it costs nothing, so it reserves nothing.

**The consequence is real and is EPIC-032's to handle**: a re-run is free, so the number in front of
a user stops matching what they ran. It is carried into that epic's file as an inherited requirement
— the cost shown to a user must say what it counts.

### 6 · Work already done survives a cap

A run is many calls. Hitting the cap at input 50 of 200 stops the run and **keeps the 50**.
EPIC-030's `RunSummary` already says "50 of 200 ran" without ambiguity, so discarding paid-for work
buys a cleaner story at the user's expense.

### 7 · The overdue count is monitored, threshold zero

`countOverdueRunPayloads` is not merely logged. A non-zero value is reported to Sentry, because
**a signal only a log-reader sees is the failure it exists to prevent** — and this purge's window is
twelve months, so a broken sweep and a working one are indistinguishable by their own output for a
year.

### 8 · Keys are never stored, logged, or put in an error

Not in a column, not in `params`, not in a captured exception. EPIC-004 decision 3.

## Scope
- `packages/db`: the `runs` table, `RUN_PAYLOAD_RETENTION_DAYS`. **Shipped in #87.**
- `apps/worker`: the purge sweep and the overdue count. **Shipped in #87.**
- `apps/worker`: a dated price table; cost computation; the provider adapter behind an interface;
  the cache; budget reserve-and-reconcile; the run queue; retries; per-owner concurrency.
- `apps/web`: the privacy page's retention row stops saying "not built yet".

## Out of scope
- The Runs page — EPIC-032.
- The judge — EPIC-033.
- Any provider but Anthropic.

## Acceptance criteria
- [ ] Ten inputs produce ten results against a mocked provider; a re-run produces ten cache hits and
      **zero calls**. Evidence: two test names.
- [ ] The cap refuses the run that would exceed it, and the runs already completed are kept.
      Evidence: test names.
- [ ] An unpriced model is refused rather than run at zero. Evidence: test name.
- [ ] A cache hit reserves and spends nothing. Evidence: test name.
- [ ] A reservation is released when actual usage is lower. Evidence: test name.
- [ ] Retries on 429 and 5xx are bounded, and a retried call that succeeds is **one** run row and
      **one** cost. Evidence: two test names.
- [ ] No key appears in a stored row, a log line, or a captured error. Evidence: test name plus grep.
- [ ] The purge's clock test, and the overdue count. **Done in #87.**
- [ ] The privacy page's row states the enforced number and cites the file; the "not built yet" test
      is replaced by one comparing the cell to the constant. Evidence: test names.
- [ ] `pnpm test`, `typecheck`, `lint`, `e2e`, `compliance`, `binary-files` clean.
- [ ] Report and session log written; backlog updated.

## Verification
`pnpm test && pnpm typecheck && pnpm lint`. **No browser drive**: this epic ships a worker, a table
and a purge. Its only user-visible change is one line of the privacy page, which has its own tests.
Say so in the report rather than leaving the criterion looking skipped.

## Notes for the implementer
- The price table is **dated and sourced**: every row carries the date it was read and the URL.
  `roadmap.md`'s review line asks for it.
- The provider goes behind an interface. Every test uses a mock; no test calls Anthropic.
- `apps/worker` is proprietary, so `ai` and `@ai-sdk/anthropic` are allowed there — rule 11 governs
  the public packages, and `packages/core` remains zero-dependency.
