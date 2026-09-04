# EPIC-001: Infrastructure
Stage: 0 · Depends on: EPIC-000 · Size: M

## Goal
One AWS Lightsail instance in Montréal runs Coolify and deploys `apps/web` and `apps/worker` with Postgres from
GitHub: staging on every push to `main`, production on every `v*` tag, with TLS, nightly backups to R2, and a
restore that has been rehearsed once. Everything is code in `infra/`; no agent ever touches the server.

## Division of labour
**Claude Code writes files only.** It never runs `ssh`, never holds a key, never sets a secret.
**Soroush** does the AWS console steps, runs the bootstrap once from his own terminal, connects GitHub in the
Coolify UI, and sets secrets. The runbook Claude Code writes must be followable by him without help.

## Scope (Claude Code)
- `infra/README.md`: the full runbook, in order, with exact commands and the console clicks, written for someone doing it for the first time.
- `infra/bootstrap.sh`: idempotent, safe to re-run. Ubuntu 24.04. Creates a non-root `deploy` user with sudo, disables password SSH, `ufw` allowing 22/80/443 only, `fail2ban`, unattended upgrades, swap file 2 GB, Docker via the official script, then installs Coolify (`curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash`). Prints the Coolify URL at the end. Every step checks whether it already happened.
- `infra/docker-compose.yml`: services `postgres` (postgres:16, named volume, healthcheck), `web` (built from `apps/web/Dockerfile`), `worker` (built from `apps/worker/Dockerfile`); worker waits for postgres healthy; `web` exposes 3000 to Coolify's proxy only.
- `apps/web/Dockerfile` and `apps/worker/Dockerfile`: multi-stage, pnpm with `--frozen-lockfile`, non-root user, `HEALTHCHECK`.
- `apps/web/app/healthz/route.ts`: returns `{ ok: true, sha, env }` from build-time env.
- `infra/backup.sh`: `pg_dump` to a timestamped file, upload to R2 with `rclone` or the AWS CLI (S3-compatible), keep 30 days, exit non-zero on any failure so Coolify's scheduled task shows red. `infra/restore.sh`: restore a named dump into a scratch database and print row counts.
- `.env.example` updated with every variable the compose file reads, each commented.
- `.github/workflows/deploy.yml`: no deploy logic (Coolify deploys itself); only a job that on `v*` tags creates a GitHub Release with the tag's notes, so production deploys are visible in one place.
- Migration step: the web container runs `pnpm db:migrate` before starting (entrypoint), so a deploy never runs against an old schema.
- `infra/RUNBOOK.md`: sections for restore drill (timed), rotate a secret, roll back a production deploy (Coolify redeploy previous), what to do when the box is down, how to resize the instance.

## Scope (Soroush, following infra/README.md)
1. Lightsail → Create instance: Montréal (ca-central-1), Linux, **Ubuntu 24.04**, plan **4 GB RAM / 2 vCPU / 80 GB** or larger. Attach a **static IP**. Enable **automatic snapshots**.
2. Networking tab: allow only 22, 80, 443. Coolify's UI (port 8000) is reached through an SSH tunnel per the runbook, never opened publicly.
3. DNS at the registrar or Cloudflare: `A` records for `41prompts.ai`, `app.41prompts.ai`, `staging.41prompts.ai` → the static IP. If Cloudflare, proxy off (grey cloud) until TLS is issued, then on.
4. From his terminal: `ssh -i <lightsail-key> ubuntu@<ip> 'bash -s' < infra/bootstrap.sh`.
5. Coolify UI via tunnel: create admin; connect GitHub via the Coolify GitHub App to `soroushamdg/41prompts`; create project `41prompts` with environments `staging` (branch `main`, auto-deploy) and `production` (tag `v*`); add the compose file as the resource; set env vars from `.env.example`; set domains; let Coolify issue TLS.
6. Create the R2 bucket `41p-backups` and an R2 API token; set them in Coolify; add the nightly scheduled task running `infra/backup.sh`.
7. Run the restore drill from the runbook once and record the time.

## Out of scope
- Any application schema, auth, or UI. (EPIC-002, EPIC-003)
- Sentry, PostHog, uptime checks. (EPIC-004)
- CDN for artifacts. (Stage 5a)
- Multi-instance, load balancer, failover. (Not in v1.)
- Terraform or CloudFormation. One box; a runbook is enough.

## Acceptance criteria
- [ ] `bash -n infra/bootstrap.sh` passes; `shellcheck` clean on all scripts. Evidence: output.
- [ ] `docker compose -f infra/docker-compose.yml config` validates locally. Evidence: output.
- [ ] Local `docker compose up` (with a local `.env`) brings up postgres, web, worker; `curl localhost:3000/healthz` returns `ok: true`. Evidence: output.
- [ ] Web container entrypoint runs migrations before start (a log line proves order). Evidence: log excerpt.
- [ ] `infra/README.md` read top to bottom by Soroush; every console step has a screenshot name or exact menu path.
- [ ] After Soroush completes his steps: `curl https://staging.41prompts.ai/healthz` returns the current `main` sha. Evidence: output pasted into the report by Soroush.
- [ ] A no-op tag `v0.0.1-test` deploys production; `https://app.41prompts.ai/healthz` returns that sha. Evidence: output.
- [ ] Killing the web container in Coolify restarts it within 30 s. Evidence: Coolify log.
- [ ] Nightly backup produced a file in R2; restore drill completed and timed in `infra/RUNBOOK.md`. Evidence: bucket listing and the recorded time.
- [ ] `gitleaks detect` on the repo finds nothing. Evidence: output.
- [ ] Report and session log written.

## Verification
```
shellcheck infra/*.sh
docker compose -f infra/docker-compose.yml config
docker compose -f infra/docker-compose.yml up -d && sleep 20 && curl -s localhost:3000/healthz
curl -s https://staging.41prompts.ai/healthz         # after Soroush's steps
```

## Notes for the implementer
- Do not run `ssh`, `scp`, or anything that reaches the server. If a step needs the server, write it into `infra/README.md` for Soroush and stop.
- Do not ask for or store any key, token, or password. Reference variables by name only.
- Coolify runs its own Traefik; do not add nginx or Caddy.
- Keep `bootstrap.sh` boring: no clever flags, comments before every step, `set -euo pipefail`.
- The region and provider are decided (ADR-001 revision): Lightsail, ca-central-1. Do not propose alternatives.
