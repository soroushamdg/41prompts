# EPIC-004 report: Observability and guardrails

Branch `epic/004-observability`, PR #10. 2026-09-05.

**Status: code-complete, partially verified.** Every piece of code this epic scopes is built,
tested, and passes CI without any live third-party key. What is genuinely **not** done — and
can't be, this session — is the half of the epic's own "Division of labour" that was always
Soroush's: creating the Sentry, PostHog, and uptime-monitor accounts. Four acceptance criteria are
marked pending below for exactly that reason, not because the code isn't ready for them.

## Built

Followed the plan (`docs/epics/plan-EPIC-004.md`).

- **`packages/logger`** (new package, proprietary — mirrors `packages/db`/`packages/ui`'s shape):
  `createLogger(name)` — pino, JSON to stdout, level from `LOG_LEVEL`, a redaction list (`email`,
  `password`, `token`, cookie/authorization headers, `payload`/`prompt` — decision 3's safety net,
  not the only thing preventing PII, since no call site passes these fields to begin with).
  `withRequestId`/`currentRequestId`/`loggerWithRequestId` — an `AsyncLocalStorage`-backed
  request/job id so any log line anywhere underneath a request or job run can be correlated
  without threading a logger through every function signature. `CLAUDE.md`'s Stack section and
  `.dependency-cruiser.cjs`'s public-package boundary rule both updated to name it alongside
  `db`/`ui`.
- **Two gaps found while reading, fixed as part of this epic** (both called out in the plan before
  any code was written):
  - `apps/worker/Dockerfile` never got a `COMMIT_SHA` — only `apps/web/Dockerfile` did (EPIC-008).
    Added the same `ARG SOURCE_COMMIT=unknown` / `ENV COMMIT_SHA=$SOURCE_COMMIT`, and the matching
    `build-args: SOURCE_COMMIT=...` to `build-worker` in `.github/workflows/build-images.yml`
    (only `build-web` passed it before). Without this, the worker's Sentry release tag would
    always read `"unknown"`.
  - No "plan" concept existed anywhere (Stripe/billing is EPIC-070) — "per-plan defaults" needed
    some substrate. Added `users.plan` (`text not null default 'free'`) — a bare string column,
    not a billing integration.
- **Sentry, `apps/worker`** (`src/sentry.ts`): `@sentry/node`, inert when `SENTRY_DSN` is unset.
  `release`/`environment` read from the same `COMMIT_SHA`/`DEPLOY_ENV` runtime vars `/healthz`
  already uses. Wired into `main.ts`'s pg-boss error handler and the purge job's try/catch (logs
  via `packages/logger` too, both tagged with a per-job-run id from `withRequestId`), and into
  `index.ts`'s top-level `.catch`.
- **Sentry, `apps/web`**: `instrumentation.ts` (server/edge `register()`, gated on
  `NEXT_RUNTIME`, plus `onRequestError` for the App Router's own error-boundary gap) +
  `instrumentation-client.ts` (browser init). `next.config.ts` wrapped in `withSentryConfig` (from
  `@sentry/nextjs/config` — the current, non-deprecated import path for this installed version)
  for source-map upload; `org`/`project` are plain config, `SENTRY_AUTH_TOKEN` only ever a GitHub
  Actions secret. One deliberate asymmetry, explained inline in `instrumentation-client.ts`: the
  server/edge init tags `release`/`environment` from real runtime `process.env` reads, but the
  *client* init does not — this app builds one Docker image and configures `DEPLOY_ENV`/
  `COMMIT_SHA` per environment at container runtime (EPIC-008), which a browser bundle's
  build-time-inlined `NEXT_PUBLIC_*` values structurally can't reflect. Baking either in would tag
  every browser-side event from *both* staging and production with whatever the build happened to
  see — actively misleading, not just imprecise — so the client init carries the DSN only (which
  genuinely is one value for both environments, "public by design" per the epic's own notes).
  `pnpm --filter @41prompts/web build` confirmed clean (no deprecation warnings, Turbopack — this
  project's actual build tool, confirmed by the build's own banner — supported) after also fixing
  two `@sentry/nextjs` API deprecations found along the way (`disableLogger`/
  `automaticVercelMonitors` dropped, `onRouterTransitionStart` exported).
- **`apps/web/app/dev/throw/route.ts`**: same `DEPLOY_ENV === "production"` gate as `/dev/ui`
  (404 in production, throws otherwise) — the deliberate error the Sentry pipeline gets proven
  against once real keys exist.
- **PostHog typed events** (`apps/web/lib/analytics/`):
  - `events.ts` — the closed nine-name set (decision 2) as a `const` array + union type +
    `isEventName` runtime guard.
  - `posthog-server.ts` — a lazy `posthog-node` client (same lazy-singleton shape as
    `getDb`/`getAuth`, for the same build-time-env reason), `identifyUser` (id only),
    `captureEvent` (validated against the closed set **at runtime**, not just by the `EventName`
    type — the acceptance criterion is "a test fails if an event name outside the closed set is
    used," which a compile-time union alone can't be tested against; `captureEvent` throws even
    for a name that reached it via a cast, which is what the test actually exercises), and
    `hasAnalyticsConsent` (decision 8: true everywhere except production + anonymous + no
    `41p-consent=granted` cookie).
  - Wired into `apps/web/lib/auth.ts`'s Better Auth `databaseHooks`: `user.create.after` →
    identify + `"signup"`; `session.create.after` → identify + `"login"`. Both fire for a
    brand-new user's first request (signup creates a session too) — deliberate, not a dedup bug:
    decision 2 lists them as two distinct events, and this is the standard shape for that.
  - The other six events (`decompile_view`, `decompile_run`, `decompile_share`,
    `project_created`, `run_started`, `run_passed`, `publish`) are exported and unused, per the
    epic's own scope line. **`project_created` has no real call site to wire either** — the only
    thing in this repo that creates a project is `packages/db/src/seed.ts`, a dev-only script
    guarded to refuse running outside `DEPLOY_ENV=development`; wiring analytics into it would be
    fabricated scope, not the deviation it might look like. `EPIC-021a` is what actually builds
    project creation.
- **Structured request logging**: `apps/web/app/api/auth/[...all]/route.ts` — the one real
  per-request choke point in this app today (every Better Auth call: OAuth redirects/callbacks,
  magic-link send/verify, session checks) — wrapped in `packages/logger`'s `withRequestId`, so
  everything downstream (including the signup/login analytics above) can pick up the same id via
  ambient context, with nothing threaded through Better Auth's own hook signatures. Logs method,
  path, status, duration — never the request body, never an email.
- **`run_budgets`** (decision 6 — "no user can run up an unbounded provider bill," "the cap is a
  number in the database, not a constant in code"):
  - `packages/core/src/budgets.ts` — `applyBudgetIncrement({capCents, spentCents}, amountCents)`,
    pure, zero IO. Boundary-tested: exactly at the cap, one cent over, already at the cap, a
    zero-amount increment, a negative amount (rejected).
  - `packages/db/src/schema.ts` — `plan_budget_defaults` (`plan` PK, `monthly_cap_cents`) and
    `run_budgets` (one row per `owner`, `unique()`-constrained — what makes the worker's
    get-or-create race-safe via `ON CONFLICT (owner) DO NOTHING`). Migration
    `0001_dry_post.sql` hand-appends the three seed rows (`free`/`pro`/`team`) — explicitly
    flagged, in both the schema comment and the migration itself, as placeholders EPIC-070 owns
    the real numbers for. Applied cleanly against the local dev database; verified the seeded
    rows and the table shape by hand (`psql \d run_budgets`) before writing any code against it.
  - `apps/worker/src/budgets/increment-run-budget.ts` — `getOrCreateRunBudget` (looks up the
    owner's plan, falls back to `"free"`'s default, race-safe insert) and `incrementRunBudget`,
    the concurrency-safe twin of `packages/core`'s pure function: **one conditional `UPDATE`**
    (`spent_cents + amount <= cap_cents` in the `WHERE` clause) so Postgres's own row lock, not
    application logic, is what makes two concurrent callers racing the same owner unable to both
    observe "room under the cap" and both write. Tested against real Postgres (same pattern as
    `jobs/purge-deleted-users.test.ts`): creation-from-plan-default, idempotent get-or-create,
    under-cap, exactly-at-the-boundary, over-cap (spend unchanged), a negative amount, and —
    the acceptance criterion's own words — **a concurrent-increment case**: 20 parallel 100-cent
    increments against a 1000-cent cap, asserting exactly 10 succeed and the final `spentCents`
    never exceeds the cap, regardless of how Postgres interleaves them. All 7 tests pass.
  - Empty of provider integration on purpose — EPIC-031 is what calls `incrementRunBudget` with a
    real `amountCents` from an actual provider response; this epic only builds the table, the
    enforcement, and its tests.
- **`infra/RUNBOOK.md`**: a "Drizzle Studio against staging or production" section (SSH tunnel
  over `41p-box`, staging's postgres on the box's `5432` / production's on `5433` — the port map
  EPIC-008 already established to let both stacks share one Lightsail instance — the read-only
  role's exact `CREATE ROLE`/`GRANT` SQL flagged as a mutating command needing Soroush's yes rather
  than run here, and how to close the tunnel), and "an alert fired, what now" (cross-reference a
  Sentry issue's release/environment tags against the matching request/job id in `docker logs`
  before deciding severity).
- **`infra/README.md`**: an "Observability secrets" section with exact account-creation and
  key-naming steps for Sentry (two projects — web, worker — so issues stay in separate streams),
  PostHog (one project + a personal API key for the dashboard script), and a phone-alerting uptime
  monitor. And a short "PostHog dashboard" section pointing at the script below.
- **`scripts/create-posthog-dashboard.mjs`**: one-shot, idempotent (looks up by name before
  creating a duplicate) creation of one dashboard with one insight per `docs/roadmap.md` milestone
  (M0–M7). Four of the eight (M0, M5a, M6, M7) aren't PostHog-trackable at all — CI deploy count,
  CDN access logs, Stripe, and an event that doesn't exist in the closed nine-name set — so those
  are created on the closest available proxy event and named to say plainly they're placeholders,
  never presented as the real leading metric. **Written against PostHog's documented REST API but
  not run against a real account** — one didn't exist to run it against — flagged in the script's
  own header as needing a dry run once credentials do.
- `.env.example`, `turbo.json` (`globalPassThroughEnv`), `pnpm-workspace.yaml`
  (`onlyBuiltDependencies` needed `@sentry/cli`, whose postinstall pnpm blocks by default) all
  updated for the new env vars and dependencies.

## Verified this session (real evidence, not staging)

- `pnpm test` — 8 packages, **154 tests**, all green. `packages/logger` (11), `packages/core`
  (7, incl. 6 budget boundary tests), `packages/db` (15), `apps/worker` (16, incl. the 7 budget
  tests with the real-Postgres concurrency case), `apps/web` (30), `packages/ui`/`sdk-ts`/`cli`
  unchanged and still green.
- `pnpm typecheck` — 8 packages, clean.
- `pnpm lint` (turbo lint + `pnpm boundaries` + `turbo boundaries` + `pnpm forbidden-words`) —
  clean. (One real lint error found and fixed along the way: `packages/logger`'s
  `NodeJS.WritableStream` type tripped `no-undef` — `NodeJS` is an ambient namespace the eslint
  config's `globals` list doesn't cover; switched to `import type { Writable } from "node:stream"`
  instead, which is more precise anyway.)
- `pnpm e2e` — 18/20. The 2 failures are `dev-ui.spec.ts`'s visual-regression tests, which need a
  macOS (`-darwin.png`) baseline this repo has never committed (EPIC-003 committed only
  `-linux.png`, matching CI's `ubuntu-latest`) — pre-existing, unrelated to this epic, and the same
  gap EPIC-003's own report describes for a local macOS run. The full `auth.spec.ts` suite
  (magic-link sign-up, sign-out, account delete) passes — real end-to-end confirmation that the
  `databaseHooks` additions don't break the actual sign-in flow.
- `gitleaks detect` — clean, run twice (before and after the final commit).
- **Real production build**: `DEPLOY_ENV=production pnpm --filter @41prompts/web build` succeeds
  with every new env var unset — Sentry/PostHog code paths are genuinely inert, not just
  theoretically so.
- **Manual, local server, real Postgres** (evidence for the "log output is JSON, carries a request
  id" and "no PII in logs" criteria, ahead of a real staging deploy):
  1. `pnpm start` against the local dev database, `DEPLOY_ENV=staging`, `COMMIT_SHA=test-sha-abc123`.
  2. `curl /healthz` → `{"ok":true,"commit":"test-sha-abc123","env":"staging"}` — confirms the
     Sentry release/environment tags this session couldn't otherwise observe (no live Sentry
     account) would be correct.
  3. `curl /dev/throw` → 500, the deliberate error thrown, confirming the route and its
     production-gate both behave correctly.
  4. A full magic-link **signup**: `POST /api/auth/sign-in/magic-link` with a throwaway test
     email, the token read back from the `verifications` table (the same thing this app's own
     database sees, matching `apps/web/e2e/db.ts`'s own approach), then
     `GET /api/auth/magic-link/verify?token=...` — a real 302 + session cookie, a real `users` row
     created with `plan='free'`, `databaseHooks.user.create.after`/`session.create.after` both
     fired without error (`identifyUser`/`captureEvent` correctly no-op with no PostHog key
     configured — confirmed by the process not crashing and the DB write succeeding regardless).
  5. Log output for both requests: two JSON lines, `{"level":30,...,"requestId":"<uuid>",
     "method":"POST","path":"/api/auth/sign-in/magic-link","status":200,"durationMs":78,
     "msg":"auth request"}` and the matching `verify` line — different ids, real durations.
  6. `grep -c "<the test email>" <the log output>` → **0**, across the entire boot log including
     both requests.
  7. Cleaned up the test rows afterward.
- **`ufw status` and a real external connection attempt** (evidence for "no database or analytics
  port is reachable from the internet" — this one *is* checkable now, read-only, no approval
  needed per `infra/ACCESS.md` rule 2): `sudo ufw status verbose` over `41p-box` shows only
  22/80/443 (`v4` and `v6`) allowed, default-deny everything else. From this machine (outside the
  box) against the box's public IP: `nc -z -w5 <ip> 5432` and `... 5433` (staging's and
  production's postgres ports) both fail to connect (exit 1, silent drop — ufw's default-deny, not
  an active refusal); `nc -z -w5 <ip> 443` succeeds (exit 0) as a sanity check that the box itself
  is reachable and the test methodology is real, not a false negative from a dead network.

## Pending — needs Soroush, not more code (checklist sent separately)

The exact env-var names and account-setup steps are in `infra/README.md`'s new "Observability
secrets" section; this is the acceptance-criteria-level summary.

1. **A thrown error on staging appears in Sentry, tagged with environment and commit** (web and
   worker) — needs the Sentry projects + `NEXT_PUBLIC_SENTRY_DSN`/`SENTRY_DSN` set in Coolify and
   a real deploy. The route/init code is done and locally confirmed inert-when-unset; the actual
   Sentry-side evidence (an issue) can't exist without the account.
2. **`signup`/`login` events appear in PostHog with a user id and no email** — same shape: needs
   `NEXT_PUBLIC_POSTHOG_KEY` and a real deploy. The call sites are done and confirmed to no-op
   safely without a key (see the manual verification above); the PostHog-side evidence (an event
   payload) needs the account.
3. **Uptime check live on both hosts, one alert reached a phone** — needs a monitor account
   Soroush creates (any provider with phone-capable free-tier alerting); `infra/README.md`
   documents exactly what to configure and to test-fire one alert before considering it done.
4. **PostHog dashboard exists with every milestone metric** — `scripts/create-posthog-dashboard.mjs`
   is ready; needs the PostHog project + a personal API key to actually run (and a first real
   dry-run against a live account, flagged in the script itself, since it was never run against
   one).
5. **Drizzle Studio opens against staging by following the runbook** — the runbook section is
   written and its port numbers/tunnel command confirmed correct against the actual compose files,
   but the one prerequisite mutating step (creating the read-only Postgres role) needs Soroush's
   one-command-one-yes approval per `infra/ACCESS.md` rule 3, and a first real run to confirm the
   documented steps work end to end.

Everything else in the epic's acceptance criteria list — the closed-event-set test, `run_budgets`
migrating with boundary + concurrent-increment tests, no PII in logs, no reachable DB/analytics
port, `pnpm test`/`typecheck`/`lint`/`gitleaks` clean, this report and the session log — is done
and evidenced above.

## Acceptance criteria

- [ ] A thrown error on staging appears in Sentry within a minute, tagged with environment and
      commit, readable stack frame. **Pending Soroush** (item 1 above). Code done.
- [ ] Same for the worker. **Pending Soroush** (item 1). Code done.
- [ ] `signup`/`login` events appear in PostHog with a user id and no email. **Pending Soroush**
      (item 2). Code done, locally verified end to end.
- [x] A test fails if an event name outside the closed set is used. Evidence:
      `posthog-server.test.ts`'s "throws at runtime for a name outside the closed set" test.
- [x] Log output is JSON, carries a request id, and a grep for the test account's email over the
      logs returns nothing. Evidence above (local; staging grep needs a deploy, but the mechanism
      is the same code either way).
- [ ] Uptime check is live on both hosts and one alert has actually reached a phone. **Pending
      Soroush** (item 3).
- [x] `run_budgets` migrates; increment and cap have unit tests including the boundary and a
      concurrent-increment case. Evidence: 6 `packages/core` boundary tests + 7
      `apps/worker` tests incl. the 20-parallel-increments case, above.
- [ ] Drizzle Studio opens against staging by following the runbook, and the runbook says how to
      close the tunnel. **Runbook written; pending Soroush's approval of the one mutating command
      + a first real run** (item 5).
- [x] No database or analytics port is reachable from the internet. Evidence: `ufw status` +
      failed external connection attempt, above.
- [ ] PostHog dashboard exists with every milestone metric from the roadmap. **Pending Soroush**
      (item 4).
- [x] `pnpm test`, `pnpm typecheck`, `pnpm lint`, `gitleaks` clean. Evidence above.
- [x] Report and session log written; backlog updated.

## Verification

```
$ pnpm test           # 8 packages, 154 tests, all green
$ pnpm typecheck       # 8 packages, clean
$ pnpm lint            # turbo lint + boundaries + turbo boundaries + forbidden-words, clean
$ pnpm e2e             # 18/20 — the 2 failures are EPIC-003's pre-existing macOS/Linux
                        # visual-regression gap, unrelated to this epic
$ gitleaks detect --source .
no leaks found

$ DEPLOY_ENV=production pnpm --filter @41prompts/web build
✓ Compiled successfully

$ curl -s https://staging.41prompts.ai/dev/throw     # once deployed with keys — then check Sentry
```

## Skipped (out of scope, per the epic)

Cookie banner / consent UI / privacy policy text (EPIC-017) — `hasAnalyticsConsent` exists and is
tested, but nothing calls it yet since there's no anonymous-visitor client-side event to gate.
Provider calls, real runs, real cost attribution (EPIC-031) — `run_budgets` stays empty of
provider integration on purpose. Session replay, heatmaps, any recording of user content.
Self-hosted analytics.

## Open questions for the advisor

1. **`plan_budget_defaults`' seed values (`free`=$5, `pro`=$50, `team`=$200 monthly caps) are
   placeholders**, chosen only to be plausible-looking and clearly not final — EPIC-070 owns the
   real pricing. Flagging so nobody mistakes them for a real decision later.
2. **The client-side Sentry init carries no `environment`/`release` tag**, by design (see "Built"
   above) — a structural consequence of this app's one-image/runtime-configured deployment model
   meeting Next.js's build-time-only `NEXT_PUBLIC_*` inlining. If a future epic wants accurate
   client-side release tags, the real fix is almost certainly per-environment images (a bigger
   change than this epic's size), not another env var.
3. **`project_created` has no real call site** (only `signup`/`login` do) — same treatment as the
   other five unwired events, but worth confirming that's the expected read of "the nine events
   wired where they already exist," since the epic's own Scope line names it as one of three.
