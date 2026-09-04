# EPIC-001 report: Infrastructure

Branch `epic/001-infrastructure`. 2026-09-04.

## Built

Everything in the plan's file list (`docs/epics/plan-EPIC-001.md`), plus the fixes below that implementation
surfaced. Claude Code wrote files only — no `ssh`, no key, no secret held or set at any point.

- **`infra/docker-compose.yml`** — `postgres` (16, named volume, `pg_isready` healthcheck), `web` and `worker`
  (built from their own Dockerfiles, `depends_on: postgres: condition: service_healthy`), and a fourth service,
  **`backup`**, running `infra/backup.sh` on its own nightly (03:00 UTC) schedule via `infra/backup-loop.sh` —
  chosen over a Coolify Scheduled Task because that path is unverifiable without server access; this one is
  fully testable locally, which it now has been.
- **`apps/web/Dockerfile`, `apps/worker/Dockerfile`** — four-stage `turbo prune --docker` builds, non-root
  `USER node`, `HEALTHCHECK` in each. Web's entrypoint runs `pnpm --filter @41prompts/db db:migrate` before
  `next start`, chained with `&&` so a failed migration never lets the app start.
- **`apps/web/app/healthz/route.ts`** — `{ ok, commit, env }`, `force-dynamic` so it's evaluated per request, not
  cached at build time. Field is `commit`, not the `sha` CURRENT.md's Scope literally names — see below.
- **`apps/worker/src/main.ts`** — now a real long-lived process: `"worker up"`, a heartbeat every 60 s, clean
  `process.exit(0)` on `SIGTERM`/`SIGINT`. No pg-boss, no queue, per the correction.
- **`infra/bootstrap.sh`** — hardens the existing `ubuntu` user (key-only SSH, no root login), `ufw` (22/80/443
  only), `fail2ban`, unattended upgrades, 2 GB swap, Docker, Coolify. No separate `deploy` user.
- **`infra/backup.sh`, `infra/backup-loop.sh`, `infra/restore.sh`** — `pg_dump -F c -Z 9` → R2 via `aws s3`
  (AWS CLI v2, installed via apt on the `postgres:16` base image — no `rclone` config file needed), 30-day
  retention; restore into a scratch database, print row counts.
- **`infra/README.md`, `infra/RUNBOOK.md`** — setup runbook with exact Coolify screens (one ⚠ left, see Open
  questions) and the operational procedures the epic asked for, including the migration-concurrency note.
- **`.github/workflows/deploy.yml`** — `v*` tag → GitHub Release via `softprops/action-gh-release@v2`. No deploy
  logic.
- **`.dockerignore`** — not in the epic's file list; added because `COPY . .` in the `pruner` stage otherwise
  sends every local `node_modules` tree into the build context on every build.
- **`packages/db/drizzle/meta/_journal.json`** — also not in the epic's file list; see below, this one wasn't
  optional.

## Skipped (Out of scope, per the epic)

Application schema/auth/UI, Sentry/PostHog/uptime, CDN for artifacts, multi-instance/load balancer, Terraform.

## Bugs found and fixed during implementation

None of these were visible from reading the epic or CLAUDE.md — each one only showed up by actually building the
images and running the stack, which is exactly why the plan's local-verification bar existed.

1. **`turbo prune --docker` doesn't copy `tsconfig.base.json`.** It follows the workspace *dependency graph*
   (package.json → package.json), not a tsconfig's plain-file `extends`. Every build failed with `TS5083: Cannot
   read file '/app/tsconfig.base.json'` until I added an explicit `COPY --from=pruner /app/tsconfig.base.json
   ./tsconfig.base.json` to both Dockerfiles.
2. **`docker compose -f infra/docker-compose.yml` alone is broken.** Compose resolves `build.context`,
   `env_file`, and its own default `.env` lookup relative to the *compose file's directory* (`infra/`), not the
   caller's cwd, unless `--project-directory` says otherwise. Every verification command in this report, in
   `infra/RUNBOOK.md`, and in `infra/README.md` step 8 (Coolify's own "Base Directory" field) now says so
   explicitly. This is a real deviation from the epic's own literal verification text
   (`docker compose -f infra/docker-compose.yml config`), which I'm flagging rather than silently "fixing" the
   epic text — the corrected form is `docker compose --project-directory . -f infra/docker-compose.yml config`,
   run from the repo root.
3. **`packages/db/drizzle/` didn't exist.** `schema.ts` is EPIC-000's intentional empty stub, and nobody had run
   `drizzle-kit generate` yet, so there was no `meta/_journal.json` for `drizzle-kit migrate` to read. It failed
   with a bare `Exit status 1` — no underlying error text surfaces through `pnpm`'s wrapper here, so this took a
   few rounds of bypassing `pnpm` to call `drizzle-kit` directly before the real cause (`ENOENT`-shaped, on a
   missing journal) became provable. Fixed by running `pnpm --filter @41prompts/db db:generate` once and
   committing the resulting (still-empty) `packages/db/drizzle/meta/_journal.json` — this is the one file outside
   `infra/`, `apps/web`, `apps/worker`, `.github` this epic touches, and it was load-bearing for the acceptance
   criterion, not optional.
4. **`apps/web/package.json` never had a `start` script.** `next build`/`next dev` existed; `next start` did
   not, so the entrypoint's `pnpm --filter @41prompts/web start` failed with "None of the selected packages has a
   'start' script." Added `"start": "next start"`.
5. **The restore drill's scratch database name, `41p_restore_drill`, is invalid SQL.** An unquoted Postgres
   identifier starting with a digit parses as a numeric literal — `psql` failed with `trailing junk after numeric
   literal at or near "41p_restore_drill"`. Renamed to `restore_drill_41p` in `infra/restore.sh` and
   `infra/RUNBOOK.md`.
6. **The web runner re-downloaded pnpm from npm's registry on every fresh container start.** `corepack enable`
   alone doesn't fetch pnpm; the builder stage triggers that fetch the first time it runs `pnpm install`, but the
   *runner* stage never invokes `pnpm` until the entrypoint does, at container start, over the network — slow,
   and a needless runtime dependency on npm's registry for a production deploy. First fix
   (`corepack prepare pnpm@10.25.0 --activate` as root in the `base` stage) didn't work: the cache landed under
   `/root/.cache`, but the runner runs as `USER node`, whose `$HOME` is `/home/node` — a different path, so the
   runtime user "missed" the build-time cache and fell back to fetching anyway. Fixed with a fixed,
   user-independent `ENV COREPACK_HOME=/opt/corepack` (world-readable) set before `corepack prepare` in `base`,
   confirmed by a clean rebuild showing no `Corepack is about to download` line at container start.

## `sha` vs `commit` — a CLAUDE.md/epic conflict, flagged rather than silently resolved

`docs/epics/CURRENT.md`'s Scope literally specifies `apps/web/app/healthz/route.ts: returns { ok: true, sha,
env }`. CLAUDE.md's ADR-003 vocabulary section forbids `sha` "in UI strings, schema, or code identifiers" with no
exception — unlike `assertion` and `artifact`, which the same list marks `(UI only)`, meaning their type/code
identifier is explicitly still allowed. No acceptance criterion depends on the literal JSON key name (the AC only
checks that the sha value round-trips through a live curl), so I implemented the field as **`commit`** instead of
`sha`, per CLAUDE.md's "these instructions OVERRIDE any default behavior... follow them exactly as written," and
left `docs/epics/CURRENT.md` untouched (it's in the "never touch" list). `COMMIT_SHA` as an **environment
variable / build arg name** is unchanged — that's the name your own correction #2 specified, and env vars are
SCREAMING_SNAKE_CASE ops naming, not the application-source "code identifiers" ADR-003 is about. Worth a decision
next time `CURRENT.md` is touched: either the vocabulary rule gets an infra/ops carve-out (matching the
`assertion`/`artifact (UI only)` pattern), or the healthz field name in the epic text gets corrected to `commit`.

## Other deliberate choices worth flagging

1. **Backup trigger: a compose `backup` service, not a Coolify Scheduled Task**, per your instruction to choose
   at implementation time. Built with Compose Spec's `dockerfile_inline` (no extra Dockerfile file) plus one new
   file, `infra/backup-loop.sh` (sleeps until 03:00 UTC, calls `backup.sh`, logs failure but keeps looping rather
   than crash-looping on one bad night). `postgres:16`'s Debian base turned out to already have `awscli` in apt
   at a current v2 (2.23.6) — better than the v1 I'd expected, no `--endpoint-url` compatibility concerns.
2. **`apps/web/package.json` gained `@41prompts/db` as a real dependency** (not just the `start` script fix
   above), per plan §3.3 — `turbo prune` only includes workspace packages that are declared dependencies of the
   pruned target, and the entrypoint's `pnpm --filter @41prompts/db db:migrate` needs `packages/db` present in
   the image.
3. **`softprops/action-gh-release@v2`** in `deploy.yml` — one new dependency needing a reason per the Definition
   of Done: it's the standard, widely-used community action for creating a GitHub Release from a tag; writing the
   equivalent GitHub API call by hand for a two-line job wasn't worth it.
4. **Verified end-to-end locally**, not just built: full `docker compose up`, `curl localhost:3000/healthz` →
   `{"ok":true,"commit":"unknown","env":"development"}`, the migration log-line ordering, worker's heartbeat and
   clean `SIGTERM` shutdown, and the restore-drill SQL logic (`pg_dump` → `pg_restore` → row-count query) against
   the real local `postgres` container — everything except the actual R2 upload/download hop, which needs real
   credentials only Soroush has. Also confirmed the fail-safe path directly: pointed the entrypoint at a wrong
   `DATABASE_URL` and watched it exit 1 before ever printing "starting web."
5. **Killing `web` locally via `docker kill` did not trigger an automatic restart**, even with
   `restart: unless-stopped` set (confirmed via `docker inspect`). This is correct, standard Docker behavior —
   `unless-stopped` treats an explicit `kill`/`stop` as user-intent, not a crash, and doesn't restart it — not a
   bug in the compose file. It's also why this AC stays with Soroush: Coolify's own "restart" action in its UI is
   almost certainly not a bare `docker kill`, so this needs verifying against what Coolify itself does, not what
   raw Docker does.

## Open questions

- The one remaining ⚠ in `infra/README.md` (step 6, the exact GitHub Apps connection screen name) — everything
  else that was uncertain (`COMMIT_SHA`/`SOURCE_COMMIT`, the backup trigger, Base Directory) got resolved by your
  corrections or by a decision made and documented in this session.
- The `sha`/`commit` naming conflict above — needs a call from you next time `CURRENT.md` is touched.
- Coolify's default deploy behavior gating traffic switchover on the new container's `HEALTHCHECK` passing
  (plan §4.2) is still unconfirmed against a real Coolify instance — I have no way to verify this without server
  access.
- **Image size, for the future**: keeping devDependencies in the runner is accepted for now (plan §3.4). When
  Playwright arrives (EPIC-003), its browser binaries must not be installed into this image — they're a
  test-time dependency, not a runtime one. If the image crosses roughly 1 GB before then for any other reason,
  the tech-debt fix is a dedicated migrate-only image/stage instead of a full-devDependencies runner.
- `infra/docker-compose.yml`'s `dockerfile_inline` for the `backup` service needs a Compose Spec-aware Docker
  Compose version (v2.17+); not something I can verify against whatever ships with Coolify's own bundled Docker
  without server access, though it's been the default on any reasonably current Docker install since mid-2023.

## Verification (run in this session, all green)

```
$ bash -n infra/bootstrap.sh infra/backup.sh infra/backup-loop.sh infra/restore.sh
OK (all four)

$ shellcheck infra/*.sh
(no output — clean)

$ docker compose --project-directory . -f infra/docker-compose.yml config
(no output — valid; see "bugs found" #2 above for why --project-directory is required)

$ docker compose --project-directory . -f infra/docker-compose.yml build
 Image 41prompts-v2-web Built
 Image 41prompts-v2-worker Built
 Image 41prompts-v2-backup Built

$ docker compose --project-directory . -f infra/docker-compose.yml up -d && sleep 20 && curl -s localhost:3000/healthz
{"ok":true,"commit":"unknown","env":"development"}

$ docker ps --format "table {{.Names}}\t{{.Status}}"
41prompts-v2-web-1        Up 20 seconds (healthy)
41prompts-v2-worker-1     Up 20 seconds (healthy)
41prompts-v2-backup-1     Up 20 seconds
41prompts-v2-postgres-1   Up 25 seconds (healthy)

$ docker logs 41prompts-v2-web-1
[entrypoint] running database migrations
...
[✓] migrations applied successfully!
[entrypoint] migrations complete, starting web
▲ Next.js 16.3.4
✓ Ready in 155ms

$ docker logs 41prompts-v2-worker-1
worker up
worker heartbeat 2026-09-04T13:41:01.437Z
worker heartbeat 2026-09-04T13:42:01.435Z
...

$ docker stop -t 10 41prompts-v2-worker-1 && docker logs 41prompts-v2-worker-1 | tail -1 && docker inspect --format='ExitCode={{.State.ExitCode}}' 41prompts-v2-worker-1
worker received SIGTERM, shutting down
ExitCode=0

# entrypoint fails safely: wrong DATABASE_URL, "starting web" never printed, container exits 1
$ docker compose ... run --rm -e DATABASE_URL=postgres://41p:wrong@postgres:5432/nonexistent web sh -c "..."
[entrypoint] running database migrations
... ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL ...
CONTAINER_EXIT=1

$ pnpm lint && pnpm typecheck && pnpm test
Tasks: 7 successful, 7 total   (lint, incl. depcruise + turbo boundaries)
Tasks: 7 successful, 7 total   (typecheck)
Tasks: 7 successful, 7 total   (test)

$ gitleaks detect --source .
11 commits scanned, no leaks found
```

Restore logic (`pg_dump` → `pg_restore` → row-count query) verified against the real local `postgres` container,
skipping only the R2 hop (needs real credentials):

```
$ pg_dump "$DATABASE_URL" -F c -Z 9 -f /tmp/test.dump && pg_restore -l /tmp/test.dump | head -5
; Archive created ...; TOC Entries: 12; Compression: gzip
PG_DUMP_ROUNDTRIP_OK

$ psql "$scratch_url" -c "SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY relname;"
      table_name      | row_count
----------------------+-----------
 __drizzle_migrations |         0
RESTORE_LOGIC_OK
```

Local port note: my dev machine already has an unrelated `postgres:17-alpine` container (`rileyhost-postgres-1`)
bound to host port 5432. All `up`/`build` runs above used a local-only compose override
(`ports: !override []` on `postgres`) to avoid the collision — this is a machine-specific testing detail, not a
change to `infra/docker-compose.yml` itself, which still publishes `127.0.0.1:5432:5432` as designed.

## Acceptance criteria

- [x] `bash -n infra/bootstrap.sh` passes; `shellcheck` clean on all scripts. Evidence above.
- [x] `docker compose -f infra/docker-compose.yml config` validates locally. Evidence above (with the
      `--project-directory .` correction documented).
- [x] Local `docker compose up` (with a local `.env`) brings up postgres, web, worker; `curl
      localhost:3000/healthz` returns `ok: true`. Evidence above — worker now also comes up steady (heartbeat,
      no restart loop), an improvement over what the plan flagged as a known limitation.
- [x] Web container entrypoint runs migrations before start (a log line proves order). Evidence above.
- [ ] **Handed to Soroush — `infra/README.md` step 16.** `infra/README.md` read top to bottom by Soroush; every
      console step has a screenshot name or exact menu path.
- [x] **Amended, per `docs/epics/CURRENT.md`'s "F2 outcome".** `curl https://staging.41prompts.ai/healthz`
      returns HTTP 200, `ok: true`, `env: staging`, over a valid certificate. The `commit` field is a known
      defect, moved to EPIC-008 — see the Follow-up section below.
- [ ] **Handed to Soroush — `infra/README.md` step 14.** A no-op tag `v0.0.1-test` deploys production;
      `https://app.41prompts.ai/healthz` returns HTTP 200 and `env: production`. (`commit` is EPIC-008's
      criterion, not this epic's.) (I can push the tag myself once asked, at that time — see plan §6.)
- [ ] **Handed to Soroush — live Coolify UI action, after `infra/README.md` step 14; no dedicated numbered setup
      step covers this specifically.** Killing the web container in Coolify restarts it within 30 s.
- [ ] **Handed to Soroush — `infra/README.md` step 13 (setup) and step 15 (the drill itself).** Nightly backup
      produced a file in R2; restore drill completed and timed in `infra/RUNBOOK.md`.
- [x] `gitleaks detect` on the repo finds nothing. Evidence above.
- [x] This report and `docs/epics/sessions/EPIC-001-session.md` written.

---

## Follow-up (2026-09-04)

Branch `epic/001-followup`, merged as PR #3 (five commits: `aa513ce` F1, `d2c70a9` F2, `2f21d55` F3, `b01f6a5` a
test-coverage fixup for F2, `8551301` F4), plus one closeout commit on a second branch recording F2's actual
outcome and handing the deferred criterion to EPIC-008. Full detail, including every server command run and its
approval status, is in `docs/epics/sessions/EPIC-001-session.md`'s Follow-up session section — this is the
summary.

### Human-half evidence (staging, live at time of writing)

Container status (`ssh 41p-box docker ps`, read-only):

```
NAMES                                            STATUS
backup-pboa5wxrnggay30epiq0pmzd-211242720321     Up 14 minutes
worker-pboa5wxrnggay30epiq0pmzd-211242717413     Up 14 minutes (healthy)
web-pboa5wxrnggay30epiq0pmzd-211242712167        Up 14 minutes (healthy)
postgres-pboa5wxrnggay30epiq0pmzd-211242702541   Up 14 minutes (healthy)
```

`curl -s https://staging.41prompts.ai/healthz`, after PR #3 merged, staging auto-deployed, and Soroush confirmed
`GET /api/v1/applications/.../envs` no longer lists `SOURCE_COMMIT` or `COMMIT_SHA` at all (read-only, both
locked variables gone — the compose-file half of F2 worked):

```
{"ok":true,"commit":"unknown","env":"staging"}
```

Still `unknown` — see "F2 outcome" below for why this is now closed as deferred rather than chased further. The
running container's environment, filtered to just these two keys (nothing else printed, per rule 7):

```
COMMIT_SHA=unknown
```

`SOURCE_COMMIT` is absent entirely (not even set to `unknown`) — Coolify injects no usable commit into this
compose deployment's build or runtime, contrary to what reading `ApplicationDeploymentJob.php` predicted.

TLS: the exact `coolify-proxy` log line for this domain's original certificate issuance has since rotated out of
the container's log buffer, so verified independently instead — `curl -vI https://staging.41prompts.ai/healthz`:

```
subject: CN=staging.41prompts.ai
issuer: C=US; O=Let's Encrypt; CN=YR2
SSL certificate verify ok.
HTTP/2 200
```

What *is* still in the live proxy log, and became directly relevant to F3's Domains fix: repeated `ERR Unable to
obtain ACME certificate for domains` for `www.staging.41prompts.ai` (`NXDOMAIN` — no DNS record for that host),
recurring every renewal attempt because the staging application's `redirect` field is `both` (confirmed via
`GET /api/v1/applications/{uuid}`). This is the exact failure `infra/README.md`'s Domains step now documents,
observed directly rather than inferred.

### What F1–F3 changed

- **F1** — Claude Code may now reach the box over SSH and the Coolify API, under `infra/ACCESS.md`'s rules
  (`CLAUDE.md` carries the same six — now seven, after F3 — rules).
- **F2** — root cause of the *locked-variable* half of `commit: unknown`, confirmed by reading Coolify's own
  deployment-job source on the box: any `${VAR}` anywhere in `infra/docker-compose.yml` becomes a permanently
  locked application environment variable whose stored value Coolify re-feeds into the build every deploy.
  Removed the `web.build.args` block entirely — confirmed fixed, the locked variables are gone. `apps/web/
  Dockerfile`'s `ARG` renamed to `SOURCE_COMMIT`; `apps/web/app/healthz/route.ts` falls back to `SOURCE_COMMIT`
  when `COMMIT_SHA` is the `unknown` placeholder — this part is correct and stays, but on staging today neither
  variable carries a real commit, so `healthz` still reads `unknown`. See "F2 outcome" below: closed as deferred
  to EPIC-008, not fixed end to end.
- **F3** — runbook corrections found while following it: `POSTGRES_PASSWORD` generation (`openssl rand -hex 24`,
  why, and both the drop-volume and `ALTER USER` rotation paths), Coolify UI access via
  `https://coolify.41prompts.ai` with the tunnel as documented fallback, the GitHub App screen name, the Base
  Directory caveat removed (confirmed working), a narrower initial Environment Variables list with a warning
  about Coolify's `${VAR}`-locking behavior, the Domains `redirect` field (read from the API, not guessed — see
  above), a bootstrap.sh comment, and a new "Web container restart loop" runbook section.

### F2 outcome: closed as deferred, not fixed

The compose half of F2 worked — removing every `${...}` reference stopped Coolify from creating locked
variables, confirmed via `GET /api/v1/applications/.../envs` and a filtered `docker inspect`. The other half
didn't: Coolify injects no usable commit into a Docker Compose deployment's build or runtime, so `commit` is
still `unknown` on staging. Two hours went into reading Coolify's source and testing theories against a real
deploy; the source doesn't distinguish the Nixpacks/Railpack path from the compose path clearly enough to keep
going, and every further attempt costs a full deploy cycle.

**Decision (Soroush's call, recorded in `docs/epics/CURRENT.md`'s "F2 outcome"):** stop investigating Coolify's
internals for this. The `.git/HEAD`-in-build-context workaround that was the epic's own fallback option would
just get deleted a week later by **EPIC-008 Prebuilt images**, which moves the build to GitHub Actions, passes
`github.sha` as `--build-arg SOURCE_COMMIT` explicitly, and makes the value certain rather than inferred.
EPIC-008 is pulled to the front of the backlog (`docs/backlog.md`, `docs/roadmap.md`) and now owns this
criterion. What's kept from F2 as merged: the healthz fallback logic (correct, and will work the moment a real
`SOURCE_COMMIT` is actually supplied), the compose file's comment explaining the locking behavior, and F3's
runbook corrections.

### Two secret exposures this session (full account in the session log)

Both happened during F2's diagnosis, before rule 7 existed; both were disclosed immediately and rotated before
continuing. (1) A Coolify API token fragment, caused by `infra/setup-access.sh` (advisor-written) writing an
unquoted Sanctum-format token (`<id>|<random>`) into `~/.41prompts/staging.env` — the literal `|` was parsed as a
shell pipe when the file was `source`d. Fixed (script now single-quotes values), token rotated by Soroush. (2)
Staging `POSTGRES_PASSWORD`, caused by this session running `docker inspect --format '{{json .Config.Env}}'`
unfiltered. Password rotated by Soroush (Coolify variable changed, data volume dropped, redeployed). `infra/ACCESS.md`
and `CLAUDE.md` rule 7 (F3) exists because of both.

### Open items still owed by Soroush

- **`commit` on `/healthz`**: no longer an action item here — owned by EPIC-008 (`docs/epics/CURRENT.md`), which
  builds images in GitHub Actions with `github.sha` passed explicitly, sidestepping Coolify's build/runtime
  injection entirely.
- **Domains `redirect` fix**: set staging's Direction to non-www (`infra/README.md` step 11) to stop the recurring
  ACME failure shown above; repeat for the production resource once it exists.
- **Production environment + `v0.0.1-test`**: not yet created — original epic's production acceptance criteria
  are still open.
- **R2 bucket + backup evidence**: R2 bucket/token setup (`infra/README.md` step 12) and a file actually landing
  in it are still unconfirmed.
- **Restore drill**: not yet run/timed in `infra/RUNBOOK.md`.
- **Kill-container test**: killing `web` in Coolify's UI and confirming a restart within 30s is still unconfirmed
  against real Coolify behavior (only plain `docker kill` was tested locally, in the original epic).
