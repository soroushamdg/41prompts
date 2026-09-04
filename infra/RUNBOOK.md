# Runbook

Operational procedures for the Lightsail box. `infra/README.md` is the one-time setup; this is what you reach
for afterward.

## Migration concurrency — single web replica is the v1 decision

`apps/web/Dockerfile`'s entrypoint runs `drizzle-kit migrate` before `next start`. `drizzle-kit` records applied
migrations in its own table but isn't designed for two instances to race on applying the same pending migration
concurrently. This setup runs exactly **one** `web` container (`infra/docker-compose.yml` has no
`deploy.replicas` on `web`, and horizontal scale-out is explicitly out of scope for this epic) — that's what
makes the migrate-before-start entrypoint safe as written. If a future epic scales `web` to more than one
replica, revisit this: either move the migration to a separate one-shot job step that runs before any replica
starts, or wrap the `drizzle-kit migrate` call in a Postgres advisory lock so only one of the racing containers
actually applies migrations while the others wait.

## Restore drill

Run this after first setup, and periodically after (record the time each run).

1. Confirm you have a recent backup key: check the R2 bucket (`41p-backups`, prefix `postgres/`) via the
   Cloudflare dashboard, or `docker compose --project-directory . -f infra/docker-compose.yml exec backup aws --endpoint-url
   https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com s3 ls s3://41p-backups/postgres/`.
2. Start timing.
3. Run the restore into a scratch database (never the real one):
   `docker compose --project-directory . -f infra/docker-compose.yml run --rm backup ./restore.sh postgres/<the-key>.dump`
4. Confirm the row counts printed at the end look right for what you expect to be in the backup.
5. Stop timing. Record the elapsed time and the date here:

   | Date | Elapsed | Notes |
   |---|---|---|
   | _(fill in after the first real drill)_ | | |

6. The scratch database (`restore_drill_41p`) is left in place for inspection — drop it manually when done:
   `docker compose --project-directory . -f infra/docker-compose.yml exec postgres psql -U <user> -c "DROP DATABASE restore_drill_41p;"`

## Rotate a secret

1. In Coolify, open the resource's **Environment Variables** tab and update the value.
2. Redeploy the affected service (Coolify's **Redeploy** button on the resource) so the container picks up the
   new value — env var changes don't apply to already-running containers.
3. For `POSTGRES_PASSWORD` specifically: changing it in Coolify's env vars does **not** change the actual
   Postgres role password. You also need to run, inside the running `postgres` container:
   `ALTER USER <user> WITH PASSWORD '<new password>';` via `docker compose --project-directory . -f
   infra/docker-compose.yml exec postgres psql -U <user> -c "ALTER USER <user> WITH PASSWORD '...';"` — then
   update `POSTGRES_PASSWORD`/`DATABASE_URL` in Coolify and
   redeploy `web`/`worker`/`backup` so they reconnect with the new password.
4. For provider keys (`ANTHROPIC_API_KEY` etc.): update in Coolify, redeploy `worker` (and `web` if it also
   reads that key).

## Roll back a production deploy

Coolify keeps previous deployments. On the `production` environment's resource: **Deployments** tab → pick the
last known-good deployment → **Redeploy**. Confirm `https://app.41prompts.ai/healthz` returns the sha you
expect afterward.

## The box is down

1. AWS Console → Lightsail → the instance → check its state. If it's stopped, start it; the **automatic daily
   snapshot** (enabled in `infra/README.md` step 1) is the fallback if the instance itself is unrecoverable —
   restore a snapshot into a new instance and re-point the static IP.
2. Once the instance is reachable again: `ssh -i <key> ubuntu@<ip>` and check `docker ps` — if containers aren't
   running, `docker compose --project-directory . -f infra/docker-compose.yml up -d` inside Coolify's project directory (path shown in
   the Coolify UI for the resource) brings them back; Coolify itself should also auto-start on boot (it installs
   as a systemd-managed stack).
3. If Coolify's own UI is unreachable but the containers are healthy, application traffic is unaffected — this
   only blocks new deploys/config changes until Coolify comes back.

## Resize the instance

1. AWS Console → Lightsail → the instance → **Stop** it (brief downtime).
2. On the instance's management page, **Change plan / resize** to the next size up.
3. **Start** the instance again. The static IP, attached storage, and everything Coolify manages persist across
   a resize — no bootstrap re-run needed.
4. Confirm `docker ps` shows all services healthy and `curl https://app.41prompts.ai/healthz` responds before
   considering the resize done.
