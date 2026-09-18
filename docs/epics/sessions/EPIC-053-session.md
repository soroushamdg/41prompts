<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: Apache-2.0
-->

# EPIC-053 — session log

**2026-09-17.** One session, hand-started by Soroush with `prompt_continue`. Claude Code in both
chairs: it wrote the epic file as well as building it, per `docs/PROCESS.md`'s 2026-09-15 amendment.

## The prompt

> read the file prompt_continue and run it

`prompt_continue` is the standing instruction: read `CLAUDE.md`, `docs/PROCESS.md`,
`docs/AUTONOMOUS.md`, `CURRENT.md`, the backlog and the decisions ledger; work out where the project
actually is from git rather than from any of them; then pick up the next epic and build it.

## What happened before EPIC-053 started

The session did not begin on an epic. `docs/epics/CURRENT.md` was EPIC-055, which was finished and
merged, and the next backlog row was **`▣ GATE 5`** — a full stop and Soroush's decision.

So the loop stopped, as it is supposed to, and wrote what the gate requires into the log:

- **`docs/epics/GATE-5-readiness.md`**, on GATE 3's precedent. Three readings, none chosen.
- **`docs/epics/RELEASE-DUE.md`** regenerated — it had been written at `f3fa8a2` and was stale.
- Two decisions logged in `docs/decisions/AUTONOMOUS.md`.

**Soroush answered in session: the technical reading, go.** `docs/decisions/GATE-5.md` records it,
written down from his ruling rather than made here, exactly as `GATE-3.md` was. Stage 5b opened and
EPIC-053 is its first epic — the one behind the gate that needs nothing from anybody else.

## The plan, and where it held

`docs/epics/plan-EPIC-053.md` set the order: the generator move first (riskiest), then Python, then
the CLI's plumbing, then `decompile` (no network, so it proves the binary on its own), then the rest.

That order held. The move being first mattered: everything else reads the generator, and doing it
while nothing depended on it meant the byte-identity probe was a ten-minute job rather than an
archaeology exercise.

**The one thing the plan got wrong** was assuming `packages/cli` was a sensible home for the two
repo-level tests. It is not — see below.

## Nine rulings

All in `docs/decisions/AUTONOMOUS.md` and summarised in the report §3. The two that took the longest:

- **Ruling 1**, moving the generator into core rather than copying it. The argument was quick; the
  work was proving the move changed nothing, which is §4.1 of the report.
- **Ruling 4**, `41p run` not calling a model. This is a narrowing of the roadmap's word and it was
  worth being sure: `/v1` has four routes and none of them runs anything, a public run endpoint is a
  real epic, and putting provider traffic in a public zero-dependency package contradicts the stack.
  Reported as a narrowing rather than delivered as though it were what was asked for.

## What took longer than expected

**The gates, by a distance.** The code was written in roughly a third of the session; the rest was
`node scripts/gates.mjs ci` failing five times, each for a different reason, and each reason real:

1. `packages/core`'s reviewed-regex list — eight new literals needed arguing, which is that gate
   working as designed.
2. `version.test.ts` asserting a literal `"0.0.1"`.
3. A test shelling out to `pnpm build` mid-turbo-run, which took out two other packages in two
   different runs and looked like flakiness both times.
4. Two tests reading `scripts/`, invisible outside the mirror dry run.
5. A hand-built `env` failing `apps/web`'s augmented `ProcessEnv`, which failed typecheck *and* e2e.

**And then a sixth that was not mine**, and is the most valuable thing the session produced: project
ids collide and nothing drew again. Report §6.

**Four of the six presented as something other than what they were.** (3) looked like flaky tests.
(4) looked like a green build. (5) looked like two unrelated failures. (6) looked like an
intermittent e2e problem on a different test every run. The one that mattered was found by reading
the *server* log rather than the test output — `docs/PROCESS.md`'s rule about probing the thing.

## Decisions taken without asking, and why each was safe

Every one is in `docs/decisions/AUTONOMOUS.md`. The two that most deserve Soroush's attention:

- **The project-id retry** is a change to `packages/db` and to two `apps/web` call sites, made inside
  an epic about a CLI. Batched here under `PROCESS.md`'s "One PR per epic" because it is none of the
  three reasons that justify a separate change — and because it was blocking this epic's gate.
  **Widening the id was deliberately not done**: that is `CLAUDE.md`'s naming rule and his.
- **The generated file's header changed**, which changes what EPIC-055's Connect page shows. Ruling 9
  says why; the e2e assertion that pinned the old wording was updated in the same commit rather than
  deleted, so both halves are still asserted.

## The tail of the verification output

`node scripts/gates.mjs ci` on `e138196` — 16 steps, all passed, 9m46s. Full table in the report §9.

The drive: **22 of 22**, against the built app and the packed binary.

```
PASS  41p check exits 1 and names what moved — exit 1 — "Refund classifier (pr_ade9f0c7): your lockfile has v1, Live is v2"
PASS  and exits 2, not 1, when it cannot answer at all — stale → 1, no key → 2
PASS  the generated file compiles under strict in a fresh project — tsc --strict, skipLibCheck off
PASS  41p decompile works with no key and no configuration — exit 1 (findings present)
```

## Open questions

Report §11. The two that change what gets built next:

1. **Should `41p run` call a model?** If yes, it needs a `/v1` run endpoint with quota and rate
   limiting, and that is an epic rather than a task.
2. **`proj_` + 4 hex.** The retry makes it safe; the id is still short enough that a busy account
   makes the retry fire routinely.

## What is next

**EPIC-054**, the Python SDK. It needs nothing new from Soroush until its PyPI step, which is
EPIC-006 and `deferred`. The codegen this epic built already writes `prompts.py`, and
`sdks/python/fortyone/__init__.py` is still EPIC-000's stub — so EPIC-054 is the runtime under a file
that already exists and is already type-checked.

**EPIC-056 is not reachable.** `docs/decisions/GATE-5.md` says why: it needs the GitHub org
(EPIC-006, deferred), npm and PyPI trusted publishing (same), and an IP assignment to a legal entity
that does not yet exist (EPIC-071, deferred). A run that reaches it writes a `BLOCKER`.

**A release is now nine epics overdue** and `RELEASE-DUE.md` was regenerated this session at
`217c945`; it is stale again by nine commits. Production is at `v0.5.0`, 2026-09-12.
