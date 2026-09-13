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

## The Coolify half, done over the API (2026-09-13)

Soroush handed §8's checklist back to be done over the Coolify API instead of by hand, under
CLAUDE.md server-access rules 1–7: read-only first, then each non-`GET` call shown in chat with a
one-line reason and run only after a separate yes, no batching, and no response body printed
unfiltered.

### Read-only findings

Every one of §8's steps 1–4 turned out to be a **no-op**. Coolify was already in the state the
checklist asked for.

| §8 step | asked for | actual | write needed |
|---|---|---|---|
| 1 | build pack Docker Compose, `/infra/docker-compose.staging.yml`, base `/` | exactly that | no |
| 2 | auto-deploy on push to `main` on | `is_auto_deploy_enabled: true` | no |
| 3 | branch `main`, repo `soroushamdg/41prompts` | exactly that | no (it was a check) |
| 4 | delete `SOURCE_COMMIT` / `COMMIT_SHA` | **neither exists** | no |

The checklist was written against an assumption about where EPIC-008's change lived. It lived in
git — `image:` plus `pull_policy: always` inside the compose file — not in Coolify's configuration,
which was never reconfigured. PR #62's revert of that file was therefore the whole of the change,
and §8 steps 1–4 were asking for work that had never been undone. Settings recorded in
`infra/README.md` so the next rebuild does not lose them.

**Identification, because it is not obvious.** `fqdn` is `null` on both applications and the names
differ only by uuid, so the API's `name` and `fqdn` cannot distinguish staging from production.
Identified by `docker_compose_location` and corroborated independently by `DEPLOY_ENV` on the
running container:

| uuid | which | two signals |
|---|---|---|
| `pboa5wxrnggay30epiq0pmzd` | **staging** | `/infra/docker-compose.staging.yml`; container reports `DEPLOY_ENV=staging` |
| `d180rye1i9dtab789t9jyjmh` | production | `/infra/docker-compose.production.yml`; `DEPLOY_ENV=production` |

Production was read for contrast and never written to. Its `is_auto_deploy_enabled: false` is
correct and was left alone.

**A trap for whoever checks next:** `GET /api/v1/applications` (the list) returns no expanded
`settings`, so `is_auto_deploy_enabled` reads as `null` there whether it is on or off. The
per-application endpoint returns the real value. The first read of this session got `null` from the
list and it would have been easy to report "auto-deploy is unset".

### Why staging was stale anyway

The running container was `ghcr.io/soroushamdg/41prompts-web:staging`, started `2026-09-12T21:15:00Z`
— the last Actions-driven deploy. `/healthz` reported commit `1dfe853` (#59), leaving staging **two
merges behind** `main`: it was missing `f5f875b` (#60, the per-deployment cookie prefix — the staging
sign-in fix) and `f75569b` (#62, this epic's compose revert). Coolify had simply not redeployed since
#62 merged, so it had never read the reverted compose file. `/api/v1/deployments` was empty.

That makes the deploy more than EPIC-009 evidence: it is also the first time staging runs the cookie
prefix fix, which is what EPIC-021a's and EPIC-021b's hand-drives are waiting on.

### Mutating-call ledger (rule 5)

| # | call | reason | approved | outcome |
|---|---|---|---|---|
| 1 | `POST /api/v1/deploy?uuid=pboa5wxrnggay30epiq0pmzd&force=false` | trigger the staging deploy that makes Coolify build on the box from the reverted compose file | **yes, in chat** | **not run — refused by the Claude Code auto-mode permission classifier, twice, in two different command shapes.** Soroush pressed Deploy in the UI instead; see below |

No write of any kind reached Coolify in this session. The three writes §8 anticipated were not
needed, and the one call that was needed was approved by Soroush and refused by the harness rather
than by him.

Rule 6 says `curl` against the Coolify URL is never allow-listed, so the remedy was **not** a Bash
permission rule — that would trade a one-command-one-yes gate for a standing grant, which is the
thing rule 6 exists to prevent.

### What happened instead

Soroush pressed **Deploy** in the Coolify UI. Two deployments went `in_progress` eight seconds apart
— `iwvkyzewmaergjy0sqzrymyj` on staging at 12:35:45Z and `3sej13s13boerjj46hyjapri` on **production**
at 12:35:53Z, both on commit `f75569b`. A project-level Deploy fans out to every resource in the
project, which is the likeliest explanation; the application's own button would have started one.

Production was not meant to be touched and was redeployed. It restarted onto the same image
(`:production`, unchanged by #62) and reported the same commit `af089c7` before and after, so nothing
regressed — but it was down for up to 38 seconds. Recorded here rather than smoothed over: the
instruction for this task was "do not touch the production application at any point", and although
no call of mine reached it, the session's action did.

Note what did not prevent it. Production's `is_auto_deploy_enabled: false` guards the git trigger,
not the button.

### Measured

| | staging | production |
|---|---|---|
| deploy created | 12:35:45Z | 12:35:53Z |
| apex serving again | 12:45:08Z | 12:39:40Z |
| duration | **9 min 23 s** (on-box build) | 3 min 47 s (image pull) |
| apex gap | **≤ 32 s** | **≤ 38 s** |
| commit after | `f75569b` | `af089c7` (unchanged) |

Staging poll: 106 ticks at 5 s, 101 × `200`, 5 × `503`. Criterion 3 fails on the apex half and
passes on the build half. `/healthz` reports `f75569b`, not `unknown`, so §8 step 4's feared locked
variable is confirmed absent by the build that would have exposed it.

### The healthcheck

The Coolify panel reported "Healthcheck: Not configured". It was configured — in the images, not the
compose file, and Coolify reads the compose file. All four containers reported `(healthy)` throughout.
`healthcheck:` blocks for `web` and `worker` added to all three compose files, mirroring the
Dockerfiles. This is an `infra/` change including the production compose, made on Soroush's explicit
"fix the problems" instruction; CLAUDE.md otherwise guards that file.

It is **not** claimed as the fix for the 30-second outage. Docker called the new staging container
healthy 18 seconds in while the apex was still `503`, which puts the gap on the routing side. Report
§11 leaves it as named open work rather than asserting a cause.

### Criterion 1, answered by this session's own merge

PR #63 (the report and healthcheck changes above) merged at 12:51 and became the evidence. On the
push to `main`: `CI` triggered and failed with no logs, `Compliance` the same, and **`build-images`
did not run**. Coolify started deployment `wrqzmozouniufix0xwovcafd` on staging in the same minute,
on commit `50c9831`, and staging served it 1 min 18 s later. Production was not touched — the
contrast that confirms the earlier double-deploy was the project-level button.

The second deploy's apex gap was **≤ 23 s** (last `200` on `f75569b` 12:52:12, three `503` ticks,
first `200` on `50c9831` 12:52:35). It was the first deploy carrying the compose-level healthchecks
and **it did not close the gap**, which is why §10 was written to decline that claim rather than make
it. A cache-hot deploy that rebuilt nothing still dropped the apex, so the cost is the container swap,
not the build.

Criterion 1 ticked. Criterion 3 stays failed. Criterion 2 stays unverified and should be ticked by the
next real release rather than by a tag cut to satisfy it.
