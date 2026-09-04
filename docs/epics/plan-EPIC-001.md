# Plan: EPIC-001 Infrastructure

Re-read for this plan: `CLAUDE.md`, `docs/decisions/ADR-001-stack-and-structure.md` (2026-09-04 revision block —
Lightsail ca-central-1, no agent ever holds SSH, allow-list boundaries, model prompts stay proprietary), and
`docs/epics/CURRENT.md` (EPIC-001). Division of labour is absolute: this plan writes files only. It contains no
`ssh`, no key, no secret, and no value for any variable in `.env.example` beyond the three new names it adds.

Repo state checked before planning: `apps/web` has no `output: "standalone"` in `next.config.ts` and does not
declare `@41prompts/db` as a dependency despite `transpilePackages` naming it; `apps/worker/src/main.ts` is the
EPIC-000 stub (`console.log` then `process.exit(0)`) with no long-lived process yet; root `package.json` already
has `db:migrate` → `pnpm --filter @41prompts/db db:migrate` → `drizzle-kit migrate`; `pnpm-workspace.yaml` and
`packageManager: "pnpm@10.25.0"` are already pinned. These facts shape §3–§4 below.

**Corrections from review, applied throughout this revision:** worker becomes a real long-lived process instead
of a documented-but-unfixed restart loop (§1, §3.5); `COMMIT_SHA` falls back to Coolify's `SOURCE_COMMIT` build
arg, no more ⚠ on that step (§2, §5); `bootstrap.sh` hardens the existing `ubuntu` user rather than creating a
separate `deploy` user (§1); the backup trigger mechanism is chosen at implementation time between a Coolify
scheduled task and a compose `backup` service, documented either way (§2, §5); `infra/RUNBOOK.md` states the
single-web-replica assumption behind the migration entrypoint (§4.3); image size is accepted for now with a
report note about Playwright's future weight (§3.4).

---

## 1. File list

Every file this epic touches, one line each. **New** unless marked **modified**.

### `infra/`

| File | Purpose |
|---|---|
| `infra/README.md` | Full runbook for Soroush: exact commands and Coolify console clicks, first-timer level. |
| `infra/bootstrap.sh` | Idempotent Ubuntu 24.04 hardening (existing `ubuntu` user: key-only SSH, sudo) + Docker + Coolify install, run once from Soroush's terminal. |
| `infra/docker-compose.yml` | `postgres` / `web` / `worker` service definitions Coolify deploys as one resource, plus a `backup` service **if** that's the chosen trigger — see §2. |
| `infra/backup.sh` | Nightly `pg_dump`, upload to R2 via AWS CLI, prune >30 days, non-zero exit on any failure. |
| `infra/restore.sh` | Restores a named R2 dump into a scratch database, prints row counts. |
| `infra/RUNBOOK.md` | Restore drill (timed), rotate a secret, roll back a deploy, box-down procedure, resize instance, single-web-replica migration note. |

### `apps/web/`

| File | Purpose |
|---|---|
| `apps/web/Dockerfile` | Multi-stage build (prune → install → build → runner); migrate-before-start entrypoint; `HEALTHCHECK`. |
| `apps/web/app/healthz/route.ts` | Returns `{ ok: true, sha, env }` from build-time env (`COMMIT_SHA`, `DEPLOY_ENV`). |
| `apps/web/package.json` **(modified)** | Adds `@41prompts/db` as a dependency — see §3.3, required for the migrate step to resolve inside the pruned image. |

### `apps/worker/`

| File | Purpose |
|---|---|
| `apps/worker/Dockerfile` | Multi-stage build (prune → install → build → runner), non-root, process-liveness `HEALTHCHECK`. |
| `apps/worker/src/main.ts` **(modified)** | Long-lived process: log `"worker up"`, log a heartbeat every 60 s, exit 0 cleanly on `SIGTERM`/`SIGINT`. No pg-boss, no queue — see §3.5. |
| `apps/worker/src/index.ts` **(modified)** | Drops the `process.exit(0)` that made `main()` a one-shot call. |
| `apps/worker/src/main.test.ts` **(modified)** | Covers the heartbeat interval and clean-shutdown-on-signal behaviour. |

### `.github/`

| File | Purpose |
|---|---|
| `.github/workflows/deploy.yml` | On `v*` tag push: creates a GitHub Release from the tag's notes. No deploy logic — Coolify deploys itself. |

### Root (modified, not new)

| File | Purpose |
|---|---|
| `.env.example` **(modified)** | Adds `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DEPLOY_ENV` — every var the compose file's `env_file` reads that isn't there yet. |
| `.dockerignore` **(new, not in the epic's list — justified below)** | Excludes `node_modules`, `.next`, `.turbo`, `dist`, `.git`, `coverage`, `sdks/python/.venv`, `.env*` from the build context. Without it, `COPY . .` in the `pruner` stage sends every local `node_modules` tree to the Docker daemon on every build — slow and pointless, since `turbo prune` only reads `package.json`/lockfile/source. Flagging this explicitly since it's not in the epic's file list: it's a direct, minimal consequence of the Dockerfile strategy the epic does ask for, not scope creep.

No other file is created. `apps/web/next.config.ts` is deliberately **not** touched — see §4.0.

---

## 2. `infra/docker-compose.yml` — exact service definitions

```yaml
services:
  postgres:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "127.0.0.1:5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 10
      start_period: 10s

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
      args:
        COMMIT_SHA: ${COMMIT_SHA:-${SOURCE_COMMIT:-unknown}}
    restart: unless-stopped
    env_file: .env
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "127.0.0.1:3000:3000"

  worker:
    build:
      context: .
      dockerfile: apps/worker/Dockerfile
    restart: unless-stopped
    env_file: .env
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  postgres_data:
```

Notes on choices that aren't obvious from the epic text alone:

- **`build.context: .`** (repo root, not `apps/web/`). Both Dockerfiles need the whole monorepo to run
  `turbo prune`. Coolify, given this compose file directly, builds each service from the context/dockerfile pair
  declared here — nothing extra to configure per service in its UI beyond pointing it at this file.
- **`127.0.0.1:3000:3000` and `127.0.0.1:5432:5432`, not bare `3000:3000`.** `ufw` (from `bootstrap.sh`) only
  allows 22/80/443, but Docker's `-p`/`ports:` publishing writes directly to iptables' `DOCKER-USER` chain and
  **bypasses ufw** — a published `3000:3000` would be reachable from the public internet regardless of the
  firewall rules, which contradicts "web exposes 3000 to Coolify's proxy only." Binding to `127.0.0.1` keeps the
  port reachable from `localhost` (satisfying the epic's own verification command,
  `curl -s localhost:3000/healthz`, run on the same box) while closing it to the outside world. Coolify's Traefik
  proxy doesn't need the published port at all — it reaches `web:3000` over the compose network by service name,
  same as `postgres:5432` is reached by `web`/`worker`. This is called out again in `infra/README.md` (§5) so
  Soroush understands why it's not a bare `3000:3000` if he goes looking.
- **`DATABASE_URL` is set twice, deliberately.** `.env.example`/`.env` carries the `localhost`-hostname form for
  running `apps/web`/`apps/worker` directly with `pnpm dev` (no Docker). Inside compose, `web`/`worker`'s
  `environment:` block overrides it to the `postgres`-hostname form, built from the same `POSTGRES_*` vars
  `postgres`'s own `environment:` uses — one source of truth for user/password/db name, two derived connection
  strings for the two run modes. Compose merges `env_file` first, `environment:` second, so the override wins.
- **Only `postgres` gets a compose-level `healthcheck:`.** The epic's compose bullet only asks for one on
  `postgres`, and it's the only one anything `depends_on: condition: service_healthy`. `web` and `worker` each
  get their own `HEALTHCHECK` baked into their Dockerfile (§3) — Coolify/Docker read that directly; nothing in
  compose needs to depend on it, so it isn't redeclared here.
- **`image: postgres:16`, not `-alpine`.** Epic text names `postgres:16` exactly; keeping the glibc build is also
  the more boring, fewer-surprises choice for a database image.
- **`COMMIT_SHA: ${COMMIT_SHA:-${SOURCE_COMMIT:-unknown}}`.** Coolify exposes the deployed commit as
  `SOURCE_COMMIT` for git-based builds. The outer `${COMMIT_SHA:-...}` lets a local `docker compose up` override
  it explicitly (`COMMIT_SHA=abc123 docker compose ... up`) for testing the healthz route without a real Coolify
  deploy; in Coolify itself, `COMMIT_SHA` is normally unset in `.env`, so it falls through to `SOURCE_COMMIT`,
  which Coolify sets automatically — no manual "Build Variables" step required. If implementation finds the
  installed Coolify version names this differently, the actual variable name is documented in `infra/README.md`
  (§5 step 10) instead of guessed here.
- **A fourth service, `backup`, may or may not exist here** — decided at implementation time (§5 step 13). If the
  installed Coolify version supports a scheduled task against a compose resource, `infra/backup.sh` is invoked
  that way and this file stays three services. If it doesn't, a `backup` service is added here: same image as
  `worker` (it needs nothing `worker` doesn't — `pg_dump` reachable via the `postgres` hostname, R2 credentials
  from `.env`), overriding `command` to a `while true; do sleep <until next 03:00>; infra/backup.sh; done` style
  loop rather than a cron daemon, since a shell loop is one less package to install. Whichever is chosen, the
  choice and the reason land in this file's own comments and in `infra/README.md`.

---

## 3. Dockerfile strategy

### 3.1 Shared shape

Both Dockerfiles are four stages: `base` → `pruner` → `builder` → `runner`. This is the standard
Turborepo-in-Docker pattern (`turbo prune --docker`), chosen because it's the one that composes cleanly with pnpm
workspaces and gives good layer caching (dependency install layer only invalidates when `out/json` — package.json
and lockfile — changes, not on every source edit).

| Stage | Base image | Does |
|---|---|---|
| `base` | `node:22-alpine` (matches `.nvmrc`/`engines.node`) | `corepack enable` so the pinned `pnpm@10.25.0` from root `package.json` activates automatically the first time `pnpm` runs — no separate `corepack use` line needed. |
| `pruner` | from `base` | `COPY . .`, then `pnpm dlx turbo@2.10.12 prune <pkg> --docker`. Pinned to the exact version in root `package.json`'s `turbo` devDependency (`^2.10.12`) so `--docker`'s output shape can't drift from what the workspace actually resolves. |
| `builder` | from `base` | Installs from `out/json` only (`pnpm install --frozen-lockfile` — cache layer), then overlays `out/full` and runs `pnpm turbo run build --filter=<pkg>`. |
| `runner` | from `base` | `COPY --from=builder --chown=node:node /app .` (the whole pruned, built workspace — see §3.4 for why this isn't slimmed to prod-only deps), `USER node` (alpine's `node` image ships this user/group at uid/gid 1000 already — no `useradd` needed), `HEALTHCHECK`, then the start command. |

`web`'s target is `@41prompts/web`, `worker`'s is `@41prompts/worker`.

### 3.2 `apps/web/Dockerfile` — intended content

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable
WORKDIR /app

FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2.10.12 prune @41prompts/web --docker

FROM base AS builder
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
ARG COMMIT_SHA=unknown
ENV COMMIT_SHA=$COMMIT_SHA
ENV DEPLOY_ENV=production
RUN pnpm turbo run build --filter=@41prompts/web

FROM base AS runner
ENV NODE_ENV=production
ARG COMMIT_SHA=unknown
ENV COMMIT_SHA=$COMMIT_SHA
COPY --from=builder --chown=node:node /app .
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
ENTRYPOINT ["sh", "-c", "echo '[entrypoint] running database migrations' && pnpm --filter @41prompts/db db:migrate && echo '[entrypoint] migrations complete, starting web' && exec pnpm --filter @41prompts/web start"]
```

`libc6-compat` is the one Alpine package Next.js's native bits (image optimisation, SWC) commonly need; it isn't
needed in `apps/worker/Dockerfile` so it's omitted there. `COMMIT_SHA` is declared as both a build `ARG` and an
`ENV` in the `runner` stage (not just `builder`) so it's baked into that final image layer and present at
container-run time regardless of what `.env`/compose `environment:` supplies — it cannot be silently overridden by
a runtime env file, which is what "from build-time env" in the epic means. `DEPLOY_ENV` in the `builder` stage is
a placeholder default; the real per-environment value (`staging` vs `production`) comes from Coolify's
environment variables for that resource (§5) and reaches the container via `.env`/`env_file`, which — since
Docker `ENV` only sets a *default*, not a lock — a container-level env var of the same name legitimately
overrides. That asymmetry is intentional: `COMMIT_SHA` must never drift from what was actually built, `DEPLOY_ENV`
must be settable per Coolify environment without rebuilding the image.

### 3.3 `apps/web/package.json` — the one dependency addition

`apps/web`'s current `package.json` (read before writing this plan) lists `next`, `react`, `react-dom`,
`tailwindcss`, `@tailwindcss/postcss` — no workspace package, even though `next.config.ts` already names
`@41prompts/ui` and `@41prompts/core` in `transpilePackages`. `turbo prune @41prompts/web --docker` only pulls in
workspace packages that are *declared dependencies* of the pruned target. The entrypoint above runs
`pnpm --filter @41prompts/db db:migrate`, which requires `packages/db` to exist inside the pruned/installed
image — it won't, unless `@41prompts/db` is a declared dependency of `apps/web`. So this plan adds:

```json
"dependencies": {
  "next": "^16.3.4",
  "react": "^19.2.8",
  "react-dom": "^19.2.8",
  "tailwindcss": "^4.3.3",
  "@tailwindcss/postcss": "^4.3.3",
  "@41prompts/db": "workspace:*"
}
```

This isn't scope creep: ADR-001 already states `packages/db` is "shared by web and worker," web is the service
CLAUDE.md's rule 8 and this epic's migrate-before-start step assign the migration responsibility to, and without
this line the entrypoint cannot resolve the workspace filter — the container would fail on every boot with
`ERR_PNPM_NO_MATCHING_PACKAGE`. `apps/worker/package.json` is left untouched: nothing in this epic's scope has
worker running migrations, so worker doesn't need the dependency yet.

### 3.4 Why the runner stage keeps devDependencies (no prod-only prune)

`drizzle-kit migrate` (the command behind `pnpm --filter @41prompts/db db:migrate`) lives in `packages/db`'s
`devDependencies`. A conventional "slim" final image would run a second `pnpm install --prod` pass to drop
devDependencies before copying into `runner`. Doing that here would make the migrate step fail at container start
— exactly the thing this epic exists to make reliable. So `runner` copies the full `builder` output, dev
dependencies included. The cost is a larger image on a single 4 GB box that isn't image-registry-constrained;
given ADR-001's stated preference for boring over clever, that trade is taken deliberately rather than building a
separate migration-only image or a compiled JS migrator — both of which are real alternatives but add moving
parts this epic doesn't need yet. Noting this explicitly for the report/review, since it's a judgement call, not
something the epic text dictates either way. **Forward note for the report:** this is accepted only for the
current image contents. When Playwright arrives (EPIC-003), its browser binaries must never be installed into
this image — they're a test-time dependency, not a runtime one, and would push the image well past what "boring"
justifies. If the image crosses roughly 1 GB before then for any other reason, the tech-debt fix is a dedicated
migrate-only image/stage instead of a full-devDependencies runner, which this note flags but does not build now.

### 3.5 `apps/worker/Dockerfile` — intended content, and the worker process fix

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2.10.12 prune @41prompts/worker --docker

FROM base AS builder
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo run build --filter=@41prompts/worker

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder --chown=node:node /app .
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD pgrep -f "apps/worker/dist/index.js" || exit 1
CMD ["node", "apps/worker/dist/index.js"]
```

`pgrep` is process-liveness, not application-liveness — the honest option available, since worker has no HTTP
port to probe. Alpine's busybox ships `pgrep`, so no extra package is needed.

**Worker process fix (correction from review).** `apps/worker/src/main.ts` was the EPIC-000 stub —
`console.log("worker up")`, then `apps/worker/src/index.ts` called `process.exit(0)` right after. Under
`restart: unless-stopped` that's a crash-restart loop, and "docker compose up brings up ... worker" isn't
satisfied by a container that's perpetually restarting. This plan now makes `main()` long-lived, minimally —
no pg-boss, no queue, exactly what's needed to be a steady process:

```ts
export function main(): void {
  console.log("worker up");

  const heartbeat = setInterval(() => {
    console.log(`worker heartbeat ${new Date().toISOString()}`);
  }, 60_000);

  const shutdown = (signal: NodeJS.Signals): void => {
    console.log(`worker received ${signal}, shutting down`);
    clearInterval(heartbeat);
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
```

`apps/worker/src/index.ts` drops its `process.exit(0)` call — `main()` now returns having registered the
interval and the signal handlers, and Node's event loop stays alive on the pending timer, which is exactly what
keeps the process up without an explicit "run forever" loop. `docker stop` (and Coolify's own restart/redeploy
path) sends `SIGTERM` first, so `next start`-container-parity is kept: both processes exit cleanly and quickly on
the signal Docker actually sends, rather than needing a `SIGKILL` after the grace period. `HEALTHCHECK`'s `pgrep`
check now reflects a genuinely-running process rather than papering over one that keeps dying. Test coverage
(`apps/worker/src/main.test.ts`) uses fake timers to assert the heartbeat log fires on the 60 s interval and that
both `SIGTERM` and `SIGINT` clear the interval and call `process.exit(0)` exactly once.

---

## 4. The migrate-before-start entrypoint

### 4.0 Why `next.config.ts` is not touched

The more common Docker pattern for Next.js is `output: "standalone"`, copying only `.next/standalone` +
`.next/static` + `public` into the runner for a minimal image. This plan doesn't use it: the entrypoint needs
`pnpm --filter @41prompts/db db:migrate` to run *inside the same container* before the app starts, which needs
the pnpm workspace (root `package.json`, `pnpm-workspace.yaml`, `packages/db`) present and installed — the
`standalone` output deliberately strips exactly that. Rather than add a second, differently-shaped image just to
run one migration command, the runner stage keeps the full pruned/installed workspace (§3.4) and runs the app via
`pnpm --filter @41prompts/web start`, i.e. plain `next start`. Simpler mechanism, one image shape, matches the
"boring" bias — the trade is a bigger image, accepted for the same reason as §3.4.

### 4.1 Mechanism

The entrypoint is a single `sh -c` command chained with `&&`, not a separate script file (kept out of the file
list in §1 deliberately — the epic's scope only names the Dockerfile and the healthz route for `apps/web`, and a
one-line `&&`-chain doesn't earn a second file):

```sh
echo '[entrypoint] running database migrations' \
  && pnpm --filter @41prompts/db db:migrate \
  && echo '[entrypoint] migrations complete, starting web' \
  && exec pnpm --filter @41prompts/web start
```

The first `echo` is the log line the acceptance criterion asks for ("a log line proves order") — it appears in
container logs strictly before the migration runs, and the second `echo` appears strictly after, both strictly
before `next start`'s own log lines, because `sh` executes the chain left to right and `&&` only proceeds on a
zero exit.

### 4.2 How it fails safely

- **`&&`, not `;` or a `run-then-ignore` pattern.** If `drizzle-kit migrate` exits non-zero — unreachable
  database, a bad migration file, a permissions error — the chain stops immediately. `exec ... next start` never
  runs. The container process (`sh`, as PID 1) exits with that same non-zero code. The web app is never started
  against a database that isn't at the schema version the code expects — it simply doesn't come up.
- **`exec` on the final step**, so once migrations succeed, `next start` replaces the shell as PID 1 (correct
  signal handling for `docker stop`/Coolify's restarts) rather than running as a child the shell has to babysit.
- **Two independent layers of protection against racing an unready database.** In compose, `web` already has
  `depends_on: postgres: condition: service_healthy` (§2) — the entrypoint doesn't even start until `pg_isready`
  passes. The entrypoint's own `&&`-chain is the second layer, covering the case a healthy-but-freshly-created
  database still fails a migration for a real reason (bad SQL, a lock, an unexpected existing row) rather than
  simple unavailability.
- **No traffic ever reaches a half-migrated schema.** Assuming Coolify's default deploy behaviour gates traffic
  switchover on the new container's `HEALTHCHECK` passing (its documented default for zero-downtime deploys, one
  of the two items flagged for verification in §7) — a failed migration means the new container never becomes
  healthy, so the previous, already-migrated container keeps serving until the problem is fixed and redeployed.
  This is Coolify's behaviour to confirm at implementation time, not something this Dockerfile alone can
  guarantee — flagged here rather than asserted as fact.

### 4.3 Migration concurrency — single replica is the v1 decision

`drizzle-kit migrate` records applied migrations in its own migrations table and is not designed to have two
instances race to apply the same pending migration concurrently — two `web` containers starting at once (a
Coolify redeploy that briefly runs old-and-new side by side, or a future horizontal scale-out) could both see the
same migration as pending and both attempt it. This plan does not add locking around the migrate step; it accepts
a single `web` replica as the v1 constraint instead, which is already what `infra/docker-compose.yml` describes
(no `deploy.replicas` on `web`, and this epic's "Out of scope" list already excludes multi-instance). This is
recorded as an explicit line in `infra/RUNBOOK.md`, not left implicit, so a future epic that considers scaling
`web` horizontally has to revisit the migration strategy (e.g. a dedicated migrate-only job step, or an advisory
lock around the `drizzle-kit migrate` call) rather than silently inheriting a race.

---

## 5. `infra/README.md` — ordered steps for Soroush

Written as a sequential runbook; each step names the exact Coolify screen. One of these screen names/behaviours
(marked ⚠) I can't confirm without a running Coolify instance and will verify/correct in `infra/README.md` itself
during implementation rather than assert with false confidence here.

1. **AWS Console → Lightsail → Create instance.** Region **Montréal (ca-central-1)**, platform Linux/Unix,
   blueprint **OS Only → Ubuntu 24.04 LTS**, plan **4 GB RAM / 2 vCPU / 80 GB SSD** or larger. On the instance's
   **Networking** tab: attach a **static IP**. On **Snapshots**: enable **automatic daily snapshots**.
2. **Networking tab, firewall rules**: allow only **22 (SSH)**, **80 (HTTP)**, **443 (HTTPS)**. Do not open 8000
   (Coolify's own UI) — it's reached only via SSH tunnel in step 5.
3. **DNS** (registrar or Cloudflare): `A` records for `41prompts.ai`, `app.41prompts.ai`, `staging.41prompts.ai`
   → the static IP from step 1. If using Cloudflare: proxy **off** (grey cloud) until Coolify issues TLS in step
   7, then switch it **on**.
4. **From your terminal**, run the bootstrap once:
   `ssh -i <lightsail-key> ubuntu@<static-ip> 'bash -s' < infra/bootstrap.sh`
   It's idempotent — safe to re-run if it's interrupted. It prints the Coolify URL (`http://localhost:8000` on
   the box) when done.
5. **Open a tunnel and reach Coolify's setup wizard:**
   `ssh -i <lightsail-key> -L 8000:localhost:8000 ubuntu@<static-ip>`, then open `http://localhost:8000` in your
   browser. Create the **admin account** (first screen the wizard shows). ⚠ Coolify's own default local server
   should already be registered as the deploy target since Coolify is running on the same box it deploys to — if
   the wizard instead prompts to "Add a Server," confirm it's adding `localhost`/`127.0.0.1`, not a new remote
   host.
6. **Sources → GitHub Apps → Connect** (screen name to confirm against the installed Coolify version — this is
   where a Coolify-managed GitHub App is installed against `soroushamdg/41prompts` so Coolify can pull the repo
   and open deploy-status checks on commits).
7. **Projects → New Project**, name it `41prompts`. Inside it, create two **Environments**: `staging` (tracks
   branch `main`, auto-deploy on push) and `production` (tracks tags matching `v*`).
8. In each environment: **New Resource → Docker Compose**, point it at the connected repo and
   `infra/docker-compose.yml`. Confirm the build context Coolify infers is the repo root (§2 note) — the compose
   file's `build.context: .` should make this automatic.
9. **Environment Variables** tab on the resource: paste in every variable from `.env.example`, filled with real
   values (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL` for local-dev parity, auth/provider
   keys, `R2_*`, `DEPLOY_ENV` set to `staging` or `production` to match the environment). These are **runtime**
   env vars — distinct from the next step.
10. Nothing to configure here for `COMMIT_SHA`: Coolify sets `SOURCE_COMMIT` automatically for git-based builds,
    and `infra/docker-compose.yml`'s build args already fall back to it (§2). Only if the installed Coolify
    version is found at implementation time to expose the commit under a different variable name does this step
    change — the actual name, if different, is documented right here rather than left as an open question.
11. **Domains** tab, `web` service only: set `staging.41prompts.ai` (staging environment) and
    `app.41prompts.ai` (production environment). Leave `worker` and `postgres` without a domain — they're not
    web-facing. Let Coolify issue TLS (Let's Encrypt) once DNS resolves.
12. Create the R2 bucket `41p-backups` and an R2 API token (Cloudflare dashboard), then set
    `R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` in step 9's Environment Variables.
13. **Scheduled Tasks** tab on the resource: add a nightly task running `infra/backup.sh` inside the `web` or a
    dedicated container — pick whichever the installed Coolify version supports for compose-based resources
    (single-container “Applications” have first-class scheduled tasks; compose resources may need the command
    pointed at a specific service — confirm at implementation time).
14. Push to `main`; confirm the staging deploy runs and `curl https://staging.41prompts.ai/healthz` returns the
    current commit's sha. Push a `v0.0.1-test` tag; confirm the production deploy and
    `curl https://app.41prompts.ai/healthz`.
15. Follow `infra/RUNBOOK.md`'s restore drill once, end to end, and record the time in that file.
16. Read `infra/README.md` top to bottom once, start to finish, exactly as written, and confirm every step above
    matched what the Coolify UI actually showed — note any label mismatch back so the doc gets corrected.

---

## 6. Acceptance criteria I cannot meet without server access

Quoted exactly from `docs/epics/CURRENT.md`, each with how it's handed to Soroush:

> After Soroush completes his steps: `curl https://staging.41prompts.ai/healthz` returns the current `main` sha.
> Evidence: output pasted into the report by Soroush.

Requires a live, DNS-resolved, deployed staging instance. Soroush runs the `curl` after step 14 above and pastes
the output into `docs/epics/reports/EPIC-001-report.md`.

> A no-op tag `v0.0.1-test` deploys production; `https://app.41prompts.ai/healthz` returns that sha.
> Evidence: output.

Same dependency, plus creating and pushing a tag that triggers a real production deploy — a "visible to others"
action. I can run `git tag v0.0.1-test && git push origin v0.0.1-test` myself if asked to at the time, once
Soroush confirms staging is healthy, but by default this stays in his step 14 above, alongside the curl.

> Killing the web container in Coolify restarts it within 30 s. Evidence: Coolify log.

Requires the Coolify UI (kill action + log view). Soroush performs it and pastes the log excerpt into the report.

> Nightly backup produced a file in R2; restore drill completed and timed in `infra/RUNBOOK.md`.
> Evidence: bucket listing and the recorded time.

Requires live R2 credentials, a running Coolify scheduled task, and a database to restore into. Soroush runs the
drill per step 15 and records the timing directly in `infra/RUNBOOK.md`, plus an R2 bucket listing in the report.

> `infra/README.md` read top to bottom by Soroush; every console step has a screenshot name or exact menu path.

I write every step with an exact menu path (§5) and, where a real Coolify session would produce one, a named
placeholder for a screenshot Soroush can capture (e.g. `infra/screenshots/coolify-05-new-resource.png`). The
"read top to bottom and confirm it matches" half of this criterion is inherently his to perform (step 16).

Everything else in the acceptance criteria list — `bash -n`/`shellcheck`, `docker compose config` validation,
local `docker compose up` + `curl localhost:3000/healthz`, the entrypoint's log-line ordering, and
`gitleaks detect` — needs no server access and will be run and evidenced directly in the implementation session,
not handed off.

---

## Open items to verify during implementation, not before

- Coolify screen/tab labels marked ⚠ in §5 (GitHub App connection screen name; whether `SOURCE_COMMIT` is really
  what this Coolify version injects) and the scheduled-task-vs-`backup`-service decision (§2, §5 step 13) —
  checked against whatever Coolify version `bootstrap.sh` actually installs, and documented in place rather than
  left as a question.
- Coolify's default deploy behaviour gating traffic on the new container's `HEALTHCHECK` (§4.2) — assumed, not
  yet confirmed against this Coolify version.
