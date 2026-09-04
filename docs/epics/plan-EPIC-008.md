# Plan: EPIC-008 Prebuilt images

Re-read for this plan: `CLAUDE.md`, `docs/PROCESS.md`, `docs/epics/CURRENT.md` (EPIC-008), `docs/roadmap.md`'s
EPIC-008 entry, `docs/epics/reports/EPIC-001-report.md`'s "F2 outcome" / "Production tag-deploy criterion
outcome" sections, `infra/ACCESS.md`. Branch `epic/008-prebuilt-images`, cut from `origin/main`.

## 0. State checked before planning

- **SSH (`41p-box`) and `~/.41prompts/staging.env` both work.** Read-only checks run so far (all `GET`/`cat`, no
  approval needed per `infra/ACCESS.md` rule 2):
  - `docker ps` on the box shows only `staging` containers live right now (`web`, `worker`, `postgres`, `backup`,
    all healthy) plus the six `coolify-*` system containers. No `production` containers running.
  - Coolify is `coollabsio/coolify:4.3.17` (Laravel 12.65.0). Its source has **no private-registry-credential
    store** — `ApplicationDeploymentJob.php:2286` throws `"...Please run docker login to login to the docker
    registry on the server"` when a pull needs auth it doesn't have. The only registry-shaped fields on
    `Application` (`docker_registry_image_name/tag`) belong to the separate "deploy from a prebuilt image, no
    git repo" application type, not to a docker-compose resource like ours, and `instance_settings.docker_registry_url`
    is a Docker Hub mirror setting, not a credential. **This settles the epic's "check Coolify's Registry settings
    first" open question in one read-only pass: there is no such feature in this version. The fallback — a
    one-time `docker login ghcr.io` as root on the box — is the only path.** Timeboxed as instructed; not
    re-investigated further.
  - The `41prompts` project has two environments/applications, both `deployment_type: dockercompose`, both
    currently pointed at `docker_compose_location: /infra/docker-compose.yml` (the local-dev file, with `build:`):
    - **staging** → application uuid `pboa5wxrnggay30epiq0pmzd`, `git_branch: main`, status `running` — this is
      the live one `staging.41prompts.ai` serves today.
    - **production** → application uuid `d180rye1i9dtab789t9jyjmh`, `git_branch: main`, status
      `exited:unhealthy` — created during EPIC-001 Follow-up's tag-deploy attempt, never got a working deploy
      (matches the report's "Production tag-deploy criterion outcome: closed as deferred" section).
    Env var **names** present (values not read, per rule 7): both apps have `POSTGRES_USER`, `POSTGRES_PASSWORD`,
    `POSTGRES_DB`, `DEPLOY_ENV`, plus Coolify's own `SERVICE_URL_WEB`/`SERVICE_FQDN_WEB`. Staging additionally has
    `R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_BUCKET_BACKUPS`; **production has none of the R2
    vars yet** — that's EPIC-001's still-open "R2 bucket/backup evidence" item, explicitly out of scope here.
    Production's `backup` service will exist in `docker-compose.production.yml` (matching staging, and the
    epic's scope list) but won't have real R2 credentials until that item is done — noted in the report, not
    blocking.
  - Neither app currently carries a `SOURCE_COMMIT` or `COMMIT_SHA` locked env var (both absent from the list
    above) — F2's compose-file cleanup holds.
  - Repo is private (confirmed via `gh repo view`). No GHCR container packages exist yet. No repo secrets or
    variables exist yet (`gh secret list` / `gh variable list` both empty). Default Actions workflow permission
    is `read`, but that's irrelevant here — `build-images.yml` declares its own `permissions: packages: write`
    block, which is honored regardless of the repo default (the default only applies to workflows that don't
    declare their own).
  - `gh`, `docker`, `gitleaks`, `shellcheck` all available locally.

- **One instruction conflict, flagged and resolved per this session's explicit direction, not re-litigated:**
  `docs/epics/CURRENT.md`'s acceptance criteria say neither new compose file may contain `${` **anywhere**
  (`grep -c '\${' ... ` must return `0`). This session's prompt instead says to *keep*
  `${POSTGRES_USER}`/`${POSTGRES_PASSWORD}`/${POSTGRES_DB}`/`${DEPLOY_ENV}`, calling them "locked variables are
  ours and intentional," while still banning `${SOURCE_COMMIT}`/`${COMMIT_SHA}` specifically. Read together with
  the on-box check above (those four already exist as Coolify env vars on both apps, entered by hand in
  `infra/README.md` step 9, exactly as designed) this is a narrowing of the original blanket rule, not a reversal
  of the actual lesson from EPIC-001 F2 — the defect was Coolify silently *inventing and locking* a variable from
  a `${VAR:-fallback}` expression that was never meant to be Coolify-managed (`SOURCE_COMMIT`/`COMMIT_SHA`,
  which must come from the image build, not from Coolify), not the four operational vars that are supposed to be
  Coolify-managed secrets/config. Implementing as instructed: `${POSTGRES_*}`/`${DEPLOY_ENV}` stay,
  `${SOURCE_COMMIT}`/`${COMMIT_SHA}` (and any `${...}` inside a `build:` block, since there is no `build:` block
  at all now) are absent. This will be called out plainly in the EPIC-008 report as a deviation from the epic
  file's literal acceptance criterion, for the advisor to reconcile `CURRENT.md`'s wording — I'm not editing
  `CURRENT.md` myself (advisor-owned).
- Similarly, this session pulls the kill-container test and the production-deploy criterion back into direct
  scope even though `CURRENT.md`'s "Out of scope" list names both as "unrelated to this epic, not reopened
  here" — but `docs/roadmap.md`'s EPIC-008 entry and the epic's own goal paragraph already say this epic owns
  the production-deploy criterion (moved from EPIC-001 on 2026-09-04), and this session explicitly asks for the
  kill-container evidence to close EPIC-001's matching checkbox. Treating this session's instruction as the
  live amendment; will note it in the report too.

## 1. Build artifacts

| File | Purpose |
|---|---|
| `.github/workflows/build-images.yml` **(new)** | Builds & pushes both images on `main`/`v*`, then calls Coolify's deploy webhook. |
| `.github/workflows/rollback.yml` **(new)** | `workflow_dispatch` retag-and-redeploy, no rebuild. |
| `infra/docker-compose.staging.yml` **(new)** | `image:`, `pull_policy: always`, no `build:`. |
| `infra/docker-compose.production.yml` **(new)** | Same shape, `:production` tag. |
| `infra/docker-compose.yml` **(comment only)** | Header comment: this file is local-dev/`pnpm dev` only, Coolify no longer deploys from it. |
| `.github/workflows/deploy.yml` **(comment fix)** | Its header comment currently says "Coolify deploys itself on push to main... and on v* tags" — no longer true once Coolify's GitHub-App auto-deploy is turned off; fix the comment. Its actual job (GitHub Release on tag) is unrelated to this epic and stays as is. |
| `infra/README.md` | New steps: point each Coolify resource's Docker Compose Location at the new files; turn off GitHub-App auto-deploy per environment; registry auth (`docker login ghcr.io`, since Coolify has none); the four new GitHub secrets; the Coolify deploy-scoped token. |
| `infra/RUNBOOK.md` | Replace "Roll back a production deploy" (currently: Coolify's Deployments-tab redeploy, which no longer applies once Coolify isn't building) with the `rollback.yml` procedure, timed. Registry token rotation note. |

## 2. `build-images.yml` design

- Triggers: `push: branches: [main]` and `push: tags: ['v*']`. No `pull_request` (CI already covers those).
- `concurrency: group: build-images-${{ github.ref }}, cancel-in-progress: true`.
- Two jobs (`build-web`, `build-worker`), matrix or duplicated — duplicated is simpler to read and each has a
  different Dockerfile/build-arg need (only `web` takes `SOURCE_COMMIT`), so two explicit jobs rather than a
  matrix that has to special-case one leg.
- Each job: `permissions: contents: read, packages: write`; `docker/setup-buildx-action`; `docker/login-action`
  against `ghcr.io` with `${{ github.actor }}` / `${{ secrets.GITHUB_TOKEN }}`; `docker/metadata-action` or
  hand-rolled tag list (`sha-<full-sha>` always; `staging` added on a `main` push; `production` + the literal tag
  name added on a `v*` push — computed from `github.ref_type`/`github.ref_name`); `docker/build-push-action` with
  `cache-from: type=gha`, `cache-to: type=gha,mode=max`, `build-args: SOURCE_COMMIT=${{ github.sha }}` (web job
  only).
- Third job `deploy`, `needs: [build-web, build-worker]`: computes which Coolify UUID/environment based on
  `github.ref_type == 'tag'` vs branch push, `curl -sf -X POST -H "Authorization: Bearer ${{ secrets.COOLIFY_DEPLOY_TOKEN }}" "${{ secrets.COOLIFY_URL }}/api/v1/deploy?uuid=<staging-or-production-uuid>"`, `-f` makes curl exit non-zero (failing the job) on a non-2xx response as required.
- No secret value is ever echoed; only the fixed uuids (`pboa5wxrnggay30epiq0pmzd` / `d180rye1i9dtab789t9jyjmh`,
  not secret) are inlined as workflow env, selected by ref.

## 3. `rollback.yml` design

- `workflow_dispatch`, inputs `environment` (`choice`: `staging`/`production`), `sha` (`string`, full commit sha
  to roll back to — must already exist as `:sha-<sha>` on GHCR, i.e. a commit that previously built successfully).
- One job: `docker/login-action` to GHCR, then for both `web` and `worker`:
  `docker buildx imagetools create --tag ghcr.io/soroushamdg/41prompts-<image>:<environment> ghcr.io/soroushamdg/41prompts-<image>:sha-<sha>`
  — pure registry-side retag, no rebuild, no checkout of source needed. Then the same Coolify deploy-webhook call
  as `build-images.yml`'s deploy job, parameterized by the chosen `environment`.

## 4. Compose file shape (both new files)

```yaml
# Coolify-deployed. image: only, no build: — GitHub Actions (.github/workflows/build-images.yml) builds and
# pushes both images; this file only ever pulls. Local dev / `docker compose up` uses infra/docker-compose.yml
# instead, which still has build:.
services:
  postgres: # identical to infra/docker-compose.yml's postgres service, unchanged
  web:
    image: ghcr.io/soroushamdg/41prompts-web:staging   # :production in the production file
    pull_policy: always
    restart: unless-stopped
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
    depends_on: { postgres: { condition: service_healthy } }
    ports: ["127.0.0.1:3000:3000"]
  worker: # same pattern, worker image tag
  backup: # same as infra/docker-compose.yml's backup service — still builds inline (dockerfile_inline) since
          # it's a tiny wrapper around postgres:16 + awscli, not one of the two epic-scoped images; keeping it
          # as build: here is out of scope for this epic (only web/worker move to GHCR per CURRENT.md's scope)
volumes:
  postgres_data:
```
No `env_file: .env` (that file doesn't exist on the box the way local dev has it — Coolify writes its own
generated `.env` per `infra/README.md` step 8, and DEPLOY_ENV/POSTGRES_* already arrive as real Coolify env vars
per §0, not from a checked-in `.env`). Checking `infra/docker-compose.yml` again at implementation time to
confirm exact healthcheck/volume details to mirror.

## 5. Human checklist (batched, asked once, before any of this can go live)

Cannot be executed by me — either a UI-only action, or a credential only Soroush should generate/hold. Assembled
into one message after the branch is pushed and the PR is open, since the exact uuids/URLs referenced in it come
from this session's own read-only lookups (§0) and don't need a second round-trip. Covers: the four GitHub
Actions secrets, the new Coolify deploy-scoped API token, turning off Coolify's GitHub-App auto-deploy on both
environments, pointing each environment's Docker Compose Location at the new file, and the one-time
`docker login ghcr.io` on the box (needs a GitHub PAT only Soroush should generate — he runs this command
himself over SSH rather than pasting a token into this session).

## 6. Sequence

1. Branch `epic/008-prebuilt-images`.
2. Write the two workflows, two compose files, comment fixes, doc updates — one commit per logical unit.
3. `pnpm lint && pnpm typecheck && pnpm test`, `shellcheck` on any touched `.sh` (none expected — no shell script
   changes planned), `gitleaks detect`.
4. Push, open PR, wait for `ci.yml` to go green.
5. Post the batched human checklist in chat and wait for Soroush's yes on each item (secrets/token/UI toggles/
   docker login) — this is a hard stop, not something to route around.
6. Once confirmed: squash-merge the PR (full autonomy per this session's instruction) — this itself is the first
   real `main` push that should trigger `build-images.yml`.
7. Watch the run (`gh run watch`), verify GHCR images pushed, verify the deploy job's curl succeeded, then
   `curl -s https://staging.41prompts.ai/healthz` and diff `commit` against `git rev-parse origin/main`.
8. Tag `v0.0.1-test`, push it, watch the run, verify `:production` pushed and
   `curl -s https://app.41prompts.ai/healthz` returns 200 / `env: production` / that tag's sha.
9. Evidence gathering: `docker images` timestamps or Coolify deploy log excerpt (read-only, via SSH/API) proving
   pull-not-build on both deploys; `docker stats`/`free` snapshot during a deploy; unauthenticated
   `docker pull ghcr.io/soroushamdg/41prompts-web:staging` failing.
10. Kill-container test: read-only diagnostics first (find the container, confirm healthcheck config), then ask
    Soroush before running the actual kill command; time the restart.
11. Rollback drill: trigger `rollback.yml` once against staging with the pre-EPIC-008 commit's sha (won't exist as
    `:sha-<sha>` — first real rollback drill will need to wait until there are at least two Actions-built shas to
    roll between; do this after step 7, rolling back to the sha from the `main`-push build itself once a second
    build exists, or note in the report if only one build has happened by the time this is written).
12. `docs/epics/reports/EPIC-008-report.md`, `docs/epics/sessions/EPIC-008-session.md`, flip `docs/backlog.md`'s
    EPIC-008 row to `done` and tick EPIC-001's two rows for production-deploy/kill-container, set
    `docs/epics/CURRENT.md` to EPIC-002 (copy `docs/epics/EPIC-002-*.md` in — checking whether that file exists
    yet; if not, flag it rather than inventing epic content, since epic files are advisor-owned).

## 7. Known risk / what could turn into a `BLOCKER-EPIC-008.md`

- If Coolify 4.3.17's deploy-webhook endpoint (`POST /api/v1/deploy?uuid=...`) behaves differently than its
  documented contract once actually called (e.g. needs a different token scope than "deploy", or the endpoint
  path differs from what's in the epic notes) — one experiment against staging, timeboxed, per the failure
  protocol; blocker doc if it doesn't resolve quickly.
- If turning off GitHub-App auto-deploy in this Coolify version isn't a simple toggle (e.g. requires deleting the
  GitHub App source entirely) — this changes what goes in the human checklist, not the code; will describe
  exactly what's found once Soroush reports back after doing the UI steps, and adjust the checklist/docs if the
  first attempt surfaces something the current plan didn't expect.
