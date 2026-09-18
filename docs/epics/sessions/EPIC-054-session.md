<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: Apache-2.0
-->

# EPIC-054 — session log

**Date.** 2026-09-17. One session, `epic/054-python-sdk`.

**Prompt sent.** The operator's standing `PROMPT_CONTINUE`: read `CLAUDE.md`, `docs/PROCESS.md`,
`docs/AUTONOMOUS.md`, `docs/epics/CURRENT.md`, `docs/backlog.md` and `docs/decisions/AUTONOMOUS.md`;
work out from git where the project actually is; pick up the next epic and build it to Definition of
Done.

---

## How the epic was picked

`docs/epics/CURRENT.md` was EPIC-053, which is done and merged (`80d8ccb`). `git log`, the reports
directory and `docs/epics/HANDOVER.md` all agree that **EPIC-054 is next**, and the backlog's Stage
5b table has it `todo` with its only dependency (053) done.

**`scripts/pick-next-epic.mjs` could not hand it to me.** It stops on `▣ GATE 3`, whose status cell
still reads `—` although `docs/decisions/GATE-3.md` records the decision. The handover has said so
for three epics; the picker reads the cell, not the decision file, and only Soroush may write it.
The instruction in this session came from him directly, which outranks the picker, and the report
says so again.

**The row had no epic file**, as nine rows before it did not. Written in the advisor's chair on that
precedent, with ten rulings, all logged.

**`docs/epics/RELEASE-DUE.md` was sitting in the tree** from EPIC-053's merge — the loop stops every
three epics and waits. Restarting is how Soroush says he has cut the release
(`docs/AUTONOMOUS.md`), and this session was started by him, so it proceeded.

---

## Plan summary

Written to `docs/epics/plan-EPIC-054.md` before any code. Ten steps; the order was the decision.

**`_canonical.py` first, and de-risked before the plan was written.** It is the only file in a
cross-language port where being nearly right produces a package that refuses every document it is
handed — and reports it as `hash_mismatch`, which means tampering. A prototype of the ECMA-262
number reformatter was run against 37 values emitted by Node before anything else was written: 0
mismatches. Everything after it is a transliteration of commented code.

---

## Decisions and why

The ten rulings are in `docs/decisions/AUTONOMOUS.md` and argued in
`docs/epics/EPIC-054-python-sdk.md`. The three that shaped the most code:

**`py.typed`, not the roadmap's `.pyi`.** PEP 561 makes a stub file *override* the annotations of
the module it shadows, so it is a second copy of every signature and it is the copy a customer's
`mypy` believes. This repository has refused a second copy four times under four names. Named in the
report as a narrowing rather than delivered as though it were the roadmap's word.

**The canonical encoder targets ECMA-262, not Python's `json`.** Four divergences, all real. The
golden is generated from Node and is 331 cases; the stronger check is that the Python verifier
re-derives `packages/core`'s own frozen v1 fixture's address and matches.

**The disk cache shares `@41prompts/sdk`'s directory and record.** Not for the warm cache — for the
test. Each language's suite reads a record the other language's writer produced, which is the only
cheap cross-language integrity check available in an epic that necessarily has two implementations
of the same encoding.

---

## What took longer than expected, and what was quick

**Quick.** The port itself. `verify.ts`, `disk.ts`, `network.ts` and `client.ts` carry their own
arguments in their headers, and porting the reasoning alongside the code meant almost nothing had to
be re-derived. The first `read_build` against core's frozen fixture matched on the first run.

**Longer.** Three things.

1. **The number formatter**, and it was worth it. Getting `1e15`, `1e16`, `1e-6`, `1e-7`, `-0` and
   `2**53` all right needed ECMA-262 §6.1.6.1.20's five cases written out rather than `repr` with a
   patch. Prototyped in the scratchpad against Node before it went in the package.
2. **The forbidden-word gate learning Python.** A line-based `#` stripper under-reports — it blanks
   the rest of a line containing a `#` inside a string — so it needed a small scanner that tracks
   quotes. And the wire-key exemption had to be rewritten per occurrence after its own control
   caught the line version exempting a sentence.
3. **The drive, twice, and then a third build.** §4.1 below.

---

## What the drive found, which is the part worth reading

**The first drive was 11 of 16.** A real Python process could not resolve a prompt published two
minutes earlier. The cause was not in the new code: `refresh()` with no argument refreshes every
prompt the client has been asked for, and a freshly constructed client has been asked for none — so
a bare `refresh()` at start-up fetches nothing.

**Four documents printed that bare call as the way to be warm before the first request**, including
`@41prompts/sdk`'s README and the Connect page. Proved against the shipped TypeScript SDK with a
counting `fetch` before a line was changed: 0 requests after `refresh()`, 1 after a `resolve()` then
`refresh()`, 2 after `refresh(promptId)`.

**Nothing in either suite crossed it**, because every other refresh test resolves first. Both now
have a test that a bare `refresh()` on a fresh client makes no request.

**The second drive was 15 of 16**, and the remaining one was not a defect: the generated
`prompts.py` calls the module-level `resolve()`, whose client is cold, so its very first call in a
fresh process is `unavailable`. That is rule 8's stated cost. The drive now asserts **both** halves —
the cold call being `unavailable` and `configure(bundled=…)` making the first call answer — because
showing only the working one would hide what a customer meets first.

**Then a third build**, because the Connect screenshot had been taken from the build made *before*
the snippet was corrected and still showed the old line. Lesson 17 pointed at a screenshot rather
than at a server.

---

## Gates

`pnpm test`, `pnpm typecheck`, `pnpm lint` all green with every package reporting. The full table is
in the report, §7.

**Two things about the local runs are worth writing down.**

`pnpm test` failed twice on this machine before the gate ran, on different packages each time
(`@41prompts/db` + `@41prompts/web`, then `@41prompts/sdk`), and each failure was a **timeout**
rather than an assertion. The cause was identified rather than labelled: `sysctl hw.ncpu` is 8 and
`uptime` reported a load average of **67**. The SDK's never-throws fuzz takes 320 ms in isolation on
this machine and took 5,880 ms against a 5,000 ms budget inside the parallel run — roughly 18x. That
is host oversubscription, named, with the measurement.

The first `gates.mjs ci` run was **2 of 16 failed**, and only one of them was that:

- **`pnpm e2e`** — a real failure and the gate doing its job. `connect.spec.ts` asserted the literal
  `await prompts.refresh();` on the page, and the fix above had replaced it. Fixed in `4112dcf`,
  with a second assertion so that reverting the fix fails the spec.
- **`pnpm test`** — `@41prompts/web` reported FAIL with **41/41 files and 580/580 tests passing**.
  The package failed on one *unhandled* error, `[vitest-worker]: Timeout calling "onTaskUpdate"` —
  the worker's RPC to the reporter, not a test. `cli-generated-code.test.ts` took 66.5 s in that run
  against ~23 s locally.

### The oversubscription was the cause, and it took four runs to stop calling it the weather

The paragraph above was written mid-epic and its last sentence — "that is host oversubscription,
named, with the measurement" — was right about the words and wrong about the subject. It read as a
statement about the *host*: a busy laptop, a Node running under Rosetta. Both true, neither the
cause.

Run 3 failed `pnpm test` again — `canvas.test.ts` at 5,380 ms against a 5,000 ms default, and
`apps/web` reporting **581 of 581 tests passed** and failing anyway on a sixty-second
`onTaskUpdate` RPC. Fifteen of sixteen steps were green, `pnpm e2e` included. Rather than run it a
fourth time and hope, the thing was probed: one `pnpm test`, `ps` sampled every four seconds.

**71 concurrent vitest processes. A one-minute load average of 262. Eight cores.**

Nine packages, each sizing a vitest fork pool to the machine, and `turbo run` scheduling ten tasks
at once. The run was the busy machine. `scripts/gates.mjs` now budgets the total — turbo's
`--concurrency` and vitest's `VITEST_MAX_FORKS`, both from `availableParallelism()`. After: 16
processes, load 60, nine of nine packages passing, and the run **faster** (1m26s to 1m03s).

**The trap on the way was worth the twenty minutes it took to notice.** `turbo.json` declares
`globalPassThroughEnv`, and declaring one puts turbo in strict environment mode: a task sees only
the names on that list. `VITEST_MAX_FORKS` set in `gates.mjs` and not declared there would have
been filtered out one process later, and the gate would have printed a number it was not
achieving — this epic's own §4.1 defect, in the tool that checks for defects. It is declared, and
the gate prints what it chose so the claim can be checked against `ps`.

One suite was changed and it is not a concession: `canvas.test.ts`'s rebalance makes ~440 real
round trips to Postgres, so vitest's 5,000 ms default was measuring the database's latency rather
than the rebalance. Its own budget is 60 s, which still fails a rebalance that never fires.

`pnpm mirror-dry-run` passed, which was the structural risk of this epic: the Python suite reads
`packages/core`'s frozen fixtures, `packages/sdk-ts`'s source and `packages/cli`'s golden by relative
path, and all three survive the public-only filter. **274 tests passed inside the filtered tree.**
That is EPIC-053's "Local green is not CI green" failure #1 checked deliberately rather than met
later.

---

## Open questions

1. The generated `prompts.py` does not tell a reader how to be warm. A one-line header comment
   naming `configure(bundled=…)` would do it, at the cost of a golden update in
   `packages/core/src/codegen` — deliberately out of scope here, worth a ruling before EPIC-056
   publishes the file.
2. PyPI trusted publishing is skipped, not built: it needs EPIC-006 (deferred) and EPIC-056 (not
   reachable). Report §8.
3. `▣ GATE 3`'s status cell.

---

## The verification tail

`node scripts/gates.mjs ci` on `af8a1ec`, the commit that is merged — **16 of 16 steps, exit 0,
13m20s**. Four runs were needed and the report's section 7 says why each of the first three was red.

```
  16 step(s), all passed, 13m20s wall

  What a green here still does not cover
    - The runner is Linux and this is darwin: the four visual-regression baselines are
      `-linux.png` and their specs skip here.
    - The runner is slower than this machine.
```

Locally, every package reporting: `test` 9 of 9, `typecheck` 9 of 9, `lint` 12 of 12.
`sdks/python`: 274 pytest cases, and 274 again inside the mirror dry run's filtered tree.

---

## For the next session

**EPIC-057 is next** — the SDK threat model — and it is buildable except its one external review
hour, which needs a person. **This epic hands it two findings already written down**: `urllib`
forwarding `Authorization` across a cross-origin redirect (fixed here, and the class of thing its
"key theft" row is about), and the unbounded response read, which is capped here at 16 MiB and is
the "DoS on pointer endpoint" row seen from the client side.

**EPIC-056 is not reachable.** `docs/decisions/GATE-5.md` has the table; a run that reaches it writes
a `BLOCKER`.
