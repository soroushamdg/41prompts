<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# EPIC-009 report — Actions budget

Date: 2026-09-12 · Branch `epic/009-actions-budget`

---

## 1. Measured, not estimated

389 runs, **2026-09-04 to 2026-09-12 — the repository's entire life, 8.4 days.** Billed minutes are
the sum of each *job*, rounded up per job, not the workflow's wall clock; job durations came from the
jobs API over a 12-run sample per workflow. The runbook carries the commands to reproduce it.

| workflow | trigger | runs | billed/run | billed total |
|---|---|---:|---:|---:|
| CI | pull_request | 84 | 6.67 | 560 |
| CI | push | 82 | 6.67 | 547 |
| **Build images** | **push** | **81** | **6.58** | **533** |
| Compliance | pull_request | 72 | 4.00 | 288 |
| Compliance | push | 59 | 4.00 | 236 |
| Release / Rollback | | 11 | ~1 | 11 |
| | | | **total** | **2,175** |

**2,175 billed minutes in 8.4 days against a 2,000-minute month.** Of the 81 image builds, **73 came
from merges to `main`** and 8 from tags.

### Before and after

| | billed minutes |
|---|---:|
| a merge to `main`, before | **17.25** |
| a merge to `main`, after | **10.67** |
| a `v*` tag | **~10.6** |
| one change end to end, after (PR run + merge run) | **~21.3** |

Removing the image build from `main` saves **480 minutes over that window — 22% of the burn.**

## 2. The number that matters, and it is not 22%

**This epic does not bring the burn under the allowance, and the report says so rather than letting a
22% saving read as a solution.**

At ~21.3 billed minutes a change, 2,000 minutes sustains **94 changes a month**. The observed rate
over the measured window was **9.7 merges a day — about 291 a month.**

**So the project remains roughly 3× over its allowance after this epic.** That is not a flaw in the
decisions; it is the epic's own diagnosis being right. The images were never the root cause. A
per-merge cost multiplied by an unbudgeted merge rate is, and **the merge rate is the dominant
term.**

### Where the next 500 minutes are

**CI runs twice per change** — once on the pull request, once again on the merge to `main` — which is
1,107 of the 2,175 minutes, **51% of everything spent.** That is now the largest single item by a
wide margin.

**Ruled 2026-09-12: we are not taking it**, and that is now a decision in `docs/PROCESS.md` rather
than an observation somebody re-proposes as free money. After a squash merge the merged tree is
identical to the PR's **only when `main` has not moved in between**, and at the merge rate that
produced this problem it usually has — so the second run is testing a tree no run has tested, which
is the one thing CI is for.

There is a version worth building later: skip the merge run only when the merged tree hashes
identically to the tested one. That is a real epic with a real measurement, not a trigger deletion.

The cheaper lever is the other new rule — one PR per epic, rulings batched — because **a change that
does not happen costs nothing to test.**

## 3. The one thing that could have blocked the revert

Reverting staging to an on-box build risks undoing what EPIC-008 fixed. The specific risk is
`/healthz`'s `commit`, which EPIC-008 bakes in from `github.sha` at build time.

**It survives**, and `apps/web/app/healthz/route.ts` already documents why: it prefers `COMMIT_SHA`
only when that is not the literal `"unknown"`, and otherwise falls back to `SOURCE_COMMIT`, **which
Coolify sets directly on the running container at deploy time**. An on-box build reports the right
commit through the second path.

**With one condition**, which is the EPIC-001 F2 trap: no `${VAR}` may appear inside a `build.args`
block, because Coolify turns any such interpolation into a permanently locked application variable
that overrides the real build arg for ever. The restored `build:` blocks therefore carry **no `args:`
at all**, and checking for a leftover locked `SOURCE_COMMIT` is step 4 of Soroush's checklist.

No blocker.

## 4. What changed

| file | change |
|---|---|
| `.github/workflows/build-images.yml` | `push: branches: [main]` removed; `tags: ["v*"]` kept; `workflow_dispatch` added. Header says why, with the numbers, so nobody restores it as an improvement. |
| `infra/docker-compose.staging.yml` | `build:` restored for `web` and `worker`, **no `args:`**; `image:`/`pull_policy:` removed. It says at the top that it is the one file describing how staging is built. |
| `docs/PROCESS.md` | tags are releases, naming the three things that do not warrant one. |
| `infra/RUNBOOK.md` | the budget section: where to read usage, how to reproduce the measurement, the numbers above, and **when to look — the close of every epic.** |
| `docs/backlog.md`, `docs/roadmap.md` | EPIC-009 as a late Stage 0 entry with the reason; EPIC-008's row marked `done — staging half reverted by EPIC-009`. |

`workflow_dispatch` keeps the `:staging` branch of the tag computation reachable, so a staging image
can still be pushed by hand if the box build is ever the wrong tool. Deliberate, and noted in the
file rather than left looking like dead code.

## 5. Acceptance criteria

- [ ] **A merge to `main` triggers CI and compliance but no image build; staging updates via
      Coolify's own build.** **Cannot be verified from here** — Actions cannot start a job, so no
      merge produces a run to show, and Coolify's side is step 2 of §7. Unticked rather than ticked
      on the intention.
- [ ] **A `v*` tag still builds and deploys production.** Same reason. The workflow change is a
      trigger removal that leaves the tag path untouched, but "untouched" is not evidence.
- [ ] **Staging's on-box build completes in under ten minutes without taking the apex `/healthz`
      down.** Needs the Coolify change first; it is step 5 of §7, with the poll to run during it.
- [x] **`PROCESS.md` states that tags are releases and names the three things that do not warrant
      one.** A ruling, a copy fix, a fix-up epic.
- [x] **`infra/RUNBOOK.md` has the budget section with measured minutes before and after, and says
      to check at the close of every epic.**
- [x] **One file describes how staging is built, and a stale one is not left to mislead.**
      `infra/docker-compose.staging.yml` says so in its first line; the stale claim that Coolify
      never builds anything is gone from both it and the workflow header.
- [x] **`pnpm test`, `typecheck`, `lint`, `compliance`, `binary-files` clean.** §6.
- [x] **Report and session log written; backlog updated.**

## 6. Verification — no CI ran, and this is what stands in for it

**No CI ran on this branch.** GitHub Actions refuses to start any job on this account:

```
X The job was not started because recent account payments have failed or your spending
  limit needs to be increased. Please check the 'Billing & plans' section in your settings
```

That is the condition this epic exists to address, so it cannot verify itself in the usual way. Every
gate was run locally instead. **A local run is not a green tick** — it is the same commands on one
machine, without the clean-checkout guarantee CI gives — and the PR description says so plainly
rather than implying the gates passed in the place they normally pass.

```
=== pnpm test ===
 Tasks:    8 successful, 8 total        (core 475, web 219, db 58, ui 91, worker 57, logger 11, sdk 2, cli 1)

=== pnpm typecheck ===
 Tasks:    8 successful, 8 total

=== pnpm lint ===
Checked 456 files in 8 packages, no issues found
Forbidden-word grep clean (packages/ui/src, apps/web/app, apps/web/lib).

=== pnpm compliance ===
2 passed in 0.01s
[mirror-dry-run] OK -- the public-only tree installs and tests standalone

=== pnpm binary-files ===
No tracked source file under packages, apps is binary (433 checked).
```

`pnpm e2e` is not in this epic's criteria and nothing here touches the app, but it was run on this
tree as part of EPIC-021b's branch: **142 passed.**

## 7. Three rules this epic put into PROCESS.md

1. **Tags are releases, not checkpoints** — naming a ruling, a copy fix and a fix-up epic as the three
   things that do not warrant one.
2. **One PR per epic; a separate PR needs a reason, and "the advisor ruled" is not one.** This is the
   one that addresses the dominant term. 291 changes in 8.4 days happened because each ruling became
   its own branch, PR run and merge run — about 21 billed minutes for what was often a single line.
   Exceptions kept for things that must ship or revert alone: a measurement defect, a security fix,
   or a change needing independent revert.
3. **The question is whether the gate would have told you something, not whether it ran.** Written
   because two PRs resolved opposite ways the same afternoon: this one merged un-CI'd because CI
   checks nothing it touches, and EPIC-021b stayed open because CI checks precisely what it touches.

## 8. Soroush's half — the Coolify checklist

Everything below is in the Coolify UI at `COOLIFY_URL`, on the **staging** application inside the
`41prompts` project. **Do not do this on production** — production is unchanged by this epic and must
keep pulling its prebuilt image.

1. **Staging application → Configuration → General.** Change the **Build Pack** from
   *Docker Compose (prebuilt image)* back to **Docker Compose**, with the compose file path
   `infra/docker-compose.staging.yml` and the base directory `/` (the repo root — the same setting
   `infra/README.md` step 8 describes, and the reason `--project-directory .` matters locally).

2. **Same page → Build.** Turn **auto-deploy on push to `main`** back **on**. That is what replaces
   the webhook Actions used to call, and it is what makes a merge reach staging with no Actions
   minutes at all.

3. **Configuration → Source.** Confirm the branch is `main` and the repository is
   `soroushamdg/41prompts`. It is already connected for reading the compose file, so this is a check,
   not a change.

4. **Configuration → Environment Variables. The one that bites.** Look for a variable named
   **`SOURCE_COMMIT`** or **`COMMIT_SHA`**. If either exists, **delete it.** This is the EPIC-001 F2
   defect: a locked variable left over from before EPIC-008 will override the value Coolify sets on
   the container at deploy time, and `/healthz` will report `unknown` for ever. `infra/README.md`
   step 10 has the longer diagnosis. If neither exists, nothing to do.

5. **Deploy once by hand, and watch two things.** Press **Deploy** and keep this running in another
   terminal for the duration:

   ```sh
   while true; do
     printf '%s ' "$(date +%H:%M:%S)"
     curl -s --max-time 5 https://staging.41prompts.ai/healthz || echo "(no answer)"
     echo; sleep 5
   done
   ```

   Two things to check, which are the epic's third criterion: the build finishes in **under ten
   minutes**, and the apex keeps answering **throughout** — `staging.41prompts.ai/healthz` should
   never print `(no answer)`, because the apex is served by the same container being replaced and a
   gap there is the thing worth knowing about.

6. **Afterwards**, confirm `curl -s https://staging.41prompts.ai/healthz` reports the commit you
   merged, not `unknown`. If it says `unknown`, step 4 was the problem and the variable is still
   there.

**Tell me the result and I will tick criteria 1 and 3 and mark the epic done.** If the build is slow
or the apex drops, that is a finding rather than a failure of the plan — say what happened and it
goes in the report.
