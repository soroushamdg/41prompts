# Plan: EPIC-004 Observability and guardrails

Read: `docs/epics/EPIC-004-observability.md` (= `CURRENT.md`), `docs/roadmap.md`'s milestone table,
`infra/ACCESS.md`, `infra/RUNBOOK.md`, `.env.example`, the existing web/worker/db source.

## Division of labour reality check

Sentry, PostHog, and an uptime service all need real third-party accounts Soroush creates (per the
epic's own division of labour). I cannot create those accounts or read their dashboards. So this
session:

1. Builds every piece of code so the app is Sentry/PostHog/budget-aware and behaves correctly with
   the env vars **unset** (nothing crashes, nothing silently fakes success) and **set** (real
   integration, verifiable once keys exist).
2. Verifies everything that doesn't require a live third-party account: unit/integration tests,
   local JSON log output + a PII grep, a local `/dev/throw` smoke test, production build success
   with the new envs unset, `ufw status` on the box (read-only, no approval needed per
   `infra/ACCESS.md` rule 2).
3. Sends **one** batched message before merge: exact env var checklist for Sentry/PostHog/uptime,
   plus the one box-mutating command this epic needs approval for (a read-only Postgres role for
   Drizzle Studio).
4. Ships the PR and merges once CI (which needs none of those keys) is green. The report marks
   precisely which acceptance criteria are code-complete vs. pending Soroush's account creation —
   no fabricated screenshots or dashboard evidence.

## Gaps found while reading, fixed as part of this epic

- **`apps/worker/Dockerfile` never gets a `COMMIT_SHA`.** Only `apps/web/Dockerfile` does (EPIC-008).
  The epic requires Sentry release tagging on both. Add the same `ARG SOURCE_COMMIT=unknown` / `ENV
  COMMIT_SHA=$SOURCE_COMMIT` to the worker Dockerfile, and add `build-args: SOURCE_COMMIT=...` to
  `build-worker` in `.github/workflows/build-images.yml` (currently only `build-web` passes it).
- **No `plan` concept exists anywhere** (Stripe/billing is EPIC-070). "Per-plan defaults" needs
  *some* substrate. Add `users.plan` (`text not null default 'free'`) — a bare string column, not a
  billing integration — and a `plan_budget_defaults` reference table so the enforced cap really does
  come from a database row, not a constant (decision 6's literal requirement).

## Build order

1. **`packages/logger`** (new, proprietary, same shape as `packages/db`/`packages/ui`): pino
   factory (`createLogger(name)`), JSON to stdout, level from `LOG_LEVEL`, a redaction path list
   (`email`, `password`, `token`, `*.headers.cookie`, `*.headers.authorization`, provider-payload
   shaped keys), and an `AsyncLocalStorage`-backed `withRequestId`/`currentLogger()` pair so any code
   inside a request/job can log with the id attached without threading a logger through every call.
   Update `CLAUDE.md`'s Stack section (one line) and `.dependency-cruiser.cjs`'s forbidden-path regex
   to include it alongside `db`/`ui`.
2. **`packages/core/src/budgets.ts`**: pure `applyBudgetIncrement({capCents, spentCents}, amountCents)
   -> {allowed, spentCents}`. Boundary tests: exactly at cap, one cent over, zero-amount, already
   over cap.
3. **`packages/db`**: `users.plan`, `plan_budget_defaults`, `run_budgets` in `schema.ts`; `newRunBudgetId`
   in `ids.ts`; migration via `drizzle-kit generate`, hand-appending the three seed `INSERT`s for
   `plan_budget_defaults` (free/pro/team — placeholder cents, flagged as such, EPIC-070 owns the real
   numbers) into that same new migration file.
4. **`apps/worker/src/budgets/increment-run-budget.ts`**: `getOrCreateRunBudget` + `incrementRunBudget`
   (atomic conditional `UPDATE ... WHERE spent_cents + $amt <= cap_cents RETURNING *`), same shape and
   test style as `jobs/purge-deleted-users.ts`. Tests: boundary (mirrors core), and the real
   concurrent-increment case — N parallel increments against a real Postgres row, assert the total
   spent never exceeds the cap and exactly the right count succeed.
5. **Worker observability**: `@sentry/node` init in `main.ts` (dsn/release/environment from env,
   no-op cleanly when `SENTRY_DSN` unset), replace every `console.*` with `packages/logger`, a job-id
   (`withRequestId`) per pg-boss job run and per heartbeat tick, `Sentry.captureException` in the
   pg-boss error handler and any job failure.
6. **Web observability**:
   - `apps/web/instrumentation.ts` (server/edge Sentry init) + `instrumentation-client.ts` (browser
     Sentry init) + `onRequestError` hook, per current `@sentry/nextjs` convention for the App
     Router. `next.config.ts` wrapped in `withSentryConfig` for source-map upload (auth token only
     ever read from `SENTRY_AUTH_TOKEN`, never committed).
   - `apps/web/app/dev/throw/route.ts`: same `DEPLOY_ENV === "production"` → `notFound()` gate as
     `/dev/ui`, otherwise throws.
   - `apps/web/lib/analytics/events.ts`: the closed nine-name union + a runtime-checked
     `EVENT_NAMES` array (test casts past the type system to prove the runtime guard fires, since
     the whole point is catching a call that bypassed TypeScript).
   - `apps/web/lib/analytics/posthog-server.ts`: lazy `posthog-node` client (same lazy-singleton
     shape as `getDb`/`getAuth`), a consent check (`hasAnalyticsConsent`: true everywhere except
     `DEPLOY_ENV === "production"` and no session and no `41p-consent=granted` cookie — decision 8),
     `identify` + `capture("signup"|"login", …)` wired into `lib/auth.ts`'s
     `databaseHooks.user.create.after` / `session.create.after`. User id only, never email.
   - `packages/logger` wired into the Better Auth `hooks.before/after` middleware (the one real
     per-request choke point that exists today) for JSON request logs with a request id, and into
     `/healthz`.
   - `project_created` and the remaining six event names: exported from `events.ts`, unused — there
     is no project-creation flow yet (only `packages/db/src/seed.ts`'s dev-only seed script touches
     `newProjectId`), so wiring one for real would be fabricated scope, not a deviation worth hiding.
7. **`infra/RUNBOOK.md`**: "Drizzle Studio against staging/production" section (SSH tunnel commands,
   the read-only role, the real-user-data warning); "An alert fired, what now" section.
8. **PostHog dashboard**: a `scripts/create-posthog-dashboard.mjs` one-shot script (PostHog's
   dashboard/insight REST API, needs a **personal** API key — separate from the public client key,
   requested in the batched checklist) that creates one dashboard with an insight per milestone
   metric (M0–M7 from `docs/roadmap.md`), documented in the RUNBOOK rather than run blind against an
   account that doesn't exist yet.
9. Update `.env.example`, `turbo.json` (`globalPassThroughEnv` additions), `CLAUDE.md`.

## Testing strategy

- `packages/core`: pure boundary tests for `applyBudgetIncrement` (no IO).
- `packages/db`: schema/id tests matching existing style (`ids.test.ts`).
- `apps/worker`: DB-integration tests for `increment-run-budget` against the CI Postgres service,
  same pattern as `purge-deleted-users.test.ts`; a logger smoke test.
- `apps/web`: `events.test.ts` (closed-set runtime guard), `posthog-server` consent-logic unit tests
  (no network calls — inject a fake client), a `/dev/throw` route test mirroring `/dev/ui`'s
  production-gate test, `/healthz` still 200.
- Manual, evidenced in the report: `pnpm dev`, hit `/healthz` and a magic-link request, confirm JSON
  logs with a request id, `grep` the test email over the output and confirm nothing matches; a
  production build with `SENTRY_DSN`/`NEXT_PUBLIC_POSTHOG_KEY` unset succeeds and boots.

## Deferred / needs Soroush, listed up front so the report doesn't bury it

- Sentry/PostHog project creation + Coolify env vars + `SENTRY_AUTH_TOKEN` as a GitHub Actions
  secret — checklist sent once code is ready for it.
- Uptime monitor account + phone alert contact (I can document the setup, not create the account).
- The read-only Postgres role for Drizzle Studio — one mutating command on the box, asked for by
  itself with its exact SQL and reason, per `infra/ACCESS.md` rule 3.
- Live evidence for the criteria that require an actual Sentry issue / PostHog event payload /
  phone alert / PostHog dashboard screenshot — these need the above first. The report says so
  explicitly rather than guessing at what they'd look like.
