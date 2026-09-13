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

- [x] **A merge to `main` triggers CI and compliance but no image build; staging updates via
      Coolify's own build.** Answered by this report's own merge, §12. `CI` and `Compliance` both
      fired on the push; **`build-images` did not**; Coolify started a staging deployment in the
      same minute and served the merge commit 1 min 18 s later. Production was untouched.
- [ ] **A `v*` tag still builds and deploys production.** Still unticked, and deliberately so. The
      workflow change is a trigger removal that leaves the tag path untouched, but "untouched" is not
      evidence, and the only way to gather the evidence is to cut a tag — which PROCESS.md says is a
      release, not a test. **Unverified, not failed** — carried to the next real release, §13.
- [ ] **Staging's on-box build completes in under ten minutes without taking the apex `/healthz`
      down.** **Fails on the second half.** Build: **9 min 23 s**, inside the budget. Apex: **down
      for up to 32 seconds** during the container swap, `503` on both `staging.41prompts.ai` and
      `app.staging.41prompts.ai`. Production, redeployed by the same press, dropped for up to 38 s.
      A second, cache-hot deploy (§12) dropped for up to 23 s, so the gap is not an artefact of a
      long build. Measured in §9.7 and §12. **Failed, not pending** — carried to EPIC-006b, §13.
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

> **Superseded by §9.** Steps 1–4 below were all no-ops — Coolify was already in the state they ask
> for, because EPIC-008's change lived in the compose file rather than in Coolify's configuration.
> Read §9 first. Step 5's deploy is the only item still outstanding. Kept unedited as the record of
> what was believed before anything read the system.

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

## 9. Applied via API

§8's checklist was handed back to be done over the Coolify API instead of by hand. The result is
short: **there was nothing to apply.** Every setting §8 asked for was already in place. The one call
that actually mattered — the deploy — was approved in chat and then refused by the local permission
harness, so Soroush pressed Deploy in the Coolify UI instead; that press redeployed production as
well as staging (§9.5). Staging now builds on the box and serves the merged commit, in 9 min 23 s,
with a 32-second outage that fails criterion 3 (§9.6, §9.7).

### 9.1 What the reads found

| §8 step | asked for | actual | write made |
|---|---|---|---|
| 1 | build pack Docker Compose, `/infra/docker-compose.staging.yml`, base `/` | exactly that | **none needed** |
| 2 | auto-deploy on push to `main` on | `is_auto_deploy_enabled: true` | **none needed** |
| 3 | branch `main`, repo `soroushamdg/41prompts` | exactly that | it was a check, and it passed |
| 4 | delete `SOURCE_COMMIT` / `COMMIT_SHA` | **neither variable exists** | **none needed** |

The seven fields, read back from `GET /api/v1/applications/<uuid>` and now recorded in
`infra/README.md` so a rebuild of the box does not lose them:

| field | staging | production (read for contrast, never written) |
|---|---|---|
| uuid | `pboa5wxrnggay30epiq0pmzd` | `d180rye1i9dtab789t9jyjmh` |
| `name` | `41prompts:main-pboa5wxrnggay30epiq0pmzd` | `41prompts:main-d180rye1i9dtab789t9jyjmh` |
| `fqdn` | `null` | `null` |
| `build_pack` | `dockercompose` | `dockercompose` |
| `docker_compose_location` | `/infra/docker-compose.staging.yml` | `/infra/docker-compose.production.yml` |
| `base_directory` | `/` | `/` |
| `git_branch` | `main` | `main` |
| `git_repository` | `soroushamdg/41prompts` | `soroushamdg/41prompts` |
| `settings.is_auto_deploy_enabled` | `true` | `false` |

### 9.2 §8 was wrong about where EPIC-008's change lived, and that is the finding

The checklist assumed EPIC-008 had reconfigured Coolify and that EPIC-009 therefore had to
reconfigure it back. It had not. Coolify has **no separate "prebuilt image" build pack for a compose
resource** — both applications have been `build_pack: dockercompose` throughout. Whether the box
builds or pulls is decided *inside the compose file*, by `build:` versus `image:` plus
`pull_policy: always`.

So EPIC-008 changed git, and EPIC-009's PR #62 changed git back. **#62 was the entire configuration
change**, and §8 steps 1–4 were asking for the undoing of something that was never done. That is
worth stating as a general point rather than a local correction: a checklist written from a mental
model of where a change lives is a guess until something reads the system, and this one was four
steps of guess.

### 9.3 Two things the API will mislead you about

**The list endpoint hides the flag.** `GET /api/v1/applications` returns no expanded `settings`, so
`is_auto_deploy_enabled` reads `null` there whether it is on or off. The first read of this session
got exactly that, and reporting "auto-deploy is unset" from it would have been wrong in a way nothing
downstream would have caught. `GET /api/v1/applications/<uuid>` returns the real value.

**`name` and `fqdn` cannot tell the two applications apart.** `fqdn` is `null` on both — the
hostnames come from `SERVICE_FQDN_*` and the compose file's Traefik labels — and the names differ
only by uuid. §8's instruction to identify staging "by name and FQDN" is not executable. Staging was
identified by `docker_compose_location` and corroborated independently by `DEPLOY_ENV=staging` on the
running container, two signals, before anything else was considered.

### 9.4 Why staging is stale, which is a different question from why it was misconfigured

It was not misconfigured. The running container is `ghcr.io/soroushamdg/41prompts-web:staging`,
started `2026-09-12T21:15:00Z` — the last Actions-driven deploy — and `/healthz` reports commit
`1dfe853` (#59). Staging is **two merges behind `main`**:

| missing on staging | what it carries |
|---|---|
| `f5f875b` (#60) | the per-deployment cookie prefix — the staging sign-in fix |
| `f75569b` (#62) | this epic's compose revert |

Coolify has simply not redeployed since #62 merged, so it has never read the reverted compose file.
`/api/v1/deployments` is empty. The deploy is therefore not only this epic's evidence; it is also the
first time staging runs the cookie prefix fix, which is what EPIC-021a's and EPIC-021b's hand-drives
are waiting on.

One thing this does *not* establish: whether a future merge auto-deploys on its own. The flag is on,
but the last deploy came from Actions' webhook, so the flag has never been observed working. A manual
deploy proves the build path. Only the next merge proves the trigger, and criterion 1 should not be
ticked on the flag's value alone.


### 9.5 The deploy: refused by the harness, pressed in the UI, and it took production with it

The approved call was

```sh
curl -s -X POST -H "Authorization: Bearer $COOLIFY_API_TOKEN" \
  "$COOLIFY_URL/api/v1/deploy?uuid=pboa5wxrnggay30epiq0pmzd&force=false"
```

shown in chat with its reason, approved with a yes, and then **refused twice by Claude Code's
auto-mode permission classifier**, in two different command shapes. Adding a Bash permission rule to
get past it was rejected as a remedy: CLAUDE.md server-access rule 6 says `curl` against the Coolify
URL is never allow-listed, precisely so every mutating call costs one explicit yes, and buying our way
past the harness would have defeated the rule in the course of obeying the epic. **No Coolify write of
any kind occurred in this session.**

Soroush pressed **Deploy** in the Coolify UI instead. Two deployments went `in_progress` eight seconds
apart, both on commit `f75569b`:

| deployment | application | created |
|---|---|---|
| `iwvkyzewmaergjy0sqzrymyj` | `…pboa5wxrnggay30epiq0pmzd` — staging, intended | 12:35:45Z |
| `3sej13s13boerjj46hyjapri` | `…d180rye1i9dtab789t9jyjmh` — **production, not intended** | 12:35:53Z |

**Production was redeployed.** Eight seconds apart points at a project-level Deploy, which fans out to
every resource in the project, rather than the staging application's own button. Note what did *not*
save us: production's `is_auto_deploy_enabled: false` is correct and irrelevant here, because this was
a manual press, not a push. The flag guards the git trigger, not the button.

The blast radius was small and it was small by luck rather than design. `infra/docker-compose.production.yml`
is untouched by #62 and pulls `ghcr.io/soroushamdg/41prompts-{web,worker}:production` with
`pull_policy: always`. That tag is the one production was already running, so the pull returned the
identical image and production restarted onto the same code — `/healthz` reported `af089c7` before and
after. Had #62 changed the production compose file the way it changed staging's, the same press would
have rebuilt production on the box.

### 9.6 Measured: the staging build

| moment | time (UTC) | source |
|---|---|---|
| deployment created | 12:35:45 | `GET /api/v1/deployments` |
| `…_worker:f75569b` image built | ~12:37 | `docker images` on the box |
| `…_backup:f75569b` image built | ~12:38 | same |
| `…_web:f75569b` image built | ~12:42 | same |
| new containers up | ~12:44:23 | `docker ps` reported "Up 18 seconds" at 12:44:41 |
| apex serving the new commit | 12:45:08 | the poll |

**Total: 9 min 23 s**, deployment created to apex serving the new build. Under ten minutes, with
thirty-seven seconds to spare. The single longest piece is the `web` image — `pnpm install` plus
`next build` — which accounts for roughly five of the nine minutes.

The revert works. Coolify built on the box, tagged the images with the merged commit, and
`/healthz` now reports `commit=f75569b env=staging ok=true` — **not `unknown`**, so §8 step 4's
feared locked variable is confirmed absent in the only way that actually proves it, by a build going
through the path that would have exposed it.

### 9.7 Measured: both apexes dropped, and that is criterion 3's answer

106 staging ticks at 5-second intervals: 101 × `200`, **5 × `503`**.

| | staging | production |
|---|---|---|
| last `200` on the old build | 12:44:36 (`1dfe853`) | 12:39:02 (`af089c7`) |
| non-200 | `503` ×5, 12:44:41 → 12:45:02 | `502` ×1, `503` ×5, 12:39:08 → 12:39:35 |
| first `200` on the new build | 12:45:08 (`f75569b`) | 12:39:40 (`af089c7`) |
| **gap** | **≤ 32 s** | **≤ 38 s** |

Both the apex and the `app.` host went down together on each, so this is not a routing quirk on one
hostname. The gap is the container swap: one replica, no rolling update, and `web` runs database
migrations before `next start`, so the new container is not serving for tens of seconds after the old
one stops.

It is worth being exact about where the gap is *not*. Docker reported the new staging container
`healthy` **18 seconds** after it started, while the apex was still returning `503`. So the app was
serving internally and the proxy had not yet switched. The delay is on the routing side, not in
application startup, and any fix aimed only at making the app start faster would miss it.

### 9.8 Criteria

- **Criterion 1 — a merge triggers CI and compliance but no image build; staging updates via
  Coolify's own build.** Still **unticked**. Half of it is now evidenced: Coolify's own build works,
  end to end, on the box (§9.6). The other half is not. This deploy was a button press, so the
  auto-deploy trigger remains unobserved; only the next merge to `main` proves it.
- **Criterion 3 — staging's on-box build completes in under ten minutes without taking the apex
  `/healthz` down.** **Fails**, and fails on the second half only. The build came in at 9 min 23 s,
  inside the budget. The apex went down for up to 32 seconds. Recording this as a failure rather than
  a pass with a caveat: the criterion names the thing it will not tolerate, and the run did it.

## 10. The healthcheck Coolify could not see

Soroush's Coolify panel showed **"Running (no healthcheck)" — "Healthcheck: Not configured"** on the
staging application. It was not missing. Every container on the box reports healthy:

```
web-d180rye…     Up 3 minutes (healthy)     worker-d180rye…     Up 3 minutes (healthy)
web-pboa5wx…     Up 15 hours (healthy)      worker-pboa5wx…     Up 15 hours (healthy)
```

`apps/web/Dockerfile` and `apps/worker/Dockerfile` have each carried a `HEALTHCHECK` instruction since
EPIC-002. Docker was running them and passing. What was missing is a `healthcheck:` key in the compose
file, and **Coolify reads the compose file, not the image.** Only `postgres` had one; `web` and
`worker` had none in any of the three compose files.

**Fixed** in `infra/docker-compose.staging.yml`, `infra/docker-compose.production.yml` and
`infra/docker-compose.yml`: `web` and `worker` now declare `healthcheck:` mirroring their Dockerfile's
test and thresholds exactly, each with a comment saying the duplication is deliberate and the two must
change together. No `${...}` interpolation anywhere in the added blocks, per the EPIC-001 F2 rule at
the top of those files. All three files pass `docker compose config`.

**What this fix does and does not do.** It makes readiness visible to Coolify and to anyone reading
the compose file instead of buried in an image layer. It does **not**, on its own, close the outage in
§9.7 — that gap is on the routing side, as the healthy-at-18-seconds observation shows. Whether
Coolify will now wait for a healthy container before switching the router is a separate setting that
has not been verified here, and the next deploy is what will say. Claiming the healthcheck as the fix
for the downtime would be the same kind of reasoning-from-plausibility that the cookie-prefix epic
already cost us once.

## 11. What this session leaves open

1. **The apex drops on every deploy, on both environments.** Measured, reproducible, ~30 s. **Now
   EPIC-006b** (Stage 0 late debt, size S, not scheduled); see §13. Of the obvious three options, one is not actually available: **a second `web`
   replica is ruled out** by `infra/RUNBOOK.md`'s migration-concurrency decision — the entrypoint
   runs `drizzle-kit migrate` before `next start`, and that is only safe because exactly one
   container does it. So the live options are Coolify's rolling-update behaviour now that the
   healthchecks are declared where it can see them, or moving migrations out of the web entrypoint
   into a one-shot step (which would also cut the startup window that produces the gap). Taking them
   in that order is cheapest first. Not fixed here.
2. ~~**Criterion 1 needs a merge**, not a button.~~ **Closed by §12** — this report's own PR did it.
3. **A project-level Deploy in Coolify redeploys production.** Worth a line in the runbook, because
   the safeguard everyone reaches for — auto-deploy off — does not cover it. Now in
   `infra/RUNBOOK.md`.
4. **Criterion 2 — a `v*` tag still builds and deploys production — remains unverified**, and the only
   way to verify it is to cut a tag, which by PROCESS.md's own rule is a release rather than a test.
   Carried to the next real release rather than held against this epic; see §13.

## 12. The merge that answered criterion 1

This report's own PR (#63) merged at 12:51 and settled criterion 1 without anything being staged for
it. Three things happened on the push to `main`, and all three are what the epic predicted:

| | |
|---|---|
| `CI` | triggered, `event=push`, failed — `log not found` on the job, i.e. the runner never started |
| `Compliance` | triggered, same, all four jobs failed with no logs |
| **`build-images`** | **did not run at all** |

That last line is #62's trigger removal working on a real merge rather than on a reading of the YAML.
The two failures are the budget refusal this epic exists because of, not a code failure: a job that
produces no log never ran.

Coolify picked the merge up on its own:

```
deployment  wrqzmozouniufix0xwovcafd
app         …pboa5wxrnggay30epiq0pmzd   — staging only
commit      50c9831
created     12:51:17Z                   — the same minute as the push
```

**Production was not touched.** That is the useful contrast: the same auto-deploy flags that let
staging follow `main` kept production out of it, which confirms §9.5's reading that the earlier
double-deploy was the project-level button rather than anything structural.

### The second measurement, and what it rules out

| moment | time (UTC) |
|---|---|
| deployment created | 12:51:17 |
| last `200` on `f75569b` | 12:52:12 |
| `503` | 12:52:18, 12:52:24, 12:52:29 |
| first `200` on `50c9831` | 12:52:35 |

**Total 1 min 18 s**, against 9 min 23 s for the first deploy. The difference is Docker layer cache:
#63 changed only documentation and compose YAML, so no image layer was rebuilt. Useful as a floor —
a merge that touches no application code reaches staging in about eighty seconds.

**The apex still dropped, for up to 23 s.** Two things follow.

First, the gap is not an artefact of a long build. A deploy that did almost no work still dropped the
apex for twenty-odd seconds, which puts the cost squarely in the container swap.

Second, **this was the first deploy to carry the compose-level `healthcheck:` blocks from §10, and it
did not close the gap.** §10 declined to claim the healthcheck as the fix for the downtime, on the
grounds that Docker had called a container healthy while the apex was still `503`. That caution was
correct, and it is worth noting as the reason to state it that way: had §10 claimed the fix, this
deploy would have quietly falsified the report an hour after it was written. The healthcheck makes
readiness *visible*; making Coolify *wait* for it is a different setting, and §11's first item is
still open.

## 13. Closing: what this epic did not achieve, and where it went

EPIC-009 is **done**. Two of its eight criteria are not met, and closing the epic on them is a
decision rather than an oversight — both have somewhere to go, and neither is waiting on work this
epic could have done.

### Criterion 3 — FAILED, carried to EPIC-006b

> *Staging's on-box build completes in under ten minutes without taking the apex `/healthz` down.*

The build half passed at 9 min 23 s. **The apex half failed**: up to 32 seconds of `503` on the first
deploy, up to 23 on the second. This is recorded as a failure, not as "pending" or "passed with a
caveat". The criterion names a thing it will not tolerate and three deploys did it.

It is carried to **EPIC-006b · Zero-downtime container replacement on staging** (Stage 0 late debt,
size S, not scheduled). Nothing about the failure is specific to this epic's change — EPIC-008's
image-pull deploys dropped the apex the same way, for longer — so it is not a regression EPIC-009
introduced. What EPIC-009 contributed is the measurement that makes it actionable, and the
`healthcheck:` declarations that are the first half of the likely fix.

### Criterion 2 — UNVERIFIED, carried to the next release

> *A `v*` tag still builds and deploys production.*

Not met and not failed: **unverified**. The workflow change was a trigger removal that left the tag
path untouched, but "untouched" is not evidence, and the only way to gather the evidence is to cut a
tag — which PROCESS.md rules is a release, not a test. Cutting one to satisfy a checkbox would break
the rule this epic wrote.

It is carried to **the next real release**, whenever that is. Whoever cuts it should watch the
production deployment and tick this line.

### One thing deliberately left in the tree

**The `healthcheck:` block added to `infra/docker-compose.production.yml` stays.** It was added while
fixing the staging-side report of "Healthcheck: Not configured" (§10), it mirrors what
`apps/web/Dockerfile` has always done, and it is **inert until the next `v*` tag** because nothing
redeploys production before then. It was offered for reversion and deliberately kept, so that the
three compose files stay consistent with each other and with the Dockerfiles. **Do not revert it as
an oversight** — it is not one.
