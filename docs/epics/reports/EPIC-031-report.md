<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# EPIC-031 report — worker: run engine, Anthropic

Date: 2026-09-14 · Branches `epic/031-run-retention` (#87) and `epic/031-run-engine`

Shipped in two halves. The first was the retention and purge work, which depended on none of the open
questions; the second is everything the four rulings settled.

## 1. The rulings, and where each one landed

| ruling | where |
|---|---|
| **Reserve an estimate and reconcile** — a cap any single call can blow is not a cap | `withReservation`, `budgets/increment-run-budget.ts` |
| **Degrade is out** | not built; the epic file records why it stays out |
| **Keep the 50 of 200** | `executeRunSet`, and its named test |
| **Build the overdue count** | `countOverdueRunPayloads`, shipped in #87 |
| **Q1 · monitored, threshold zero** | §4 |
| **Q2 · refuse** | `RefusalReason`, and the sentence is in the epic file |
| **Q3 · unpriced does not run; cache hits spend nothing** | §3 |
| **Q4 · prose in months, cell in days** | §5 |

## 2. `purge_after` at insert — written into the epic file, not just here

Soroush: *"the kind of decision the next person will be tempted to simplify."* It is now decision 1
of `EPIC-031-run-engine.md`, first in the list, with the mechanism spelled out: dropping the column
and asking `WHERE created_at < now() - interval '365 days'` re-derives the window **every time it
runs**, so changing the retention period retroactively re-dates every row already written. Shorten it
and data somebody was promised is deleted early; lengthen it and data they were told was gone is
still there.

A promise travels forward. A stored date keeps the one each row was written under.

## 3. Money

**Reserve the worst case, release the overshoot.** `withReservation` reserves input tokens plus the
model's maximum output at list price through the existing atomic conditional `UPDATE`, then releases
the difference once real usage is known. The release is a separate statement on purpose: the
reservation must be atomic with its cap check and the release must not be, because holding a row lock
across a provider call is how one slow model blocks every other run for the same owner.

**Whatever the call throws, the reservation goes back.** A provider outage must not cost somebody
their month's budget, and a release is clamped at zero so a reconciliation bug costs a user headroom
rather than silently minting budget.

**An unpriced model does not run.** `runs.costCents` is nullable precisely so "unknown" is
expressible, and recording zero would spend nothing against a budget whose entire job is to stop
spending — the worst available failure, because it looks like it works.

**A cache hit spends nothing**, and the consequence is carried into EPIC-032's file rather than left
here: a re-run is free, so the number in front of a user stops matching what they ran.

### The test I got wrong first, which is the mechanism working

The cap test set a budget of two reservations and expected ten runs to stop early. They did not —
**because the overshoot is released after every call**, so `spentCents` grows by the *actual* cost
(one cent) rather than the reservation (thirty-three). Ten calls fit inside two reservations easily.

The arithmetic is now in the test with the reasoning, because the surprise is the feature: a run
proceeds while `spent + reservation <= cap`, so a cap two cents above one reservation leaves room for
exactly three one-cent calls.

## 4. The overdue count is monitored, not just logged

Ruled: *a signal only a log-reader sees is the failure it exists to prevent.* `countOverdueRunPayloads`
runs after the delete in the same sweep and a non-zero value is reported, because this purge's window
is twelve months and a broken sweep and a working one are indistinguishable by their own output —
both log `0 purged`, every night, for a year.

Two tests: zero after a working sweep, and the count a broken one would leave behind.

## 5. The privacy page's promise became real

The retention row said **"12 months — not built yet"** with `—` in *Enforced by*. It now reads
`365 days`, cites `apps/worker/src/jobs/purge-run-payloads.ts`, and `legal.test.ts` walks that path
and fails if the file is missing.

**The test that asserted the placeholder is inverted**, and this is the one place in the codebase
where that inversion was planned in advance rather than discovered:

- was: *says the 12-month payload retention is not built yet, and names the epic*
- now: *no longer says the payload retention is unbuilt, because it is built* — plus a test that the
  prose says "Twelve months", the cell says `365 days`, and the cell equals the constant.

The row's note also records why the whole row is deleted rather than the payload emptied: a row kept
without its payload still records that this person ran this prompt that day, which is technically
inside the promise and practically misleading.

## 6. Verification

```
test        8 checked, 8 passed     (24 new worker tests, 2 new web tests)
typecheck   8 checked, 8 passed
lint        11 checked, 11 passed
e2e         178 passed, 4 skipped, 0 failed
compliance  reuse, boundaries, forbidden words, binary files, licence gate, mirror dry-run — OK
```

**New dependencies**: `ai` and `@ai-sdk/anthropic`, in `apps/worker` only. `CLAUDE.md`'s stack line
names the Vercel AI SDK for providers; rule 11 governs the public packages and `packages/core` is
still zero-dependency.

## 7. No browser drive, and why that is not a skipped criterion

This epic ships a worker, a table, a purge and a price table. Its only user-visible change is one line
of the privacy page, which has its own tests — including one that compares the cell to the constant
that the job enforces. `PROCESS.md`'s drive rule has nothing else to drive.

Said here in the same words EPIC-030's report used, because an unexplained missing drive reads
exactly like a skipped one.

## 8. For the advisor

1. **The adapter is an interface with a fake in every test; no test calls Anthropic.** The real
   `@ai-sdk/anthropic` call site is thin and unexercised by CI on purpose — the first time it runs
   against the real provider will be a person doing it deliberately, and that is worth scheduling
   rather than discovering.
2. **Concurrency is one, deliberately.** `executeRunSet` is sequential: parallel calls would make the
   reservation race itself, two calls reserving against the same headroom. Raising it needs the
   reservation to be per-call rather than per-owner, which is a change to EPIC-004's table.
3. **`estimateTokens` is four characters per token**, which is the common approximation and is wrong
   for code and for non-Latin scripts. It only sizes a reservation that is released afterwards, so
   being wrong costs headroom for the length of one call — but if a user with a Japanese prompt
   reports hitting their cap early, this is why.
