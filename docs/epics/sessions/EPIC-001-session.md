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

---

## Follow-up session (2026-09-04)

**Prompt sent.** Execute Follow-up F1 → F2 → F3 → F4 on `epic/001-followup` off `origin/main`, one commit each,
per `docs/epics/CURRENT.md`'s Follow-up section. Server access (F1) applies from the first command: `41p-box` /
`~/.41prompts/staging.env`, read-only by default, mutating commands need a one-line reason and a yes. Plan first
into `docs/epics/plan-EPIC-001-followup.md`, approved with four amendments (fold the pre-existing advisor doc
edits into F1 as-is; F2's diagnosis order — Coolify API deployment log first, `docker inspect`/`docker history` as
corroboration; F2's exact five-step acceptance sequence, not done at merge; F3's www-router setting must be read
from the API, not invented).

**F1 (commit `aa513ce`).** `infra/ACCESS.md` (rules verbatim + human setup steps), matching `CLAUDE.md` **Server
access** section, a link from `infra/README.md`, `.gitignore` entries for `infra/*.env` and `.41prompts/`. Folded
in the pre-existing uncommitted edits to `docs/decisions/ADR-001-stack-and-structure.md`, `docs/epics/CURRENT.md`,
and `docs/epics/EPIC-001-infrastructure.md` (the ADR revision and the Follow-up section itself), per amendment 1 —
committed as-is, not edited further. `gitleaks detect`: clean. No server access needed for this commit.

**Security incident 1 — Coolify API token fragment exposed, cause: an advisor bug, not mine.** First read-only
attempt at F2 (`source ~/.41prompts/staging.env` to get `COOLIFY_API_TOKEN` for a Coolify API call) failed: the
shell tried to execute part of the token as a bare command, and the "command not found" error — visible in my own
tool output — contained a large fragment of the token. Reproduced once more under plain `bash` to rule out a
zsh-snapshot quirk (same fragment, confirming it wasn't a fluke). Root cause, confirmed by Soroush: Coolify's
Sanctum tokens are formatted `<id>|<random>`; `infra/setup-access.sh` (new file, written by the advisor, not by
this session) wrote the token unquoted into `~/.41prompts/staging.env`, so the literal `|` in the token was parsed
as a shell pipe when the file was `source`d — first stage (`COOLIFY_API_TOKEN=<id>`) ran as an assignment-only
subshell and was discarded, second stage (`<random>`) ran as a bare command and produced the "not found" error
that leaked it. The advisor fixed `setup-access.sh` to single-quote values. Soroush rotated the token and
rewrote/verified `~/.41prompts/staging.env`. Going forward this session reads the file with
`grep '^KEY=' file | cut -d= -f2- | sed "s/^'//; s/'$//"` — plain text extraction, never `source` — confirmed
working against the rotated token (HTTP 200 from the Coolify API on the first real call).

**Security incident 2 — staging `POSTGRES_PASSWORD` exposed, cause: this session's own error.** Immediately after
the token issue, ran `docker inspect <web-container> --format '{{json .Config.Env}}'` as F2's corroboration step
and printed the *entire* env array unfiltered — including `POSTGRES_PASSWORD` in the clear and `DATABASE_URL` with
it embedded. `docker inspect` is allowed read-only under `infra/ACCESS.md` rule 2; dumping it unfiltered into
visible output is not, and this one is squarely on me, not a tool or file bug. Flagged immediately. Soroush rotated
`POSTGRES_PASSWORD` (changed the Coolify variable, dropped the postgres data volume since the staging DB was still
empty, redeployed) rather than the live-DB `ALTER USER` path, since nothing needed preserving yet.

**Policy change from both incidents.** Added rule 7 to `infra/ACCESS.md` and `CLAUDE.md` (F3): never output
`Config.Env`, `.env` contents, or a Coolify API body unfiltered — select named keys with `--format`, `jq`, or
`grep` before anything reaches the transcript. `docs/decisions/ADR-001-stack-and-structure.md` also gained an
"Incident log" line under the access-policy revision recording both exposures and rotations (written directly in
the working tree, not by this session — committed as-is alongside F2, matching how the other pre-existing advisor
edits were handled in F1).

**F2 diagnosis (read-only, per amendment 2/this session's correction after the incidents).** Coolify's
`GET /api/v1/deployments/{uuid}` does not return the build log for our token: Coolify gates the `logs` field
behind `read:sensitive` scope specifically because deployment logs can contain secrets, and per policy this token
is never granted that scope. No elevated-scope token was requested or used. Instead, per Soroush's redirected
order: (a) `docker exec coolify grep/sed -n` (read-only under rule 2) against Coolify's own
`app/Jobs/ApplicationDeploymentJob.php` inside the `coolify` container — found the exact mechanism: any `${VAR}`
anywhere in `infra/docker-compose.yml` becomes a locked application environment variable whose *stored* value
Coolify re-feeds into the build as that build arg every deploy, and separately, Coolify unconditionally injects a
real `SOURCE_COMMIT` onto the *running container* at deploy time whenever no such variable exists for that key.
(b) `docker history --no-trunc`, filtered with `grep`, on the deployed web image corroborated it: `ARG
COMMIT_SHA=unknown` and a separate, Coolify-injected `ARG SOURCE_COMMIT` (no default) both present as layers.
Full command list and each one's read-only/approval status: `curl GET /api/v1/applications` (read-only, no
approval — found the staging application's uuid), `curl GET /api/v1/deployments` (read-only, empty — endpoint
lists only in-progress deployments), `curl GET /api/v1/deployments/applications/{uuid}` (read-only — found the two
past deployment uuids), `curl GET /api/v1/deployments/{uuid}` (read-only — confirmed no `logs` field for this
token's scope), `ssh 41p-box docker ps` / `docker inspect --format` (filtered) / `docker history --no-trunc`
(filtered) / `docker exec coolify grep -n` / `docker exec coolify sed -n` — all read-only under rule 2, none
needed Soroush's approval, none were logged as mutating.

**F2 fix (commit `d2c70a9`).** `infra/docker-compose.yml`: removed the `web.build.args` block entirely (no
`${...}` text left for Coolify to lock). `apps/web/Dockerfile`: `ARG COMMIT_SHA` renamed to `ARG SOURCE_COMMIT`
(matches Coolify's own injected name) in both `builder` and `runner` stages. `apps/web/app/healthz/route.ts`:
commit resolution now treats `COMMIT_SHA=unknown` as a sentinel, not a real value, and falls back to
`SOURCE_COMMIT` (a plain `??` would never have reached the fallback, since `COMMIT_SHA` is always *set*). Verified
locally: `docker compose ... build --build-arg SOURCE_COMMIT=$(git rev-parse HEAD) web` built clean,
`pnpm turbo run typecheck --filter=@41prompts/web` passed, and the built image's baked `COMMIT_SHA` (checked via
filtered `docker inspect ... | grep -i commit`, not an unfiltered dump this time) matched `git rev-parse HEAD`
exactly. `infra/README.md` step 10 rewritten with the diagnosis and the exact five-step post-merge acceptance
sequence from amendment 3 (merge → staging redeploys, commit may still read `unknown` → delete the two locked
variables in Coolify's UI → Redeploy → `healthz` now matches). **Not yet verified end to end** — that needs the
merge, the variable deletion, and a redeploy, done and checked in F4.

**F3 (commit `2f21d55`).** Read the Domains `redirect` field for real rather than guessing its name, per amendment
4: `GET /api/v1/applications/{uuid}` (read-only) showed `redirect: both` on the live staging resource; the valid
enum (`www` / `non-www` / `both`) came from `docker exec coolify grep` against `app/Models/Application.php` on the
box (same read-only pattern as F2's diagnosis). Confirmed the failure mode this causes is real, not theoretical:
`docker logs coolify-proxy`, filtered, shows repeated `ERR Unable to obtain ACME certificate for domains` for
`www.staging.41prompts.ai` (`NXDOMAIN`) recurring on every renewal attempt. Added rule 7 to `infra/ACCESS.md` and
`CLAUDE.md` (never output `Config.Env`/`.env` contents/a Coolify API body unfiltered — select named keys first),
referenced and committed `infra/setup-access.sh` (advisor-written, already fixed to single-quote values,
`shellcheck` clean) as the one-command form of F1's human setup steps. Runbook corrections: `POSTGRES_PASSWORD`
generation (`openssl rand -hex 24`, why, both the drop-volume and `ALTER USER` paths), Coolify UI access rewritten
to `https://coolify.41prompts.ai` with the tunnel as documented fallback, GitHub App screen name corrected, the
Base Directory "not yet confirmed" caveat removed (confirmed against the real deploy), Environment Variables step
narrowed with a warning about Coolify's `${VAR}`-locking (the same mechanism F2 fixed), Domains section documents
the `redirect` finding above, one missing `bootstrap.sh` comment added (`ssh.service`/`ssh.socket` naming — the
fallback itself and the other two F3 bootstrap notes were already on `main` from prior `fix(infra)` commits), new
"Web container restart loop" runbook section. `shellcheck infra/*.sh`: clean.

**F4.** Report (`docs/epics/reports/EPIC-001-report.md`) updated with human-half evidence gathered read-only this
session (container status table, current — still-`unknown` — healthz output, TLS confirmed independently via
`curl -vI` since the original proxy issuance log line had rotated out of the buffer, the live ACME-failure log
line that F3's Domains fix addresses), what F1–F3 changed, both exposures and their rotations, and the open items
still owed by Soroush. Pushed `epic/001-followup`, opened PR #3, CI green (`ci — pass, 54s`), paused for
Soroush's go-ahead per the standing instruction. Told "Go. Squash-merge PR #3." — merged (`67d10e8`), local
`main` fast-forwarded.

**Post-merge verification — F2's own acceptance criterion, the actual result.** Staging's auto-deploy for
`67d10e8` was already `in_progress` moments after the merge (confirmed via `GET
/api/v1/deployments/applications/{uuid}`, read-only); polled it read-only until `finished` (two attempts — the
first polling script died on `read-only variable: status`, a zsh built-in name collision with my own variable
name, unrelated to secrets or the deployment itself; second attempt with a renamed variable worked). `curl -s
https://staging.41prompts.ai/healthz` briefly returned `no available server` right at deploy completion (Traefik
hadn't picked up the new container yet — containers were 17s old; resolved itself 5s later) then settled on
`{"ok":true,"commit":"unknown","env":"staging"}` — **still `unknown`**. Checked why, read-only: `GET
/api/v1/applications/{uuid}/envs` no longer lists `SOURCE_COMMIT` or `COMMIT_SHA` at all (11 variables total,
neither key present) — the locked-variable half of F2 is genuinely fixed. But the new container's environment,
filtered to just these two keys, showed `COMMIT_SHA=unknown` and no `SOURCE_COMMIT` entry whatsoever — Coolify is
not injecting a real commit into this compose deployment's runtime, contradicting what reading
`ApplicationDeploymentJob.php` predicted (the theory: runtime injection of `SOURCE_COMMIT` should be unconditional
once no locked variable exists; the observed reality: it just doesn't happen for this app, and I never actually
traced the code path that would explain why not).

Reported this to Soroush along with a recommendation — the epic's own second option, reading `.git/HEAD` inside
the Docker build via a narrow `.dockerignore` exception, fully self-contained and independent of Coolify's
internal wiring — and asked whether to implement it. **Soroush's answer: no.** Do not implement the `.git/HEAD`
fix, do not read Coolify's source again for this. F2 is closed as deferred, not fixed: two hours already went
into this investigation, further attempts each cost a full deploy cycle, and the `.git/HEAD` workaround would be
deleted within a week anyway by **EPIC-008 Prebuilt images** — moved to the front of the backlog specifically to
own this criterion, building images in GitHub Actions with `github.sha` passed explicitly as `--build-arg
SOURCE_COMMIT`, which is certain rather than inferred. Soroush wrote the "F2 outcome" decision directly into
`docs/epics/CURRENT.md`/`EPIC-001-infrastructure.md`, updated `docs/backlog.md`/`docs/roadmap.md` with EPIC-008,
and asked for one closeout commit: fold in those doc edits as-is, update the report and this session log with the
outcome above (this entry), and write `docs/epics/EPIC-008-prebuilt-images.md` from the roadmap entry and these
lessons, setting it as the new `docs/epics/CURRENT.md`.

**What's kept from F2 as merged, unchanged:** the healthz fallback logic (`COMMIT_SHA` unless it's the literal
`"unknown"`, then `SOURCE_COMMIT`) — correct, and will work the moment EPIC-008 supplies a real build arg; the
compose file's comment explaining Coolify's locking behavior; all of F3's runbook corrections. Nothing about F1
or F3 changes.

**EPIC-001 is now closed** with `commit` on `/healthz` explicitly deferred to EPIC-008, not silently left broken —
recorded in the report's acceptance criteria, the backlog, and the roadmap. `docs/epics/CURRENT.md` now holds
EPIC-008 in full; planning and implementing it is explicitly out of scope for this session per Soroush's
instruction ("do not plan or implement EPIC-008 yet").
