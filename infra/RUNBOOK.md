# Runbook

Operational procedures for the Lightsail box. `infra/README.md` is the one-time setup; this is what you reach
for afterward.

## GitHub Actions budget (EPIC-009)

**Where to read it:** GitHub → Settings → Billing & plans → *Plans and usage* → Actions. Per-run
durations are in the Actions tab; billed minutes are the sum of each **job**, rounded up per job, not
the workflow's wall clock.

**The allowance:** 3,000 minutes a month on Pro for a private repository, since 2026-09-13.
It was 2,000 on Free, and the measurements below from before that date are against 2,000.

**Reproduce the measurement** (the numbers below came from this, not from an estimate):

```sh
gh run list --limit 1000 --json databaseId,name,event,createdAt > runs.json
gh api repos/<owner>/<repo>/actions/runs/<id>/jobs --jq \
  '[.jobs[] | ((.completed_at|fromdateiso8601) - (.started_at|fromdateiso8601))/60 | ceil] | add'
```

### Measured, 2026-09-04 to 2026-09-12 — the repository's first 8.4 days

| workflow | trigger | runs | billed/run | billed total |
|---|---|---:|---:|---:|
| CI | pull_request | 84 | 6.67 | 560 |
| CI | push | 82 | 6.67 | 547 |
| Build images | push | 81 | 6.58 | 533 |
| Compliance | pull_request | 72 | 4.00 | 288 |
| Compliance | push | 59 | 4.00 | 236 |
| Release / Rollback | | 11 | ~1 | 11 |
| | | | **total** | **2,175** |

**2,175 billed minutes in 8.4 days against a 2,000-minute month.** The allowance was gone in about a
week, which stopped every deploy and every CI run.

### Before and after EPIC-009

| | billed minutes |
|---|---:|
| a merge to `main`, before | **17.25** — CI 6.67 + Compliance 4.00 + Build images 6.58 |
| a merge to `main`, after | **10.67** — CI 6.67 + Compliance 4.00 |
| a `v*` tag | **~10.6** — Build images 6.58 + Compliance 4.00 |
| one change end to end, after (PR run + merge run) | **~21.3** |

Removing the image build from `main` saves **480 minutes over that window — 22% of the burn.**

### What this does not fix, which is the number that matters

At ~21.3 minutes a change, the allowance sustains **94 changes a month**. The observed rate over the
measured window was **9.7 merges a day, about 291 a month.**

**So the project remains roughly 3× over its allowance after EPIC-009.** The images were never the
root cause: a per-merge cost multiplied by an unbudgeted merge rate is, and the merge rate is the
dominant term. The next largest item is **CI running twice per change** — on the PR and again on the
merge — which is 1,107 of the 2,175 minutes, 51%. Not changed here (EPIC-009 decision 4 keeps CI, and
after a squash merge the tree only matches the PR's when `main` has not moved), but it is where the
next 500 minutes are.

### Second pass, 2026-09-13 — concurrency cancellation and a documentation path filter

Two changes, both measured **after** shipping rather than estimated before:

1. **Every workflow has a concurrency group keyed on the ref, cancelling in progress** — except on
   `main` and on tags, which are never cancelled. A second push to a branch now kills the first run
   instead of paying for both.
2. **`ci` does not run on a change confined to `docs/**`, `LICENSES/**` or `**.md`.** Compliance
   still does, unfiltered, because `reuse`, `license-gate`, `boundaries-and-forbidden-words` and
   `mirror-dry-run` all check things documentation can break.

The plan is on Pro now (3,000 minutes), so neither change is load-bearing. They are here because the
burn should be lower anyway.

| window, to 2026-09-13 | runs | billed | these two would have saved | |
|---|---|---|---|---|
| **the last ten runs** | 10 | **48 min** | **0 min** | **0%** |
| the last hundred runs | 100 | 499 min | 35 min | 7.0% |

**Both numbers are under 20%, and both changes stay.** That was decided in advance, and the record is
the point rather than a second decision.

**Why the ten-run window shows nothing**, which is the more useful half of the measurement: those ten
are a single afternoon of serial, code-heavy work. Nothing was superseded because each push waited for
the previous run to finish, and no diff was documentation-only because every one of them touched
`.ts`. A sample drawn from one working session measures that session, not the repository. The
hundred-run window is the honest base rate, and even that is 7%.

**What the measurement changed while it was being taken.** The path filter was first built as a
changed-files gate job — fail-safe by construction, and thrown away once measured. GitHub bills every
job **rounded up to a whole minute**, so a fifteen-second gate costs a minute on every run it does not
save: over the same hundred runs it would have saved 19 minutes and cost 36, a net loss of 8.
`paths-ignore` costs nothing because the workflow never starts, and it is fail-safe in the direction
that matters — when GitHub cannot generate a diff, it runs the workflow. **A job is never free. Do not
add a cheap job to decide whether to run an expensive one.**

**One defect found while doing this.** `build-images.yml` already carried
`concurrency: cancel-in-progress: true`, on a workflow triggered only by `v*` tags. A second tag
pushed while the first was still building would have cancelled a release mid-flight, leaving a tag
with no image behind it and a Coolify webhook that never fired. It had never happened — two tags have
never been pushed within six minutes of each other — and it is now `false`.

**Reproduce these two numbers** with the script the epic used, which reads job start and completion
times and rounds each job up:

```sh
gh api "repos/<owner>/<repo>/actions/runs?per_page=100" --jq '.workflow_runs[].id' |
  while read id; do
    gh api "repos/<owner>/<repo>/actions/runs/$id/jobs" --jq \
      '[.jobs[] | select(.started_at and .completed_at) |
        ((.completed_at|fromdateiso8601) - (.started_at|fromdateiso8601))/60 | ceil | if . < 1 then 1 else . end] | add'
  done | paste -sd+ - | bc
```

Note that `actions/runs/<id>/timing` reports `total_ms: 0` for this repository and cannot be used.

### When to look

**At the close of every epic.** A number nobody looks at is the same as no number — which is exactly
how this went unnoticed: EPIC-008's report said to watch the budget and nobody did, including the
advisor, who asked for a tag per ruling and never asked the number again.

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

## Deploying by hand (EPIC-009, 2026-09-13)

Press **Deploy on the application**, never the project-level Deploy. The project-level button fans out
to every resource in the project: one press on 2026-09-13 started a staging deployment and a production
deployment eight seconds apart, and production was down for 38 seconds for nothing. Production's
`is_auto_deploy_enabled: false` does not protect against this — it guards the git trigger, not the
button.

**Every deploy currently drops the apex for about half a minute**, on both environments, because there
is one replica and the router switches before the new container serves. Measured 2026-09-13: staging
≤ 32 s, production ≤ 38 s, `503` on both the apex and the `app.` host. Expect it; do not deploy
production during anything that matters. Fixing it is open work, not a runbook step.

Timings from the same day, for expectation-setting: an on-box staging build is **about nine and a half
minutes** end to end (the `web` image is roughly five of it); a production image pull is about four.

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

## Drizzle Studio against staging or production (EPIC-004)

Studio is a local dev tool that opens a browser UI against whatever `DATABASE_URL` it's given —
it is never deployed on the box, and no database port is ever reachable from the internet (both
compose files bind postgres to `127.0.0.1` only). To point it at a real environment from your own
machine, tunnel that loopback port out over SSH first.

**Production contains real user data.** Treat every row you see as someone's actual account.
Close the tunnel the moment you're done (step 4) — leaving it open is the only way this becomes a
standing risk instead of a five-minute one.

1. Ask Soroush, once, to create a **read-only** Postgres role (see "Creating the read-only role"
   below) — use it instead of the app's own role whenever the query is just "look at the data."
   Studio can still edit rows through the app role if you genuinely need to fix something by hand;
   that's a mutating action and gets the one-command-one-yes treatment like any other.
2. Open the tunnel, staging or production (ports per `docs/epics/reports/EPIC-008-report.md`'s
   port map — staging's postgres is `5432` on the box, production's is `5433`, chosen precisely so
   both can run on one Lightsail instance without colliding):
   ```
   ssh -L 5432:127.0.0.1:5432 41p-box        # staging
   ssh -L 5433:127.0.0.1:5433 41p-box        # production
   ```
   Leave this running in its own terminal — it's your tunnel, not a background job to forget about.
3. In a second terminal, point Studio at the forwarded port through the read-only role and start
   it (`packages/db`'s `drizzle.config.ts` reads `DATABASE_URL`):
   ```
   DATABASE_URL="postgres://readonly_studio:<password>@localhost:5432/<db>" \
     pnpm --filter @41prompts/db db:studio
   ```
   (`5433` and production's db name for that environment.) It opens `local.drizzle.studio` in your
   browser, proxying queries through your own local process — no data leaves your machine except
   through your own screen.
4. **Close the tunnel when done:** `Ctrl+C` the `ssh -L ...` from step 2 (or `kill` it if it's
   backgrounded). Studio itself has nothing to reach once the tunnel is gone.

### Creating the read-only role (one-time, mutating — needs Soroush's yes)

Run inside the running `postgres` container (`docker exec <postgres-container> psql -U <user> -d
<db>` — see the restore drill above for finding the container name):
```sql
CREATE ROLE readonly_studio LOGIN PASSWORD '<generate with: openssl rand -hex 24>';
GRANT CONNECT ON DATABASE <db> TO readonly_studio;
GRANT USAGE ON SCHEMA public TO readonly_studio;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_studio;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO readonly_studio;
```
The last line matters as much as the grant itself: without it, a table added by a later migration
starts with no grant at all, and Studio silently can't read it until this is re-run. Store the
generated password the same way any other secret is stored (`~/.41prompts/`, never the repo).

## Proving the Sentry pipeline (EPIC-004)

Both triggers refuse to run in production (`DEPLOY_ENV === "production"`) — dev and staging only.

- **Web**: `curl https://staging.41prompts.ai/dev/throw` (a real route,
  `apps/web/app/dev/throw/route.ts`; 404s instead of throwing in production).
- **Worker**: no HTTP server to hang a route off, so it's a one-off script instead
  (`apps/worker/src/dev-throw.ts`), run inside the deployed container — a `docker exec` command,
  which is mutating per `infra/ACCESS.md` rule 3 and needs a yes shown against the exact command
  before running it, same as any other:
  ```
  docker exec <worker-container> node --import tsx/esm apps/worker/src/dev-throw.ts
  ```
  Find `<worker-container>` with `docker ps --format "{{.Names}}"` (staging's is
  `worker-pboa5wxrnggay30epiq0pmzd-*`, the suffix changes on every redeploy). Exits `1` either
  way — refused-in-production and successfully-fired-and-flushed both count as "this script's job
  was to not exit cleanly." `docker logs <worker-container>` shows the JSON log line either way;
  the actual Sentry issue needs a look at the `41prompts-worker` project itself (no read-scoped
  Sentry credential is ever held here — see `infra/ACCESS.md`'s "Who").

In both cases: confirm the resulting Sentry issue is tagged with `environment: staging` and a
`release` matching the deployed commit (`curl .../healthz` on the same host, same moment, gives
you that commit to compare against).

## An alert fired, what now (EPIC-004)

1. **Sentry issue:** open it, read the environment and release tags first — they tell you
   staging vs. production and the exact deployed commit before you read a single stack frame.
   Check whether it's new or a recurrence (event count, first/last seen). Cross-reference with
   `docker logs --tail 100 <web-or-worker-container>` around the same timestamp for the JSON log
   line carrying the same request id (web) or job id (worker) — that line has the method/path/
   status or job name the issue alone doesn't.
2. **Uptime alert (`/healthz` down):** check `docker ps` first — is the container actually down,
   or is it `Up (healthy)` and the check itself is the problem (DNS, TLS, a transient network
   blip)? If the container is unhealthy or restarting, see "Web container restart loop" and "The
   box is down" above. If `/healthz` is genuinely fine and the alert was a false positive, don't
   silently ignore a repeat — three or more in a week against one host is worth adjusting the
   monitor's retry/timeout settings, not just re-acknowledging each one.
3. **Decide severity:** a Sentry issue with a handled error and no user-facing symptom can wait
   for the next normal working session. A `/healthz` outage or an unhandled error on a hot path
   (sign-in, a paying user's action once billing exists) gets fixed now, following whichever
   runbook section above matches the actual cause once found — this section is triage, not a fix.
4. **Once resolved:** resolve the Sentry issue (or let it auto-resolve on the next release if the
   fix is already shipped) and note anything genuinely new about the failure mode in this file, the
   way every other section here started as one incident.

## Resize the instance

1. AWS Console → Lightsail → the instance → **Stop** it (brief downtime).
2. On the instance's management page, **Change plan / resize** to the next size up.
3. **Start** the instance again. The static IP, attached storage, and everything Coolify manages persist across
   a resize — no bootstrap re-run needed.
4. Confirm `docker ps` shows all services healthy and `curl https://app.41prompts.ai/healthz` responds before
   considering the resize done.

## Generating or rotating the provider-key master key (EPIC-043)

`KEY_ENCRYPTION_SECRET` is what decrypts every provider key a user has stored. It is an environment
value in Coolify and it is in no repository, no image and no database — `docs/security/byo-key-threat-model.md`
finding 1 is why.

**Generate one.** From a checkout, so the encoding is the one the code reads rather than one somebody
guessed:

```
node -e 'import("./packages/db/src/sealed-box.ts").then(m => console.log(JSON.stringify(m.generateMasterKey(), null, 2)))'
```

or, with `tsx` available (`npx tsx -e '…'`), the same call. It prints three values:

| field | where it goes |
|---|---|
| `secret` | `KEY_ENCRYPTION_SECRET` in Coolify, on `web` and `worker` |
| `publicKey` | `KEY_ENCRYPTION_PUBLIC_KEY`, only on a deployment that has split the two halves |
| `keyId` | nothing — write it down. It is how you recognise which rows are on which key. |

**Do not print it into a terminal that is being recorded, and do not paste it into a chat window.**
`CLAUDE.md` server-access rule 7 already forbids an unfiltered env dump; this is the same value.

### Rotating it, with nothing unreadable in between

`KEY_ENCRYPTION_SECRET` takes a **comma-separated list**. The first entry seals; any entry opens. So:

1. Generate a new key. Set `KEY_ENCRYPTION_SECRET=<new>,<old>` in Coolify. Redeploy `web` and `worker`.
   Everything still opens; everything written from now on is sealed under the new key.
2. Re-seal the rows still on the old key. Find them with
   `select id, owner, provider, key_id from provider_keys where key_id <> '<new key id>';` — and note
   that re-sealing needs each row's plaintext, so it is an `openStoredProviderKey` followed by a
   `putProviderKey`. There is no job for this yet (threat model §8, row `043b`); with a handful of
   rows, do it by hand.
3. **Wait 30 days before destroying the old key.** The nightly dump in R2 is kept 30 days, and a dump
   taken before step 1 is sealed under the old key. Destroying it earlier makes those backups
   unrestorable — which is the same thing as losing the data.
4. Then set `KEY_ENCRYPTION_SECRET=<new>` alone and redeploy.

**If the old key is already gone**, the affected rows cannot be recovered. `openStoredProviderKey`
says so in words — *"no master key with id … is configured"* — rather than reporting a decryption
failure, so this case is distinguishable from corruption. The remedy is to delete those rows and ask
those people to add their key again. Say that, rather than leaving a page that fails silently.

## A provider key may have been exposed (EPIC-043)

**This is the incident where the damage lands on somebody who is not us and only they can stop it.**
`docs/security/byo-key-threat-model.md` is the model; this is what to do at 3am.

### The order, and why it is this order

**1. Revoke at the provider — or tell the owner to. First, before anything else.**

It is the only step that stops the money. Everything below can proceed while it is happening. If the
exposure is of one person's key, tell that person and give them the provider's revocation URL; if it
is of the store as a whole, tell everyone who has a key stored, because each of them has to revoke
their own.

Do **not** wait to finish an assessment first. A key revoked unnecessarily costs somebody five
minutes; a key left live while an assessment is written costs them whatever it is used for.

**2. Contain.**

- If the master key may have leaked: rotate it (section above), and treat **every** stored key as
  exposed. There is no way to tell which rows an attacker read — threat model finding 4, no audit
  row exists yet.
- If a single key leaked through a log or an error report: find it, and delete it from wherever it
  landed. In Sentry that means deleting the issue, not resolving it. In PostHog it means the event.
  In Coolify's container logs it means the log.
- Take the affected surface out of service if it is still leaking. A page that is still writing keys
  into stdout is worse than a page that is down.

**3. Work out the blast radius, and write it down as you go.**

- Which keys — one row, or the table? `select owner, provider, key_id, created_at, rotated_at from
  provider_keys;` with the read-only role (see "Drizzle Studio against staging or production").
- Which window — from when to when was the exposure live?
- Where did it reach — our logs only, or a third party (Sentry, PostHog, R2, Cloudflare)? A key that
  reached a third party has to be treated as public.
- **How was it found?** Write this down before it is forgotten; it is what tells you whether the
  detection worked or whether you were lucky.

**4. Notify.**

- **The people whose keys they are, immediately and directly.** This is not a legal obligation and it
  is the most important notification in this list, because they are the only ones who can revoke.
  `/legal/security` promises exactly this in as many words; do not make that page a lie.
- **Law 25 (Québec), if personal information is involved.** A provider key on its own is a
  credential, not personal information — but it is stored against a `users` row, and an exposure that
  reached the row reached an email address. Where a *confidentiality incident* presents a **risk of
  serious injury**, s.3.5 of the Act requires notification to the **Commission d'accès à
  l'information** and to each person concerned, **promptly** ("avec diligence"). The factors for
  assessing serious injury are the sensitivity of the information, the anticipated consequences, and
  the likelihood it will be used for a harmful purpose — a spendable credential scores badly on all
  three, so assume notification is required unless there is a positive reason it is not.
- **Law 25's register, which is the part that gets forgotten.** s.3.8 requires a **register of
  confidentiality incidents** covering **every** incident, including ones that did not require
  notification, kept for **5 years** after the day we became aware. Keep it at
  `docs/incidents/confidentiality-register.md` — one row per incident: date we became aware, date or
  period of the incident, a description of the personal information concerned, a brief description of
  the circumstances and of the cause if known, what was done to reduce the risk of injury, and whether
  the CAI and the people concerned were notified. **Write the row even when the answer to the last
  one is "no, because the risk was not serious".** An empty register after an incident is itself a
  finding.
- **PIPEDA (federal), for the same event.** A *breach of security safeguards* that creates a **real
  risk of significant harm** must be reported to the **Office of the Privacy Commissioner of Canada**
  and to affected individuals **as soon as feasible**. PIPEDA also requires a **record of every**
  breach of security safeguards — not only reportable ones — kept **24 months**. The same register row
  satisfies both; note in it which regimes were engaged.
- **Nobody else, yet.** No customer DPA exists (EPIC-071, `deferred`). If one ever does, its
  notification clock goes in this list.

**5. Then fix the cause, and only then.**

Add the shape to `packages/logger/src/scrub.ts` if a pattern missed it. Add the test that would have
caught it. Write `docs/incidents/<date>-<slug>.md` the way `2026-09-13-production-outage.md` is
written — what happened, what the evidence actually said, and what was believed that was not true.

### What to check first, because it is usually one of these

```
# Did a key shape reach the container logs at all?
ssh 41p-box 'docker logs --since 72h <web-container> 2>&1 | grep -cE "sk-ant-|sk-proj-|AIza"'
```

A non-zero count is the incident. A zero is not proof of absence — it is proof that this shape, in
this window, in this container, did not appear — so check the worker too, and remember that Sentry and
PostHog are separate places with their own retention.

**The redaction is a safety net, not a permission.** If this section is being read because a key
reached a log, the first question is which call site logged it, not which pattern missed it.
