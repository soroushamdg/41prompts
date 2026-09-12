<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# EPIC-009 session log

Date: 2026-09-12 · Branch `epic/009-actions-budget`

## Prompt sent

Option 3, decided: staging images build on the box again, production keeps pulling a prebuilt image
from a `v*` tag, CI stays on GitHub. Commit the epic as-is, add it to Stage 0 in the backlog and
roadmap as a late entry, mirror `CURRENT.md`, plan, implement. With four instructions attached:

- CI cannot run, so this PR merges without a green tick — run every gate locally and paste the output
  in the report as the evidence CI would have given, and say plainly in the PR description that no CI
  ran and why.
- **Measure rather than estimate.** Real minutes per merge and per tag into `infra/RUNBOOK.md`.
- The Coolify half is Soroush's: one checklist, exact clicks, at the end.
- EPIC-021b's PR stays open and unmerged. Do not merge it past a gate that never ran.

## What the measurement changed

Measuring first was the right order, because the numbers changed what the epic could claim.

The run list only covers **8.4 days** — the repository's whole life — not the month the instruction
assumed, which is worth stating rather than quietly reporting a "monthly" figure from nine days.
Billed minutes are also **not** the wall clock the run list shows: Actions bills the sum of each
*job*, rounded up, so a three-job workflow finishing in 4 minutes can bill 7. That needed the jobs
API and a sample per workflow.

The result: **2,175 billed minutes in 8.4 days against a 2,000-minute month**, and removing the image
build from `main` saves **480 — 22%.** Real, and **not a fix**: at ~21.3 minutes a change the
allowance sustains 94 changes a month against an observed 291, so the project stays roughly **3×
over**. Written into the report and the runbook as the headline rather than buried under the saving,
because a 22% improvement presented on its own would read as solved.

The largest remaining item turned out to be **CI running twice per change — 51% of everything spent.**
Named as a finding, not built: decision 4 keeps CI, and the caveat that stops it being an obvious win
is that after a squash merge the tree matches the PR's only when `main` has not moved, which at nine
merges a day it often has.

## The one check that could have stopped the revert

Reverting staging to an on-box build could have undone what EPIC-008 fixed. Checked before touching
anything: `/healthz` already falls back to `SOURCE_COMMIT`, which Coolify sets on the container at
deploy time, so the commit still reports correctly — **provided** no `${VAR}` appears in a
`build.args` block, which is the EPIC-001 F2 trap the staging compose file already warned about. The
restored build blocks carry no `args:` at all, and a leftover locked variable is step 4 of the
checklist. No blocker.

## Decisions

1. **`build:` restored in `infra/docker-compose.staging.yml`** rather than pointing Coolify at
   `infra/docker-compose.yml`. One file per environment is the existing shape, and the alternative
   would have left two files describing staging with one of them stale.
2. **`workflow_dispatch` added**, which keeps the `:staging` branch of the tag computation reachable
   as an escape hatch. Noted in the file so it does not read as dead code somebody tidies away.
3. **The workflow header carries the numbers**, not just the rule. "Do not add `branches: [main]`
   back" is easy to override; "it cost 480 of the 2,175 minutes that stopped every deploy" is not.

## Verification

No CI ran; every gate run locally and pasted into the report §6. `pnpm test` 8/8, `typecheck` 8/8,
`lint` 456 files clean, forbidden-word grep clean, compliance and mirror dry-run OK, no binary source
file. A local run is not a green tick and the PR says so.

## Open

Three criteria are unticked because they need a deploy and a Coolify change, both of which are
blocked or Soroush's: a merge producing no image build, a tag still deploying production, and the
on-box build's timing with the apex staying up. The checklist in report §7 is the whole of his half.

EPIC-021b's PR (#61) is open and deliberately unmerged.
