# EPIC-004 session log

**Date.** 2026-09-05.

**Prompt sent.** Same autonomy as EPIC-003: plan into `docs/epics/plan-EPIC-004.md`, proceed
immediately, implement, self-review, push, PR, squash-merge once CI is green — one batched pause
for the Sentry/PostHog/uptime keys and anything mutating on the box. Commit the advisor's
`EPIC-004-observability.md` as-is first, then point `CURRENT.md` at it and mark it current in
`docs/backlog.md`. Also record, for the advisor: the two `--color-ink-3` hex values nudged during
EPIC-003 are accepted (add a line to `docs/design/README.md`'s corrections section), and blok
category colour staying unshipped until EPIC-020 is also accepted. Finish with the report, session
log, backlog status, and `CURRENT.md` pointing at EPIC-007.

**Plan summary.** Written into `docs/epics/plan-EPIC-004.md` before any code, after reading the
epic, `docs/roadmap.md`'s milestone table, `infra/ACCESS.md`/`RUNBOOK.md`, `.env.example`, and the
existing web/worker/db source. Flagged up front that this epic is structurally different from
EPIC-003: Sentry, PostHog, and an uptime monitor all need real third-party accounts this session
cannot create, so the plan split the work into "build and locally verify everything that doesn't
need a live key" (all of it) versus "send one batched checklist for what does" (account creation,
plus the one mutating box command a read-only Postgres role needs). Found and flagged two gaps
while reading, before writing any code: `apps/worker/Dockerfile` never got a `COMMIT_SHA` (only
`apps/web/Dockerfile` did, EPIC-008), and no `plan` concept exists anywhere yet, which "per-plan
defaults" needs some substrate for.

**Decisions made and why.**
- **New `packages/logger` package**, not duplicated pino setup in each app. The redaction list and
  level-from-env config are identical for web and worker; a shared package is what keeps a future
  redaction-list update a one-file change instead of two call sites drifting apart, matching why
  `packages/db`/`packages/ui` already exist as shared proprietary infra for the same reason.
- **`run_budgets`' pure decision logic lives in `packages/core`, its DB-touching wrapper in
  `apps/worker`, not `packages/db`** — mirrors the exact existing precedent of
  `jobs/purge-deleted-users.ts` (DB-touching job logic lives in the worker; `packages/db` only
  ever holds schema plus tiny non-DB helpers like `hashApiKey`). The concurrency-safe cap
  enforcement is one conditional SQL `UPDATE`, not an application-level lock — Postgres's own row
  lock on the `UPDATE` is what actually prevents two racing callers from both succeeding, and the
  pure `packages/core` function is that same rule's DB-free spec for the boundary tests.
- **`users.plan` (a bare string, default `"free"`) added now, not deferred to EPIC-070.**
  "Per-plan defaults" is meaningless without *some* notion of a plan; a string column is a small,
  reversible addition, not a billing integration — EPIC-070 reads it later, doesn't need to create
  it.
- **`plan_budget_defaults` is a real seeded table, not a map in code**, even though a
  `Record<Plan, number>` constant in `packages/core` would have been simpler — decision 6 is
  explicit that "the cap is a number in the database, not a constant in code," and the enforced
  cap really does need to trace back to a DB row for that sentence to mean anything.
- **Client-side Sentry init carries no `environment`/`release` tag, only the DSN** — found while
  wiring `instrumentation-client.ts`: this app builds one Docker image and configures
  `DEPLOY_ENV`/`COMMIT_SHA` per environment at container *runtime* (EPIC-008's whole design), but
  `NEXT_PUBLIC_*` values are inlined into the browser bundle at *build* time. Baking either in
  would tag every browser event from both staging and production with whatever the build
  happened to see — worse than not tagging it at all. The server/edge init doesn't have this
  problem (real `process.env` reads at runtime), and it's what `/dev/throw`, the criterion's own
  test surface, actually exercises.
- **`captureEvent` validates the closed event set at runtime, not just via the `EventName`
  TypeScript union** — the acceptance criterion is literally "a test fails if an event name
  outside the closed set is used," which needs a real runtime guard to test against; a compile-time-only
  union has nothing for a test to call. The test casts a bogus string past the type system on
  purpose, the same way an untyped caller eventually would.
- **`project_created` left unwired**, alongside the five other not-yet-relevant events, despite
  the epic's Scope line naming it as one of three "already exist" — nothing in this repo creates a
  project outside `packages/db/src/seed.ts`'s dev-only script (guarded to refuse running outside
  `DEPLOY_ENV=development`). Wiring analytics into a seed script would be fabricated scope, not a
  faithful reading of "wired where they already exist." Flagged as an open question rather than
  silently reinterpreted.
- **Signup and login both fire for a brand-new user's first request** (session creation
  immediately follows user creation) rather than suppressing `login` on that first request —
  decision 2 lists them as genuinely distinct events, and this is the standard shape other
  analytics setups use for the same signup-implies-a-session pattern.

**What took longer than expected.**
- **Tracking down why a local `/healthz` smoke test kept reporting `env: "production"`
  regardless of the `DEPLOY_ENV` passed on the command line.** Not a code bug — a stale `next
  start` process from an unrelated earlier session was still listening on the test port, so every
  `curl` was silently hitting the wrong server the whole time. Caught by checking `lsof -i` for
  the port and finding a second, older process already bound to it; killing it and re-running
  produced the expected `staging`/`test-sha-abc123` output immediately. Worth remembering:  an
  "EADDRINUSE" on a *second* start attempt was the tell that should have been checked first.
- **Confirming the actual build tool.** `@sentry/nextjs`'s `withSentryConfig` prints deprecation
  warnings assuming a webpack build; a real `next build` run showed this project's production
  build actually uses Turbopack (the build's own banner says so), which doesn't support several of
  those legacy options at all. Removed `disableLogger`/`automaticVercelMonitors` rather than
  leaving them set-and-silently-ignored, and added the one option Turbopack's build *did* ask for
  (`onRouterTransitionStart`) — resolved by reading the actual build output rather than trusting
  the wrapper's own defaults.
- **Verifying "no database or analytics port reachable from the internet" for real, not just by
  reading the compose files.** Since this is genuinely read-only (`infra/ACCESS.md` rule 2), ran
  `ufw status` over `41p-box` *and* a real external `nc -z` connection attempt against the box's
  public IP for both staging's and production's postgres ports (5432/5433) from this machine —
  both failed to connect (silent drop, ufw's default-deny), while the same test against 443
  succeeded, confirming the negative result was real and not a dead-network false negative.

**Verification output (tail).** Full transcript in
`docs/epics/reports/EPIC-004-report.md`'s Verification section. Short form: `pnpm test` — 8
packages, 154 tests, all green (worker's budget tests hit real Postgres including a 20-parallel-
increments concurrency case); `pnpm typecheck` — 8 packages clean; `pnpm lint` — turbo lint +
`pnpm boundaries` + `turbo boundaries` + `pnpm forbidden-words`, all clean (one real lint error
found and fixed: `packages/logger`'s `NodeJS.WritableStream` tripped `no-undef`, fixed by
importing `Writable` from `node:stream` instead of the ambient namespace); `pnpm e2e` — 18/20, the
2 failures being EPIC-003's pre-existing macOS/Linux visual-regression gap; `gitleaks detect` —
clean; a real `DEPLOY_ENV=production next build` succeeding with every new env var unset; a
manual local-server run producing JSON request-id-carrying logs across a full magic-link
signup+login round trip with zero occurrences of the test email anywhere in the output.

**Open questions.** See the report's "Open questions for the advisor" — the placeholder
`plan_budget_defaults` cap values, the client-side Sentry tag asymmetry (a structural consequence
of the deployment model, not an oversight), and whether leaving `project_created` unwired is the
correct read of the epic's Scope line.

**Batched checklist sent separately** (this epic's one planned pause): exact Sentry/PostHog/
uptime-monitor account-setup steps (`infra/README.md`'s new "Observability secrets" section) and
the one mutating box command still needing a yes (creating the read-only Postgres role for Drizzle
Studio, `infra/RUNBOOK.md`'s new section) — nothing else in this epic needed approval, and nothing
was run against the box beyond the read-only commands `infra/ACCESS.md` rule 2 already permits
(`ufw status`, the external `nc` check from this machine, not the box).

## Second session, same day — box mutations and real-deploy verification

**Prompt sent.** First, twice: rotate both `readonly_studio` passwords with `ALTER ROLE`, one
command per environment, new URLs only into `~/.41prompts/studio.env` (mode 600), never in chat.
Then: Sentry/PostHog/uptime are live, keys are in Coolify — verify EPIC-004's four open criteria
against a real deploy.

**Mutating commands run, each shown in chat with its reason before running, per
`infra/ACCESS.md` rule 3** (the auto-mode classifier itself enforced this once, blocking a first
attempt at reading `POSTGRES_DB`/`POSTGRES_USER` via `docker exec` until an explicit chat "yes"
against the exact command list existed):
- `CREATE ROLE readonly_studio ...` against both staging's and production's postgres containers
  (first ask).
- `ALTER ROLE readonly_studio WITH PASSWORD ...` against both, twice — once per the first rotation
  request, once more for the second (the prompt repeated the same instruction verbatim in the
  next turn; treated as a genuine re-ask rather than a no-op, since rotating again is harmless and
  the instruction was unambiguous both times). The second rotation had to route around a real
  surprise: both postgres containers had been recreated (new name suffixes) between the two asks —
  a stack redeploy for the new Sentry/PostHog env vars recreates every service in the compose
  file, postgres included, even though postgres itself had no env change. Confirmed the
  `readonly_studio` role survived (the named volume, not the container, is where Postgres data
  actually lives) before rotating against the new container names.

**Decisions made and why.**
- **Used a local Node script with the `pg` package (run from `packages/db`, over the same SSH
  tunnel `infra/RUNBOOK.md` documents) instead of `docker exec ... psql` to read the verification
  token during the real-staging signup test.** This is exactly the read-only path the Drizzle
  Studio runbook section describes and is meant to prove out — using it here was both the correct
  tool for a read query and free verification that the tunnel/role/`DATABASE_URL` mechanism
  actually works end to end, not just on paper.
- **Did not attempt to fix the Sentry/PostHog Coolify misconfigurations found during
  verification.** Both are one-line env var fixes in Coolify, but require either the actual DSN
  values (masked by Coolify's env-list API, never exposed to this session) or the correct PostHog
  project API key (a value only visible in PostHog's own UI) — nothing this session has access to.
  Documented precisely in the report instead of guessing.
- **Did not add a `BUG-004-*` row to `docs/backlog.md`.** `CLAUDE.md`'s "Never touch without an
  explicit instruction" list reserves `docs/backlog.md` for the advisor; this session's job was to
  verify and report, not to triage and file. The report's new "Post-merge verification" section is
  written so it can be pasted to the advisor and filed correctly, per `docs/PROCESS.md`'s own bug
  workflow.

**What was found.** Real, working end-to-end: `/dev/throw` on staging, a full magic-link
signup+login round trip against staging producing a real session, JSON request-id logs for both
with zero PII across a 500-line tail, and the `readonly_studio` role/tunnel mechanism. Real and
blocking, discovered by triggering those same real requests and reading the real logs (not
inferred): Sentry's Coolify env vars are named `SENTRY_DSN_WEB`/`SENTRY_DSN_WORKER`, not what the
code reads (`NEXT_PUBLIC_SENTRY_DSN`/`SENTRY_DSN`); `NEXT_PUBLIC_POSTHOG_KEY` is a PostHog
*personal* API key, not the *project* key `posthog-node`'s ingestion endpoint requires — confirmed
by two real `401 API key is not valid: personal_api_key` errors in the staging web logs, one for
each event a real signup+login actually tried to send. Also noticed: `SENTRY_AUTH_TOKEN` sitting
in Coolify (production) where it's never read (it's a GitHub Actions build-time secret); and
`posthog-node`'s own flush-failure path logs a raw object dump via `console.error`, bypassing
`packages/logger` — not this epic's code, and expected to stop entirely once the key is fixed.

**Verification output (tail).** `curl https://staging.41prompts.ai/healthz` → commit `853a966`
(confirms staging runs EPIC-004; `app.41prompts.ai` is still `b62f12b`, pre-EPIC-004 — production
deploys only on a `v*` tag, none pushed since the merge). `curl .../dev/throw` → 500. A real
magic-link signup+login → 302 + session cookie, `users` row created. `docker logs --tail 500` on
the real web container: 2 clean `{"msg":"auth request",...}` JSON lines with distinct
`requestId`s, 2 `PostHogFetchHttpError` 401s, zero occurrences of the test email. Worker container
logs: clean JSON heartbeats, no errors.

**Open questions.** Everything needed to close the four remaining criteria is now precisely
scoped and sitting on Soroush's side (two Coolify value fixes + a redeploy, and either an uptime
status-page URL or his own confirmation of a received test alert) — no more code or investigation
needed here, just the values.
