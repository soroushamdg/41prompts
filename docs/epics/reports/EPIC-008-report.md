# EPIC-008 report: Prebuilt images

Branch `epic/008-prebuilt-images`, merged as PR #6 (squash), commit `b62f12b`. One follow-up fix commit directly
on `main`, `772184d` (see "What took longer than expected" below). Tag `v0.0.1-test` created for the production
verification this epic's acceptance criteria require.

## What was built

- `.github/workflows/build-images.yml` — builds `web`/`worker` on push to `main` and `v*` tags (never on PRs),
  `docker/build-push-action` with `cache-from/cache-to: type=gha`, `--build-arg SOURCE_COMMIT=${{ github.sha }}`
  on the web image, tags `sha-<sha>` always + `staging` on `main` + `production`/`<tag>` on `v*`. Third job calls
  Coolify's deploy webhook, failing the run on a non-2xx response (`curl -sf`).
- `.github/workflows/rollback.yml` — `workflow_dispatch` (`environment`, `sha`), retags an existing `:sha-<sha>`
  to `:staging`/`:production` via `docker buildx imagetools create` (registry-side, no rebuild, no checkout),
  then the same deploy webhook call.
- `infra/docker-compose.staging.yml`, `infra/docker-compose.production.yml` — `image:` + `pull_policy: always`,
  no `build:` for `postgres`/`web`/`worker`. `backup` stays `build:` (out of scope — not one of the two images
  this epic moved to GHCR). `infra/docker-compose.yml` gets a header comment marking it local-dev-only.
- `infra/README.md` — new "Prebuilt images (EPIC-008)" section: the 4 GitHub secrets, turning off Coolify's
  GitHub-App auto-deploy per environment, the one-time `docker login ghcr.io` (Coolify 4.3.17 has no registry-
  credential store — confirmed by reading `ApplicationDeploymentJob.php` on the box), repointing each
  environment's Docker Compose Location.
- `infra/RUNBOOK.md` — "Roll back a deploy" rewritten around `rollback.yml` (Coolify's own Deployments-tab
  redeploy can no longer roll back anything once it never builds — it would just re-pull the same tag); GHCR PAT
  rotation notes.
- `.github/workflows/deploy.yml` — header comment corrected (build-images.yml deploys now, not Coolify's own
  push listener).

## Deviations from `docs/epics/CURRENT.md`, both instructed directly by Soroush in this session, documented at
## the time in `docs/epics/plan-EPIC-008.md` §0 rather than re-litigated

1. **`${...}` in the compose files.** `CURRENT.md`'s acceptance criteria require zero `${` in either new file.
   This session's prompt instead said to keep `${POSTGRES_USER}`/`${POSTGRES_PASSWORD}`/`${POSTGRES_DB}`/
   `${DEPLOY_ENV}` (Coolify-managed, unchanged from today) while still banning `${SOURCE_COMMIT}`/`${COMMIT_SHA}`
   specifically — the actual EPIC-001 F2 lesson (a `${VAR:-fallback}` inside a `build.args` block gets silently
   turned into a permanently locked Coolify env var). Implemented as instructed: `grep -c '\${'` on either file
   returns 11, not 0, but every occurrence is one of the four intentional vars or a comment; `grep -c
   'SOURCE_COMMIT\|COMMIT_SHA'` matches only comments, never a live interpolation. **Advisor: please reconcile
   `CURRENT.md`'s literal wording with this — the safety property that matters (SOURCE_COMMIT/COMMIT_SHA never
   Coolify-managed) holds; the blanket "no `${` at all" text does not.**
2. **Kill-container test and production-deploy criterion.** `CURRENT.md`'s "Out of scope" list names both as
   "unrelated to this epic, not reopened here," but `docs/roadmap.md`'s EPIC-008 entry and this epic's own goal
   paragraph already say it owns the production-deploy criterion (moved from EPIC-001, 2026-09-04), and this
   session explicitly asked for the kill-container evidence too. Both are done — see Acceptance criteria below.

## A real bug found during verification, not anticipated in the plan

`infra/docker-compose.production.yml` copied `infra/docker-compose.yml`'s host port bindings
(`127.0.0.1:5432:5432`, `127.0.0.1:3000:3000`) verbatim. Staging and production run on the **same** Lightsail
box, and staging already held those ports — production's first real deploy failed outright:

```
Error response from daemon: failed to set up container networking: driver failed programming external
connectivity on endpoint postgres-d180rye1i9dtab789t9jyjmh-...: Bind for 127.0.0.1:5432 failed: port is
already allocated
```

(Full deployment log pulled read-only from `coolify-db`'s `application_deployment_queues.logs` column, id 11.)
Fixed in commit `772184d`: production uses `5433`/`3001` instead. No functional change — these bindings are
local-debug-only (`psql`/`curl` from the box); Coolify's proxy reaches containers by service name over the
compose network regardless. `docs/epics/EPIC-008-prebuilt-images.md`'s scope didn't call this out because the
epic that originally stood production up (EPIC-001) never got a container far enough to hit it — this is the
first time production's `postgres` actually tried to bind a host port while staging's was live.

## Acceptance criteria

- [x] **`main` → GHCR `:staging` + `:sha-<sha>`, staging `healthz.commit` matches.** Two real cycles, not one:
      - First (`b62f12b`, PR #6 merge): Actions run
        [33926012722](https://github.com/soroushamdg/41prompts/actions/runs/33926012722). `deploy` job initially
        failed (secrets didn't exist yet — expected, checklist wasn't done), re-run after the checklist succeeded.
      - Second (`772184d`, the port-collision fix): Actions run
        [33927808161](https://github.com/soroushamdg/41prompts/actions/runs/33927808161), clean end to end.
      - Evidence: `curl -s https://staging.41prompts.ai/healthz` → `{"ok":true,"commit":"772184d11188a79bb8d4d2fe6e51ac2f28a6fac5","env":"staging"}`, matching `git rev-parse origin/main` exactly.
- [x] **`v*` tag → GHCR `:production` + `:sha-<tag-sha>`, production `healthz` 200/production/tag-sha.** Tag
      `v0.0.1-test` (commit `b62f12b`), Actions run
      [33927413913](https://github.com/soroushamdg/41prompts/actions/runs/33927413913). First webhook call
      succeeded, but Coolify's deploy itself failed (the port-collision bug above); re-triggered the same
      already-succeeded `deploy` job (`gh run rerun 33927413913 --job 101199020396`) after `772184d` landed on
      `main` — Coolify always reads the compose file's *content* from `main`'s HEAD regardless of which ref
      triggered the webhook, so no new tag/build was needed to pick up the fix.
      Evidence: `curl -s https://app.41prompts.ai/healthz` → `HTTP 200`,
      `{"ok":true,"commit":"b62f12b2f46b5eab0e36605cc927aea55f42ad26","env":"production"}` — exactly the tag's
      commit. TLS: `curl -vI` shows `issuer: C=US; O=Let's Encrypt; CN=YR1`, `subject: CN=app.41prompts.ai` (a
      real cert — Domains config for production turned out to already be set up correctly; an earlier 503/
      Traefik-default-cert reading was investigated and traced to the cert/router simply not existing yet before
      production's first successful deploy, not a missing config step).
- [x] **No build on the box.** `docker image inspect ghcr.io/soroushamdg/41prompts-{web,production}` on both
      environments shows a real `RepoDigests` entry (`ghcr.io/soroushamdg/41prompts-web@sha256:...`) — only
      possible if the image was pulled, since a locally built image never carries a registry digest. Contrast:
      an earlier, since-superseded container (created before the human checklist turned Coolify's own
      GitHub-App auto-deploy off) *was* a local build, tagged Coolify's own way
      (`pboa5wxrnggay30epiq0pmzd_web:<sha>`, full BuildKit history) — caught and documented as the actual
      mechanism `is_auto_deploy_enabled` protects against, not just theory.
- [x] **Neither compose file has `${` anywhere** — **deviated, see above.** Both do, for four named, intentional
      vars. `SOURCE_COMMIT`/`COMMIT_SHA` never appear as a live interpolation in either.
- [x] **Rollback works, timed.** Two full round trips against staging via `rollback.yml`:
      - `b62f12b` → `772184d` was live → rolled back to `b62f12b`: dispatch 23:06:36 → Actions retag+webhook done
        23:06:57 (21s) → Coolify deployment (`id 14`) 23:06:54→23:08:52 (1m58s) → confirmed healthy via
        `/healthz` ~23:10:10. **Total ≈3m34s.**
      - Rolled forward again, `b62f12b` → `772184d`: dispatch 23:10:49 → Actions 23:10:52→23:11:24 (32s) →
        Coolify deployment (`id 15`) → confirmed healthy ~23:13:06. **Total ≈2m17s.**
      Recorded in `infra/RUNBOOK.md`'s rollback table.
- [x] **Box CPU/memory flat during a deploy.** `docker stats --no-stream` snapshot taken mid-pull (the
      `coolify-helper` container visibly running): every app container ≤0.03% CPU except one `postgres` briefly
      at 9.38% during its own healthcheck restart — nothing resembling the sustained multi-core compile load a
      `pnpm install && turbo build` on-box build produces. `free -h`: ~1.4Gi used, ~2.4Gi available, stable
      across two snapshots ~35s apart.
- [x] **GHCR images private.** `docker pull ghcr.io/soroushamdg/41prompts-web:staging` (and separately
      `41prompts-worker:production`), both unauthenticated, both `Error response from daemon: ... unauthorized`.
- [x] **Killed web container restarts within 30s** — closes EPIC-001's last open criterion, ticked there too.
      **First attempt was methodologically wrong and is worth recording:** `docker kill <container>` did *not*
      auto-restart despite `restart: unless-stopped` — Docker's restart-manager logs `"stopping restart-manager"`
      for any container stopped via the Docker API (`kill`/`stop`), because `unless-stopped` means exactly what
      it says: restart unless *someone told it to stop*. An explicit `docker kill` counts as being told to stop,
      same as `docker stop` would. Repaired (`docker start`), then re-ran the test correctly: found the
      container's **host PID** (`docker inspect --format '{{.State.Pid}}'`) and sent `sudo kill -9 <pid>`
      directly, bypassing Docker's stop API entirely — this simulates an actual crash rather than an operator
      stop. Result: `Restarting (137)` within 2s, `Up ... (healthy)` within **9s total**. Documented in
      `infra/RUNBOOK.md` is not yet updated with this Docker semantic — flagging for a follow-up doc note since
      it'll trip up the next person who tries the naive `docker kill` version of this test.
- [x] `pnpm lint && pnpm typecheck && pnpm test` — clean (all cache hits; no application code touched).
- [x] `actionlint` clean on all four workflow files (caught and fixed two real `SC2086` unquoted-expansion
      findings in the first draft of `rollback.yml`).
- [x] `shellcheck` clean on `infra/*.sh` (untouched this epic, re-verified anyway).
- [x] `gitleaks detect` — clean, run three times across the session (before PR, before the port-fix push, before
      this report).
- [x] Report and session log written (this file; `docs/epics/sessions/EPIC-008-session.md`).

## Actions minutes

| Run | Trigger | build-web | build-worker | deploy | Total wall-clock (parallel) |
|---|---|---|---|---|---|
| 33926012722 | `main` (cold, no prior cache) | 2m17s | 1m18s | 4s (failed, secrets missing) + 4s (re-run, success) | ≈2m21s to image-push; +~10min human gap before deploy succeeded |
| 33927413913 | `v0.0.1-test` (cache hit) | 34s | 58s | 4s | ≈1m2s |
| 33927808161 | `main` (cache hit) | 2m5s | 27s | 4s | ≈2m9s |
| 3× `rollback.yml` | manual | — | — | 16–32s total (retag+webhook) | well under 1min each |

Cold build (worst case, first run ever) was **2m21s wall-clock**, far under the epic's 12-minute concern — no
`BLOCKER` warranted. GitHub Actions Free plan (2,000 min/month): this session consumed roughly 12–14 billed
job-minutes total across every run above (each job rounds up to the nearest minute). At the `main`+`v*` cadence
this epic assumes, monthly usage should stay in the low tens of minutes barring a much higher release cadence —
worth re-checking after a few real weeks, per the epic's own note.

## Open items, not this epic's to close

- Production's `backup` service has no `R2_*` env vars yet (EPIC-001's still-open "R2 bucket/backup evidence,"
  explicitly out of scope here). It's present in `docker-compose.production.yml` for parity with staging but
  won't back up anything real until those vars are set.
- `infra/RUNBOOK.md`'s kill-container / restart-loop section should get a short note about the `docker kill`
  vs. host-PID-`kill -9` distinction found above — didn't add it in this session since it's RUNBOOK content
  about a *different* epic's criterion (EPIC-001's), and I stayed inside this epic's own file-touch list; noting
  it here so it isn't lost.
- `docs/epics/CURRENT.md`'s literal "no `${` anywhere" acceptance-criterion wording needs reconciling with the
  amendment described above.
- **`docs/epics/CURRENT.md` could not be set to EPIC-002 as asked**: no `docs/epics/EPIC-002-*.md` file exists
  yet (`docs/roadmap.md` has the EPIC-002 entry, but per `docs/PROCESS.md`'s loop, the advisor writes the epic
  file and copies it to `CURRENT.md` — that's not done yet, and epic files are advisor-owned; I didn't author
  one myself). `CURRENT.md` is left as EPIC-008 pending that.

## Verification commands (for re-running)

```
curl -s https://staging.41prompts.ai/healthz
curl -s https://app.41prompts.ai/healthz
grep -c 'SOURCE_COMMIT\|COMMIT_SHA' infra/docker-compose.staging.yml infra/docker-compose.production.yml   # comments only, 0 live interpolations
docker pull ghcr.io/soroushamdg/41prompts-web:staging   # unauthenticated, expect denied
pnpm lint && pnpm typecheck && pnpm test
gitleaks detect
actionlint .github/workflows/*.yml
```
