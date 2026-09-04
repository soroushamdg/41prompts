# Infrastructure setup

One-time setup for the Lightsail box that runs Coolify, which deploys `apps/web`, `apps/worker`, and `postgres`
from this repo. Written for doing this the first time. Claude Code writes and maintains everything under
`infra/`; every step below that touches the server, DNS, or a secret is yours to run.

Before you start: an AWS account with Lightsail access, a Cloudflare (or other) DNS zone for `41prompts.ai`, and
a Cloudflare account for R2. Nothing here needs a GitHub personal access token — Coolify connects to GitHub via
its own GitHub App (step 6).

One screen in this doc (marked ⚠) I can't confirm without a running Coolify instance — check it against what
you actually see and correct this file if the label differs.

## Steps

1. **AWS Console → Lightsail → Create instance.** Region **Montréal (ca-central-1)**, platform Linux/Unix,
   blueprint **OS Only → Ubuntu 24.04 LTS**, plan **4 GB RAM / 2 vCPU / 80 GB SSD** or larger. On the instance's
   **Networking** tab: attach a **static IP**. On **Snapshots**: enable **automatic daily snapshots**.
2. **Networking tab, firewall rules:** allow only **22 (SSH)**, **80 (HTTP)**, **443 (HTTPS)**. Do not open 8000
   (Coolify's own UI) — it's reached only via an SSH tunnel in step 5.
3. **DNS** (registrar or Cloudflare): `A` records for `41prompts.ai`, `app.41prompts.ai`, `staging.41prompts.ai`
   → the static IP from step 1. If using Cloudflare: proxy **off** (grey cloud) until Coolify issues TLS in step
   11, then switch it **on**.
4. **From your terminal**, run the bootstrap once:
   ```
   ssh -i <lightsail-key> ubuntu@<static-ip> 'sudo bash -s' < infra/bootstrap.sh
   ```
   It's idempotent — safe to re-run if interrupted. It hardens the `ubuntu` user (key-only SSH, no root login),
   sets up `ufw`/`fail2ban`/unattended upgrades, adds a 2 GB swap file, installs Docker, then installs Coolify.
   It prints the Coolify URL (`http://localhost:8000`, only reachable from the box itself) when done.
5. **Open a tunnel and reach Coolify's setup wizard:**
   ```
   ssh -i <lightsail-key> -L 8000:localhost:8000 ubuntu@<static-ip>
   ```
   Then open `http://localhost:8000` in your browser and create the **admin account** (first screen the wizard
   shows). Coolify's own default local server should already be registered as the deploy target, since Coolify
   runs on the same box it deploys to — if the wizard instead prompts you to add a server, confirm it's adding
   `localhost`/`127.0.0.1`, not a new remote host.
6. **Sources → GitHub Apps → Connect** ⚠ (exact screen name/path to confirm against the installed version — this
   is where a Coolify-managed GitHub App is installed against `soroushamdg/41prompts` so Coolify can pull the
   repo and post deploy-status checks on commits).
7. **Projects → New Project**, name it `41prompts`. Inside it, create two **Environments**: `staging` (tracks
   branch `main`, auto-deploy on push) and `production` (tracks tags matching `v*`).
8. In each environment: **New Resource → Docker Compose**, point it at the connected repo. **Important:** set
   **Base Directory** to `/` (the repo root) and **Docker Compose Location** to `/infra/docker-compose.yml` —
   not the other way around. Docker Compose resolves the compose file's relative paths (`build.context`,
   `env_file`) and its default `.env` lookup relative to whatever it treats as the project directory, which
   defaults to the *compose file's own directory* unless told otherwise. Since `infra/docker-compose.yml` needs
   the repo root as both its build context (the Dockerfiles run `turbo prune` over the whole monorepo) and where
   `.env` lives, Coolify's Base Directory has to be the repo root for its deploy to work at all — confirmed
   locally with `docker compose --project-directory . -f infra/docker-compose.yml config` (see
   `docs/epics/reports/EPIC-001-report.md`); not yet confirmed that Coolify's own "Base Directory" field produces
   the equivalent of `--project-directory` under the hood, so treat this as the first thing to check if the
   first deploy fails on a missing file or an empty env var.
9. **Environment Variables** tab on the resource: paste in every variable from `.env.example`, filled with real
   values — `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL` (for local-dev parity; the
   compose file overrides it for the containers themselves), auth/provider keys, `R2_*`, and `DEPLOY_ENV` set to
   `staging` or `production` to match the environment.
10. Nothing to configure for `COMMIT_SHA`: Coolify sets `SOURCE_COMMIT` automatically for git-based builds, and
    `infra/docker-compose.yml`'s build args already fall back to it. Only revisit this if you find the installed
    Coolify version exposes the commit under a different variable name — if so, either rename it to
    `SOURCE_COMMIT` in Coolify's build settings or set `COMMIT_SHA` explicitly there, and update this note.
11. **Domains** tab, `web` service only: set `staging.41prompts.ai` (staging environment) and
    `app.41prompts.ai` (production environment). Leave `worker`, `postgres`, and `backup` without a domain —
    they're not web-facing. Let Coolify issue TLS (Let's Encrypt) once DNS resolves.
12. Create the R2 bucket `41p-backups` and an R2 API token (Cloudflare dashboard → R2 → Manage API tokens), then
    set `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` in step 9's Environment Variables.
13. Nothing to configure for backups either: `infra/docker-compose.yml` includes a `backup` service that runs
    `infra/backup.sh` on its own nightly schedule (03:00 UTC) inside a small container, rather than relying on a
    Coolify Scheduled Task — see the comment above the `backup` service in that file for why. Once step 9's R2
    variables are set, it works without further setup. Confirm it after the first deploy:
    `docker compose -f infra/docker-compose.yml logs backup` should show `[backup] scheduler started`.
14. Push to `main`; confirm the staging deploy runs and `curl https://staging.41prompts.ai/healthz` returns the
    current commit's sha. Push a `v0.0.1-test` tag; confirm the production deploy and
    `curl https://app.41prompts.ai/healthz`.
15. Follow `infra/RUNBOOK.md`'s restore drill once, end to end, and record the time in that file.
16. Read this file top to bottom once, start to finish, exactly as written, and confirm every step above matched
    what the Coolify UI actually showed. Fix anything that drifted — this file only stays useful if it matches
    reality the next time someone (including future-you) runs it.

## Why some things are the way they are

- **`postgres`, `web`, and its published ports are bound to `127.0.0.1`, not the open internet.** `ufw` (step 4)
  only allows 22/80/443, but Docker's port publishing bypasses `ufw` by writing directly to iptables. Binding
  published ports to loopback keeps them usable locally (SSH tunnel + `curl localhost`, or `psql` from the box)
  without opening them publicly. Coolify's proxy reaches `web` over the compose network by service name, not
  through the published port, so this doesn't affect routing.
- **No separate `deploy` user.** The existing `ubuntu` user already has sudo and the launch SSH key; hardening
  it (key-only SSH, no root login) is one less user/key/permission set to get wrong than provisioning a new one.
- **The migrate-before-start entrypoint assumes a single `web` replica.** See `infra/RUNBOOK.md`'s note on
  migration concurrency before considering horizontal scale-out.
