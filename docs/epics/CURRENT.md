# EPIC-001: Infrastructure
Stage: 0 · Depends on: EPIC-000 · Size: M

## Goal
One AWS Lightsail instance in Montréal runs Coolify and deploys `apps/web` and `apps/worker` with Postgres from
GitHub: staging on every push to `main`, production on every `v*` tag, with TLS, nightly backups to R2, and a
restore that has been rehearsed once. Everything is code in `infra/`; ~~no agent ever touches the server~~ (revised 2026-09-04: see Follow-up F1 and ADR-001).

## Division of labour
**Claude Code writes files only.** ~~It never runs `ssh`, never holds a key, never sets a secret.~~ Revised 2026-09-04: Claude Code may read the box and the Coolify API; every mutating command needs Soroush's yes in chat; it still never holds a key or sets a secret (Follow-up F1).
**Soroush** does the AWS console steps, runs the bootstrap once from his own terminal, connects GitHub in the
Coolify UI, and sets secrets. The runbook Claude Code writes must be followable by him without help.

## Scope (Claude Code)
- `infra/README.md`: the full runbook, in order, with exact commands and the console clicks, written for someone doing it for the first time.
- `infra/bootstrap.sh`: idempotent, safe to re-run. Ubuntu 24.04. Creates a non-root `deploy` user with sudo, disables password SSH, `ufw` allowing 22/80/443 only, `fail2ban`, unattended upgrades, swap file 2 GB, Docker via the official script, then installs Coolify (`curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash`). Prints the Coolify URL at the end. Every step checks whether it already happened.
- `infra/docker-compose.yml`: services `postgres` (postgres:16, named volume, healthcheck), `web` (built from `apps/web/Dockerfile`), `worker` (built from `apps/worker/Dockerfile`); worker waits for postgres healthy; `web` exposes 3000 to Coolify's proxy only.
- `apps/web/Dockerfile` and `apps/worker/Dockerfile`: multi-stage, pnpm with `--frozen-lockfile`, non-root user, `HEALTHCHECK`.
- `apps/web/app/healthz/route.ts`: returns `{ ok: true, commit, env }` from build-time env (not `sha`; ADR-003).
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
- Server access is now allowed under the rules in **Follow-up F1** below (ADR-001 revision 2026-09-04). The two bullets that follow are superseded by it.
- ~~Do not run `ssh`, `scp`, or anything that reaches the server. If a step needs the server, write it into `infra/README.md` for Soroush and stop.~~
- Do not ask for or store any key, token, or password. Reference variables by name only. Connection details live in `~/.41prompts/staging.env` and `~/.ssh/config`, outside the repo; read them, never print or copy them.
- Coolify runs its own Traefik; do not add nginx or Caddy.
- Keep `bootstrap.sh` boring: no clever flags, comments before every step, `set -euo pipefail`.
- The region and provider are decided (ADR-001 revision): Lightsail, ca-central-1. Do not propose alternatives.

---

## Follow-up (2026-09-04, after the first staging deploy)

State when this was written: `https://staging.41prompts.ai/healthz` returns `{"ok":true,"commit":"unknown","env":"staging"}` over a valid certificate; postgres, web, worker, backup all healthy; `origin/main` is `fd7b57d`. Three defects and one policy change came out of the human half. Do them in order; each is one commit.

### F1 · Server access for Claude Code (policy change, do first)
Soroush decided that Claude Code may reach the box directly. ADR-001 records the decision, the advisor's objection, and the conditions. Implement the conditions:
- Write `infra/ACCESS.md`: who may connect, how, and the rules below, verbatim. Link it from `infra/README.md` and `CLAUDE.md`.
- Add a **Server access** section to `CLAUDE.md` with exactly these rules:
  1. Connect only through the `~/.ssh/config` alias `41p-box` and the values in `~/.41prompts/staging.env` (`COOLIFY_URL`, `COOLIFY_API_TOKEN`). Never read `~/.ssh/lightsail/` directly, never copy either file, never print a value from them.
  2. Read-only by default: `docker ps/logs/inspect/stats`, `free`, `df`, `journalctl`, `cat` of files under `/data/coolify/applications/`, and `GET` calls to the Coolify API.
  3. Any command that changes the box (`rm`, `docker rm/volume/exec/restart/compose`, editing a file, `apt`, `systemctl`, any Coolify API call other than `GET`) is shown in chat with a one-line reason and run only after Soroush says yes. Batch approvals are not a thing; one command, one yes.
  4. Never touch `coolify`, `coolify-db`, `coolify-redis`, `coolify-realtime`, `coolify-proxy`, `coolify-sentinel`, or anything under `/data/coolify/` except read.
  5. Every change made on the box is also made in `infra/` in the same session, or reverted before the session ends. Every mutating command and its approval is logged in the session file.
  6. Never allow-list `ssh`, `scp`, or `curl` against the Coolify URL in Claude Code's permissions; they stay on per-command approval.
- Human steps, written into `infra/ACCESS.md` for Soroush to run: create `~/.ssh/config` entry `Host 41p-box` (HostName, User `ubuntu`, IdentityFile `~/.ssh/lightsail/LightsailDefaultKey-ca-central-1.pem`, `IdentitiesOnly yes`); create a Coolify API token (Keys & Tokens → API tokens) with the narrowest permissions the UI offers (read + deploy; never root / write / sensitive); write `~/.41prompts/staging.env` with mode 600.
- `.gitignore`: confirm `*.env` under `infra/` and `.41prompts/` can never be committed; run `gitleaks detect`.

### F2 · `commit` is `unknown` on staging (defect)
Cause, confirmed in the Coolify UI: Coolify parses every `${VAR}` in `infra/docker-compose.yml` into a locked environment variable. It created `SOURCE_COMMIT=unknown` and `COMMIT_SHA=${SOURCE_COMMIT:-unknown}`, neither deletable while the compose file references them, and the literal `unknown` wins at build time.
- Remove every `${COMMIT_SHA…}` / `${SOURCE_COMMIT…}` reference from `infra/docker-compose.yml`.
- Find out, on the box, how Coolify actually passes the commit for a compose build. The deploy log says "Added 28 ARG declarations to Dockerfile for service web" and "Adding build arguments to Docker Compose build command"; inspect the deployed image (`docker inspect` env, `docker history`) and the build directory Coolify keeps, and read Coolify's generated Dockerfile if it is on disk. Use what it injects (expected: `SOURCE_COMMIT` as a build arg) via `ARG SOURCE_COMMIT` in `apps/web/Dockerfile` with `ENV COMMIT_SHA=$SOURCE_COMMIT` fallback `unknown`. Keep local `docker compose` builds working with `COMMIT_SHA` from the shell.
- If Coolify injects nothing usable, second option: allow `.git/HEAD` and `.git/refs` through `.dockerignore` for the pruner stage only and read the sha there. Pick one; explain in the commit message.
- After the compose change is merged and staging redeploys, Soroush deletes the two locked variables in the Coolify UI; write that step into `infra/README.md`.
- Acceptance: `curl -s https://staging.41prompts.ai/healthz` returns `commit` equal to `git rev-parse origin/main`. Paste both in the report.

### F3 · Runbook corrections (defects found by Soroush while following it)
- `POSTGRES_PASSWORD` must be generated with `openssl rand -hex 24`, not `-base64`; base64 output contains `/` and `+`, which break `DATABASE_URL` as a URL, and `drizzle-kit migrate` then fails with a bare `Exit status 1`. Say why in the runbook. Also add: if the password is changed after first start, the postgres data volume must be dropped (empty DB) or the password changed with `ALTER USER` (live DB); give both commands.
- Coolify UI is reached at `https://coolify.41prompts.ai` through Coolify's own proxy (Instance Domain), with 2FA; the tunnel is the fallback. Port 8000 stays closed. Update steps 5–6 and the ⚠ in step 6 (the GitHub App screen is **Sources → + Add → GitHub App**; it needs the public HTTPS instance domain first or the callback fails).
- Step 8: Base Directory `/` + Docker Compose Location `/infra/docker-compose.yml` is now confirmed to work; remove the "not yet confirmed" caveat. Coolify writes `.env` at the base directory from its Environment Variables tab; say so.
- Step 9: only the variables the compose file needs are required on Coolify (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DEPLOY_ENV`); the rest are added when the epic that needs them lands. Warn that Coolify auto-creates a locked variable for every `${VAR}` in the compose file.
- Domains: Coolify's "Direction" setting adds a `www.` router that fails ACME every few minutes when no `www` DNS record exists (seen in `coolify-proxy` logs for `www.staging.41prompts.ai`). Document the setting that removes the `www` router, verified against the UI.
- `bootstrap.sh` notes: `PermitRootLogin prohibit-password` and why (Coolify SSHes as root by key from its own container via `host.docker.internal`); fail2ban `ignoreip` covers Docker networks; `ssh.service` vs `sshd.service` naming on Ubuntu 24.04.
- `infra/RUNBOOK.md`: add "web container restart loop" with the two diagnostics used today (`docker ps -a`, `docker logs --tail 40`) and the two causes seen (bad password in URL, migrate failure).

### F4 · Report and session
- Update `docs/epics/reports/EPIC-001-report.md`: human-half evidence (healthz output with commit, container status table, proxy log line for the certificate), what F1–F3 changed, open items still owed by Soroush (production environment + `v0.0.1-test`, R2 bucket + backup evidence, restore drill time, kill-container test).
- `docs/epics/sessions/EPIC-001-session.md`: append this session, including every server command run and its approval.
- PR to `main`, CI green, squash merge. Staging auto-deploys; verify F2's acceptance on the deployed result before closing.
