<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# Plan — EPIC-009: Actions budget

---

## 0. Measured first, because the numbers change what this epic can claim

The epic says measure rather than estimate, so that came before the plan. **389 runs, 2026-09-04 to
2026-09-12 — the repository's whole life, 8.4 days.** Billed minutes are the sum of each *job*,
rounded up per job, not the workflow's wall clock; job durations came from the jobs API over a
12-run sample per workflow.

| workflow | trigger | runs | billed/run | billed total |
|---|---|---:|---:|---:|
| CI | pull_request | 84 | 6.67 | 560 |
| CI | push | 82 | 6.67 | 547 |
| **Build images** | **push** | **81** | **6.58** | **533** |
| Compliance | pull_request | 72 | 4.00 | 288 |
| Compliance | push | 59 | 4.00 | 236 |
| Release / Rollback | | 11 | ~1 | 11 |
| | | | **total** | **2,175** |

**2,175 billed minutes in 8.4 days**, against a 2,000-minute monthly allowance. The allowance was
gone in roughly a week.

### What this epic actually saves — and what it does not

Of the 81 image builds, **73 were triggered by a merge to `main`** and 8 by a tag. Removing the
former saves **480 minutes — 22% of the burn.**

That is real, and it is **not enough on its own, which the report must say plainly**:

- After this epic, one change costs ~21.3 billed minutes: CI + Compliance on the PR, then again on
  the merge.
- 2,000 ÷ 21.3 = **94 changes a month** sustainable.
- The observed rate is **9.7 merges a day ≈ 291 a month.**

So the fix leaves the project roughly **3× over its allowance**. The epic's own diagnosis is the
right one — a per-merge cost times an unbudgeted merge rate — and the merge rate is the dominant
term, not the images. The report states this rather than letting a 22% saving read as a solution.

**The largest single remaining item is CI running twice per change** (1,107 of 2,175 minutes, 51%):
once on the PR, once on the merge. Named as a finding with its caveat — after a squash merge the
tree is only identical to the PR's when `main` has not moved — and **not built**, because decision 4
keeps CI and this is a scheduling question that deserves its own epic.

## 1. The one thing that could have blocked this, checked first

Reverting staging to an on-box build risks breaking what EPIC-008 fixed. The specific risk is
`/healthz`'s `commit`, which EPIC-008 bakes in from `github.sha`.

**It survives**, and `apps/web/app/healthz/route.ts` already says why: `COMMIT_SHA` is preferred only
when it is not the literal `"unknown"`, and it otherwise falls back to `SOURCE_COMMIT`, **which
Coolify sets directly on the running container at deploy time**. An on-box build reports the right
commit through the second path.

**With one condition**, and it is the EPIC-001 F2 trap the staging compose file already warns about:
no `${VAR}` may appear inside a `build.args` block, because Coolify turns any such interpolation into
a permanently locked application variable that then overrides the real build arg for ever. So the
restored `build:` blocks carry **no `args:` at all**, and Soroush's checklist includes confirming no
locked `SOURCE_COMMIT` variable exists.

No blocker.

## 2. Changes

| file | change |
|---|---|
| `.github/workflows/build-images.yml` | drop `branches: [main]`; keep `tags: ["v*"]`; add `workflow_dispatch` as the escape hatch. Header says why, so nobody restores it as an improvement. |
| `infra/docker-compose.staging.yml` | `build:` back for `web` and `worker`, **no `args:`**; `image:`/`pull_policy:` removed. One file describes staging and says so. |
| `docs/PROCESS.md` | tags are releases; name the three things that do not warrant one. |
| `infra/RUNBOOK.md` | the budget section with the measured numbers above, where to read usage, and *when* to look — the close of every epic. |
| `docs/backlog.md`, `docs/roadmap.md` | EPIC-009 into Stage 0 as a late entry, with the reason. |

`workflow_dispatch` keeps the `:staging` tag branch of the tag computation reachable, so a staging
image can still be pushed by hand if the box build is ever the wrong tool. Dead code otherwise, and
noted as deliberate.

## 3. Verification, given CI cannot run

Every gate locally, with the output pasted into the report as the evidence CI would have produced.
The PR description says plainly that **no CI ran and why** — a local run is not a green tick and must
not be presented as one.

Two acceptance criteria cannot be met from here at all, because they need a deploy to happen:

- a merge to `main` triggering no image build, with staging updating via Coolify's own build;
- a `v*` tag still building and deploying production.

They stay **unticked** with the reason, in the shape EPIC-021a used for its staging hand-drive. The
Coolify half is Soroush's, batched into one checklist with exact clicks at the end of the report.
