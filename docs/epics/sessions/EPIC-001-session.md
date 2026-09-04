# EPIC-001 session log

**Date.** 2026-09-04.

**Prompt sent.** Plan for EPIC-001 approved with seven corrections: fix the worker restart loop now (long-lived
process, 60 s heartbeat, clean signal shutdown, no pg-boss); use `COMMIT_SHA: ${COMMIT_SHA:-${SOURCE_COMMIT:-unknown}}`
in the compose build args since Coolify exposes the commit as `SOURCE_COMMIT`; harden the existing `ubuntu` user
in `bootstrap.sh` rather than creating a separate `deploy` user; choose the backup trigger (Coolify Scheduled
Task vs. a compose service) at implementation time and document the choice; note the migrate-before-start
entrypoint's single-web-replica assumption in `infra/RUNBOOK.md`; accept the devDependencies-in-runner image size
for now with a forward note about Playwright; `.dockerignore` approved. Told to update the plan, commit it,
implement on `epic/001-infrastructure` to the Definition of Done, then write the report and session log, marking
every acceptance criterion needing Soroush's steps with the `infra/README.md` step number.

**Plan summary.** Applied all seven corrections to `docs/epics/plan-EPIC-001.md` in place: rewrote §3.5's worker
section with the actual long-lived-process code; changed the compose `COMMIT_SHA` build arg to fall back through
`SOURCE_COMMIT`; updated the `bootstrap.sh` file-list line and dropped the `deploy`-user framing; added a new §2
bullet describing the backup-service-vs-Coolify-scheduled-task decision (deferred to implementation, both paths
sketched); added §4.3 on migration concurrency; added a forward note to §3.4 about Playwright and image size.
Committed as a second commit on the epic branch, then began implementation.

**Decisions made and why.**
- **Backup trigger: a compose `backup` service, not Coolify's Scheduled Task.** The Scheduled Task path is
  entirely unverifiable without server access (not even `docker compose config`-checkable); a compose service is
  infra-as-code I can actually build, run, and verify in this session. Built with Compose Spec's
  `dockerfile_inline` to avoid a second Dockerfile file, plus one new file, `infra/backup-loop.sh`, for the
  scheduling loop — tried embedding the loop directly in compose's `command:` first, hit the `$$`-escaping trap
  (Compose interpolates bare `$var` in the whole file, including inside a `command:` block, before the shell ever
  sees it) and moved it to a real script file instead, which is also just more readable for Soroush.
- **`apps/web/package.json` gained `@41prompts/db`** as a real dependency, not just for the entrypoint to resolve
  the workspace filter (plan §3.3), but because it turned out to also be missing `"start": "next start"` entirely
  — `next build`/`next dev` existed, `next start` never did. Found by actually running the container, not by
  reading the file.
- **Renamed the healthz field from `sha` (CURRENT.md's literal text) to `commit`.** ADR-003 forbids `sha` in code
  identifiers with no UI-only exception (unlike `assertion`/`artifact`, explicitly marked UI-only in the same
  list). No acceptance criterion depends on the literal key name. Left `CURRENT.md` untouched (never-touch list)
  and flagged the conflict in the report rather than resolving it silently in either direction.
- **Scratch database renamed `41p_restore_drill` → `restore_drill_41p`.** The original name is invalid as an
  unquoted Postgres identifier (starts with a digit — `psql` parses it as a numeric literal plus "trailing
  junk"). Found by actually running the restore logic, not by reading `restore.sh`.

**What took longer than expected.**
- **`turbo prune --docker` silently drops `tsconfig.base.json`.** It only follows the package.json dependency
  graph; a tsconfig's `extends` pointing at a plain file outside that graph isn't part of it. First build attempt
  failed with `TS5083`. Fixed by explicitly `COPY`-ing it from the `pruner` stage in both Dockerfiles.
- **`docker compose -f infra/docker-compose.yml` needs `--project-directory .`.** Compose resolves the compose
  file's relative paths and its default `.env` lookup relative to *the compose file's own directory*, not the
  caller's cwd. Without the flag, `build.context: .` silently means `infra/` (wrong — the Dockerfiles need the
  repo root), and `.env` at the repo root is never found for variable substitution. This also has a production
  consequence: Coolify's own "Base Directory" setting for the compose resource has to be the repo root, not
  wherever the compose file lives — documented prominently in `infra/README.md` step 8 since getting this wrong
  breaks the whole deploy, and it's the kind of thing that's easy to click through without noticing.
- **`packages/db/drizzle/` didn't exist**, so `drizzle-kit migrate` failed with a bare, contentless
  `Exit status 1` — no underlying error surfaces through `pnpm`'s wrapper on this failure path. Took several
  rounds of bypassing `pnpm` to invoke `drizzle-kit` directly, then testing `generate` separately, before the
  actual cause (a missing `meta/_journal.json` for `migrate` to read) was provable rather than guessed. Fixed by
  running `db:generate` once and committing the resulting (still-empty, schema is still EPIC-002's job) scaffold
  — the one file outside `infra/`, `apps/web`, `apps/worker`, `.github` this epic ended up needing.
- **The web runner re-fetched pnpm from npm's registry on every fresh container start.** `corepack enable` alone
  doesn't activate a pinned version; the fetch only happens lazily on first `pnpm` invocation, and the runner
  stage never runs `pnpm` until the entrypoint does. First fix attempt (`corepack prepare --activate` as root in
  the `base` stage) didn't work — the cache landed under `/root/.cache`, invisible to the `USER node` the
  container actually runs as (different `$HOME`). Fixed with a fixed `COREPACK_HOME=/opt/corepack`, world-
  readable, so build-time and run-time agree on where to look regardless of which user is active.
- **Sandbox disk space.** Docker Desktop's VM in this environment only has ~8 GB total; repeated rebuilds across
  all the fixes above filled it twice (`ENOSPC` on both `corepack`'s temp dir and, separately, Postgres's own
  lock file). Not a defect in anything shipped — `docker builder prune`/`docker image prune` cleared it each
  time — but worth recording since it's why the verification section shows several build/run cycles rather than
  one straight pass.

**Verification output (tail).** See `docs/epics/reports/EPIC-001-report.md`'s Verification section for the full
transcript. Short form: `shellcheck` clean; `docker compose --project-directory . -f infra/docker-compose.yml
config` valid; all four containers (`postgres`, `web`, `worker`, `backup`) healthy on a clean `up`;
`curl localhost:3000/healthz` → `{"ok":true,"commit":"unknown","env":"development"}`; migration log-line
ordering confirmed in `web`'s logs; worker heartbeat confirmed every 60 s and exits 0 cleanly on `SIGTERM`; the
entrypoint's fail-safe path confirmed directly (wrong `DATABASE_URL` → migrate fails → "starting web" never
prints → container exits 1); `pnpm lint && pnpm typecheck && pnpm test` — `7 successful, 7 total` on every task;
`gitleaks detect` — `11 commits scanned, no leaks found`.

**Open questions.**
- One remaining ⚠ in `infra/README.md` (step 6's exact GitHub Apps connection screen name) — everything else
  that was uncertain in the plan got resolved this session, either by your corrections or by a decision made and
  documented here.
- The `sha`/`commit` naming conflict between CLAUDE.md's ADR-003 and `CURRENT.md`'s literal epic text — needs a
  call from the advisor next time `CURRENT.md` is touched (see report for the full argument either way).
- Coolify's default deploy behavior gating traffic switchover on a new container's `HEALTHCHECK` passing is still
  an assumption, not something verifiable without a live Coolify instance.
- Five of the epic's eleven acceptance criteria are handed to Soroush by design (server/Coolify/DNS access this
  session never had) — each one marked with its `infra/README.md` step number in the report, per your
  instruction.
