<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# Session · EPIC-032 · web: inputs, run, results, attribution

Date: 2026-09-15 · Branch `epic/032-runs-web`

## Prompt sent

Not the usual one. Soroush described a change to how the project is run — no advisor round trip, no
pushes to GitHub, human-only rows skipped — asked for the docs to be updated to match, asked where
the work should resume, and confirmed four choices before any code was written:

1. finish EPIC-032 from the working tree the stopped run left, rather than restarting it;
2. move the browser-drive Definition-of-Done item onto the locally built app;
3. merge finished epics into local `main` with `--no-ff`, and never push;
4. amend `CLAUDE.md`, `PROCESS.md`, `AUTONOMOUS.md` and `run-state.mjs` in place.

## Plan summary

The plan was already on disk (`docs/epics/plan-EPIC-032.md`), written by the run that was stopped.
It was read and followed rather than rewritten; §2 of the report lists what it had actually
delivered against what it claimed, which is the part a plan cannot tell you.

Order of work: process docs first (so nothing downstream followed the old rules) → lint → e2e until
green → the built-app drive → `gates.mjs ci` → report → merge.

## Decisions inside the epic's latitude

Each is one line in `docs/decisions/AUTONOMOUS.md` where it is a process decision; the code ones are
here.

- **`queue_unavailable` as a fifth `RefusalReason`.** Not asked for. `startRunAction` was recording
  an enqueue failure as `provider_not_configured`, which sends a person to set a key that may well
  already be set. The epic's own premise is that a refusal names its actual reason, so this is that
  premise applied one case further rather than new scope.
- **`E2E_RATE_LIMIT_OFF` rather than a slower suite.** The alternative was to space the tests out,
  which buys the flakiness back in a different currency, or to stop asserting anything that needs a
  signed-in browser, which is most of it. Copied the `FAKE_PROVIDER` three-guard shape deliberately
  so there is one pattern for "test-only path in production code" rather than two.
- **The run detail heading names the input set.** Every run read `Run`. Small, and on the one page
  whose argument is that it says honestly what happened.
- **`scripts/drive-epic-032.mjs` is committed.** A drive whose steps live in one session's
  scrollback is a claim about the past. This one regenerates its own screenshots.

## Two things that cost real time, both worth recording

**1. `execFileSync` never returns from a backgrounded process.** The drive script started the worker
with `nohup … & echo $!` inside `execFileSync`. It hung for ten minutes, twice, before the hypothesis
was tested in isolation instead of reasoned about. `execFileSync` waits for the stdout pipe to close
and a background child never closes it. `apps/web/e2e/worker-process.ts` had already solved this
correctly with `spawn` + `detached`; the drive should have copied it from the start.

**The general form, which is the same one `PROCESS.md` already records twice**: a run with no output
teaches nothing. Both hangs were invisible because the command was piped through `tail`, so nothing
printed until the process ended — and it never ended. The second attempt added a default timeout and
a failure handler that prints the URL and what was on screen; that is what should exist before the
first run, not after the second hang.

**2. A symptom that looked like a product bug twice, and was not either time.** The results spec
failed with `provider_not_configured` — a product-shaped error message. It was a leaked worker from
a previous run claiming the job. Then it failed at sign-in with a valid token — an auth-shaped
failure. It was a rate limit returning 429 on the verify endpoint.

`PROCESS.md`'s "'Environmental' is a hypothesis, not a finding" is the rule, and the thing that
actually settled both was **probing the endpoint directly** (request 101 is the first 429; request
16 is the first on the magic-link path) and **listing the processes** (seven `tsx/esm src/index.ts`
still alive). Neither took more than a minute once attempted.

## What took longer than expected

The e2e. Five failures in the first full run resolved into four different causes — two test
fixtures, one harness defect, one rate limit — and only one of them was visible from the failure
message. About half the session.

## Verification

```
pnpm test                    8/8            pnpm typecheck    8/8
pnpm lint                    11/11          pnpm e2e          196 passed, 4 skipped
node scripts/gates.mjs ci    16/16 on 1f982fca, 6m40s
node scripts/drive-epic-032.mjs   20/20, 12 screenshots
```

One thing to be accurate about: **an earlier `pnpm test` in this session failed**
`segment.perf.test.ts`'s adversarial tag-cost gate at `input^0.74` against a `<0.5` budget, while
Docker was starting under a parallel turbo run. It passed 5/5 in isolation immediately afterwards
and has passed every full run since, including CI mode. `PROCESS.md`'s "Three timing gates report
rather than enforce" predicted this file would flake this way and left it alone while it passed. It
is still passing, so it was still left alone — recorded here rather than acted on.

## Open questions

In the report, §9. The one worth reading first: a run with **no worker at all** sits `queued` with no
timeout, which is the case next door to the one the epic's refusal criterion names.
