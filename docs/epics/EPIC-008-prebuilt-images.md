# EPIC-008: Prebuilt images
Stage: 0 · Depends on: EPIC-001 · Size: S

## Goal
No image is ever built on the box that serves production. GitHub Actions builds `web` and `worker`, pushes them
to private GHCR, and Coolify only pulls a fixed tag and redeploys — closing the `healthz` `commit` criterion
deferred from EPIC-001 F2.

This epic also closes EPIC-001's production-deploy criterion, moved here on 2026-09-04: building both images on
the box took 9 minutes with staging running (Coolify injects per-application `ARG` declarations into the
Dockerfile, so the two environments share no layer cache), and Coolify has no way to deploy a specific tag at
all — its UI resource points at a branch, never a tag. Both are exactly what building in Actions and pulling a
fixed tag fixes.

## Scope
- `.github/workflows/build-images.yml`: on push to `main` and on `v*` tags only (never on PRs — `ci.yml` already
  lints/typechecks/tests those). Builds `apps/web/Dockerfile` and `apps/worker/Dockerfile` with `docker buildx`
  and registry cache.
- `--build-arg SOURCE_COMMIT=${{ github.sha }}` passed to the `web` build so the real commit is baked in at build
  time, from a value GitHub, not Coolify, controls.
- Pushes both images to private GHCR under this repo, tagged `:staging`, `:production`, and `:sha-<sha>` (the
  `main`-push job tags `:staging` + `:sha-<sha>`; the `v*`-tag job tags `:production` + `:sha-<sha>`).
- `infra/docker-compose.staging.yml` and `infra/docker-compose.production.yml` (new): `web`/`worker`/`postgres`/
  `backup` services referencing `image:` (not `build:`), `pull_policy: always`. **No `${...}` interpolation
  anywhere in either file** — see Notes below for why this is non-negotiable.
- `infra/docker-compose.yml` (existing) is untouched otherwise and keeps `build:` — it stays the file `pnpm dev`
  and local `docker compose up` use; it is no longer what Coolify deploys.
- Registry credentials on the box: check Coolify's own Registry settings for referencing a private GHCR image
  first; document a one-time `docker login ghcr.io` as the fallback if that isn't supported by the installed
  version.
- Workflow's last step calls Coolify's deploy webhook (a `deploy`-scoped Coolify API token stored as a GitHub
  Actions secret — never the read-only token in `~/.41prompts/staging.env`) once the new image has pushed
  successfully, so the redeploy is automatic, not a second manual step.
- Production's first deploy is a pull of the `:production` tag, not a build: since Coolify's UI has no field to
  select a tag, the `v*`-tag job's workflow triggers the redeploy itself by calling Coolify's deploy webhook once
  `:production` has pushed — the same mechanism the `main`-push job already uses to redeploy staging on `:staging`.
- `infra/README.md` and `infra/RUNBOOK.md` updated for the new deploy flow (what Coolify's resource points at now,
  how a rollback works, where the registry token/webhook token live).

## Out of scope
- Any change to `ci.yml`'s existing lint/typecheck/test jobs.
- Multi-arch (arm64) builds — `amd64` only, matching the Lightsail instance.
- A general-purpose container registry strategy beyond GHCR for this repo.
- Any application code, schema, or UI change. `apps/web/app/healthz/route.ts`'s `COMMIT_SHA`/`SOURCE_COMMIT`
  fallback logic from EPIC-001 F2 is not touched — it already does the right thing once a real build arg exists.
- EPIC-001's still-open Soroush items (production environment bootstrap, R2 bucket/backup evidence, restore
  drill, kill-container test) — unrelated to this epic, not reopened here.
- Re-investigating Coolify's internal variable/build-arg injection for compose deployments. EPIC-001 F2 spent real
  time on that; the decision is to stop and route around it, not to keep reading Coolify's source.

## Acceptance criteria
- [ ] A push to `main` produces a GHCR image tagged `:staging` and `:sha-<merge-sha>`; after Coolify's webhook
      redeploy, `curl -s https://staging.41prompts.ai/healthz` returns `commit` equal to that merge sha. Evidence:
      Actions run URL, curl output.
- [ ] A `v*` tag produces a GHCR image tagged `:production` and `:sha-<tag-sha>`; `curl -s
      https://app.41prompts.ai/healthz` returns `commit` equal to that tag's sha. Evidence: Actions run URL, curl
      output.
- [ ] No build happens on the box for either deploy — Coolify's deployment log shows a pull, not a build.
      Evidence: Coolify deployment log excerpt.
- [ ] Neither `infra/docker-compose.staging.yml` nor `infra/docker-compose.production.yml` contains a `${`
      anywhere. Evidence: `grep -c '\${' infra/docker-compose.staging.yml infra/docker-compose.production.yml`
      returns `0` for both.
- [ ] Rollback works: redeploying the previous `:sha-<sha>` tag restores the prior commit's `healthz` value,
      timed once in `infra/RUNBOOK.md`. Evidence: recorded time, curl output before/after.
- [ ] Box CPU/memory stay flat during a deploy (no local build load). Evidence: `docker stats`/`free` snapshot
      taken during a deploy.
- [ ] GHCR images are private — an unauthenticated `docker pull` fails. Evidence: pull attempt output.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` still pass. Evidence: output.
- [ ] `gitleaks detect` clean — no registry or webhook token committed. Evidence: output.
- [ ] Report and session log written.

## Verification
```
git push origin main                                        # or gh workflow run build-images.yml --ref main
gh run watch <run-id>
curl -s https://staging.41prompts.ai/healthz
grep -c '${' infra/docker-compose.staging.yml infra/docker-compose.production.yml   # expect 0, 0
docker pull ghcr.io/soroushamdg/<image>:staging              # unauthenticated, expect access denied
pnpm lint && pnpm typecheck && pnpm test
gitleaks detect
```

## Notes for the implementer
- **The rule this epic exists to satisfy, learned the hard way in EPIC-001 F2:** any `${VAR}` written anywhere in
  a compose file Coolify deploys becomes a permanently locked application environment variable whose *stored*
  value overrides the build/runtime every deploy, regardless of the file's own fallback logic. `${...}` is
  banned from both new compose files without exception — confirmed against Coolify's own deployment-job source
  and against a real staging deploy, not theoretical.
- Images are built exactly once, in Actions, from a value we control completely (`github.sha`) — nothing about
  the deployed commit may depend on what Coolify chooses to inject at build or runtime. That dependency is
  exactly what made F2 unfixable within Coolify alone.
- `apps/web/app/healthz/route.ts` already prefers `COMMIT_SHA` unless it's the literal `"unknown"` placeholder,
  falling back to `SOURCE_COMMIT` — this logic is correct and stays as written; it starts reporting real commits
  the moment a real `SOURCE_COMMIT` build arg is actually supplied, which is this epic's job, not healthz's.
- GitHub Actions Free plan: 2,000 minutes/month. Two image builds (`web` + `worker`) per `main` push plus per
  `v*` tag is the expected cadence — note actual usage after a few weeks of real traffic.
- Coolify's deploy-webhook token and the GHCR credentials are separate secrets from the read-only
  `COOLIFY_API_TOKEN` in `~/.41prompts/staging.env` — narrowest scope each, never reused across purposes.
- If implementing this from a Claude Code session with box access: any command that changes the box (setting up
  registry auth, changing the compose resource's file, restarting services) is still per `infra/ACCESS.md` rule
  3 — shown with a one-line reason, run only after Soroush's yes, one at a time.
