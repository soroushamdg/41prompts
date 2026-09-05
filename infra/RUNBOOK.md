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

**Use `docker exec <container-name>` directly, not `docker compose -f infra/docker-compose.yml exec/run`.**
Since EPIC-008, Coolify deploys `infra/docker-compose.{staging,production}.yml` under its own project name (the
application's uuid) — a bare `docker compose -f infra/docker-compose.yml ...` run by hand over SSH computes a
*different* default project name and won't find the real running containers at all. Find the actual container
name first: `docker ps --filter "name=backup-<app-uuid>" --format "{{.Names}}"` (staging's app uuid is
`pboa5wxrnggay30epiq0pmzd`, production's is `d180rye1i9dtab789t9jyjmh` — see `.github/workflows/build-images.yml`
for both).

1. Confirm you have a recent backup key:
   `docker exec <backup-container> sh -c 'export AWS_ACCESS_KEY_ID=$R2_ACCESS_KEY_ID; export AWS_SECRET_ACCESS_KEY=$R2_SECRET_ACCESS_KEY; export AWS_DEFAULT_REGION=auto; aws --endpoint-url https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com s3 ls s3://$R2_BUCKET_BACKUPS/postgres/'`
   (the `export`s matter — `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` are only ever set *inside* `backup.sh`/
   `restore.sh` themselves from the container's real `R2_*` vars, never as container-level env; a bare `aws`
   command run any other way has no credentials and silently falls back to whatever else botocore finds — on
   this box, that turned out to be a real but wrong-for-R2 Lightsail/EC2 instance-metadata credential, surfacing
   as a baffling `Credential access key has length 20, should be 32` that has nothing to do with the R2 token).
2. Start timing.
3. Run the restore into a scratch database (never the real one):
   `docker exec <backup-container> /app/restore.sh postgres/<the-key>.dump`
4. Confirm the row counts printed at the end look right for what you expect to be in the backup.
5. Stop timing. Record the elapsed time and the date here:

   | Date | Environment | Elapsed | Notes |
   |---|---|---|---|
   | 2026-09-05 | staging | 3s | First real drill, run during EPIC-001 closeout. Tiny dump (schema-only, pre-EPIC-002 — just the empty `__drizzle_migrations` table) so this is a lower bound, not representative of restore time once real data exists. |

6. The scratch database (`restore_drill_41p`) is left in place for inspection — drop it manually when done:
   `docker exec <postgres-container> sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS restore_drill_41p;"'`
   (using `$POSTGRES_USER` from the container's own environment this way means the username never has to be
   typed or read by a human/agent running this drill).

## Generating or rotating `POSTGRES_PASSWORD`

**Generate it with `openssl rand -hex 24`, not `openssl rand -base64 24`.** Base64 output can contain `/` and `+`,
both meaningful characters inside a URL — `DATABASE_URL=postgres://user:pass@host/db` breaks silently on them, and
the failure surfaces two layers away as `drizzle-kit migrate` exiting with a bare, contentless `Exit status 1`
(no SQL error, no connection error — just that). Hex output only ever contains `0-9a-f`, so it's always
URL-safe.

If the password needs to change **after** the database has already started once, pick one:

- **DB is still empty / disposable (e.g. right after first setup):** drop the data volume so Postgres
  reinitializes with the new password on next start. Find the project-prefixed volume name first —
  `docker volume ls | grep postgres_data` — then `docker volume rm <that name>`. **Only ever do this when you're
  sure there's nothing in the database yet; it is not reversible.**
- **DB has real data:** change the password on the live role instead — see "Rotate a secret" below, step 3.

## Rotate a secret

1. In Coolify, open the resource's **Environment Variables** tab and update the value.
2. Redeploy the affected service (Coolify's **Redeploy** button on the resource) so the container picks up the
   new value — env var changes don't apply to already-running containers.
3. For `POSTGRES_PASSWORD` on a live database specifically: changing it in Coolify's env vars does **not** change
   the actual Postgres role password. You also need to run, inside the running `postgres` container (find its
   name with `docker ps --filter "name=postgres-<app-uuid>"` — see the note above the restore drill for why a
   bare `docker compose -f infra/docker-compose.yml exec` won't find it):
   `docker exec <postgres-container> psql -U <user> -c "ALTER USER <user> WITH PASSWORD '...';"` — then
   update `POSTGRES_PASSWORD`/`DATABASE_URL` in Coolify and
   redeploy `web`/`worker`/`backup` so they reconnect with the new password. If the database is still empty, the
   drop-the-volume path above is simpler.
4. For provider keys (`ANTHROPIC_API_KEY` etc.): update in Coolify, redeploy `worker` (and `web` if it also
   reads that key).

## Web container restart loop

Diagnose with two commands: `docker ps -a` (is `web` cycling through `Restarting`/`Exited` rather than settling
into `Up ... (healthy)`?) and `docker logs --tail 40 <web-container>` (the entrypoint's own echoed lines show
exactly which step it died on — migration or app start). Two causes seen in practice:

- **Bad characters in `POSTGRES_PASSWORD` breaking `DATABASE_URL` as a URL.** See "Generating or rotating
  `POSTGRES_PASSWORD`" above — regenerate with `openssl rand -hex 24` and follow the empty-DB or live-DB path
  there, whichever applies.
- **Migration failure.** The entrypoint's `[entrypoint] running database migrations` line prints, then the
  container exits before `[entrypoint] migrations complete, starting web` ever appears — `drizzle-kit migrate`
  itself failed. Check `docker logs --tail 40` for the actual SQL/connection error underneath.

## Testing crash recovery (`restart: unless-stopped`)

**`docker kill <container>` does not test this** — found the hard way during EPIC-008. Docker's restart-manager
treats any container stopped through the Docker API (`docker kill` or `docker stop`) as an *intentional* stop
and stands down (`"stopping restart-manager"` in `journalctl -u docker`), because `unless-stopped` means exactly
that: restart unless someone told it to stop. An explicit kill via the API counts as being told.

To actually simulate a crash: find the container's **host PID** (not its container-internal PID) and signal that
directly, bypassing the Docker API entirely:
```
docker inspect --format '{{.State.Pid}}' <container>
sudo kill -9 <that pid>
```
This is a real, unexpected process death from Docker's point of view, so the restart policy engages normally —
`docker ps -a` shows `Restarting (137)` within a couple of seconds, then `Up ... (healthy)` shortly after.

## Roll back a deploy

Since EPIC-008, Coolify never builds — it only pulls `:staging`/`:production` from GHCR, so its own
**Deployments → Redeploy** just re-pulls the *same* tag again, it doesn't go back to an older image. To actually
roll back:

1. GitHub → repo → **Actions → Rollback → Run workflow**. Inputs: `environment` (`staging` or `production`),
   `sha` (the full commit sha to roll back to — it must already exist as `ghcr.io/soroushamdg/41prompts-{web,worker}:sha-<sha>`,
   i.e. a commit `build-images.yml` previously built successfully; check via **Actions → Build images** history
   or `git log` for candidate commits).
2. The workflow retags that sha's images to `:staging`/`:production` with `docker buildx imagetools create` (a
   registry-side copy — no rebuild, no checkout) and then calls the same Coolify deploy webhook
   `build-images.yml` uses.
3. Confirm `curl -s https://{staging.41prompts.ai,app.41prompts.ai}/healthz` (whichever environment) returns the
   sha you rolled back to.

**Timed runs** (drill during EPIC-008 itself — full detail in `docs/epics/reports/EPIC-008-report.md`):

| Date | Environment | From sha → To sha | Elapsed |
|---|---|---|---|
| 2026-09-04 | staging | `772184d` → `b62f12b` | 3m34s |
| 2026-09-04 | staging | `b62f12b` → `772184d` | 2m17s |

### Rotating the GHCR registry PAT

The box authenticates to GHCR with a one-time `docker login ghcr.io` (root, `~/.docker/config.json`) using a
classic PAT scoped `read:packages` — see `infra/README.md`'s "Prebuilt images (EPIC-008)" section for why
Coolify 4.3.17 has no built-in registry credential store to use instead. To rotate: generate a new PAT (GitHub →
Settings → Developer settings → Personal access tokens → Tokens (classic)), then re-run the same `docker login`
command on the box with the new token — it overwrites the stored credential, no restart needed. Revoke the old
PAT on GitHub afterward.

## The box is down

1. AWS Console → Lightsail → the instance → check its state. If it's stopped, start it; the **automatic daily
   snapshot** (enabled in `infra/README.md` step 1) is the fallback if the instance itself is unrecoverable —
   restore a snapshot into a new instance and re-point the static IP.
2. Once the instance is reachable again: `ssh -i <key> ubuntu@<ip>` and check `docker ps` — if containers aren't
   running, Coolify itself should auto-start on boot (it installs as a systemd-managed stack) and redeploy on its
   own. If it doesn't: easiest is pressing **Redeploy** in the Coolify UI once it's back, which reuses Coolify's
   own project name and the correct per-environment file (`docker-compose.staging.yml` /
   `.production.yml` since EPIC-008). Only fall back to a manual `docker compose up -d` from inside Coolify's
   project directory (path shown in the Coolify UI for the resource) as a last resort, and pass `-p <the
   project's uuid-based name, matching what's already in that directory>` — a bare `docker compose -f
   infra/docker-compose.staging.yml up -d` without `-p` computes its own default project name and creates a
   second, separate stack instead of resuming the one Coolify manages (confirmed the hard way during EPIC-001's
   restore-drill session: `docker compose -f infra/docker-compose.yml exec/run` from the repo root never reaches
   Coolify's actual containers at all).
3. If Coolify's own UI is unreachable but the containers are healthy, application traffic is unaffected — this
   only blocks new deploys/config changes until Coolify comes back.

## Resize the instance

1. AWS Console → Lightsail → the instance → **Stop** it (brief downtime).
2. On the instance's management page, **Change plan / resize** to the next size up.
3. **Start** the instance again. The static IP, attached storage, and everything Coolify manages persist across
   a resize — no bootstrap re-run needed.
4. Confirm `docker ps` shows all services healthy and `curl https://app.41prompts.ai/healthz` responds before
   considering the resize done.
