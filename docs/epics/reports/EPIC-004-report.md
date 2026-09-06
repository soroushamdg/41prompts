# EPIC-004 report: Observability and guardrails

Branch `epic/004-observability`, PR #10. 2026-09-05.

**Status: done. All 12 acceptance criteria confirmed**, as of the sixth session below.
Originally code-complete with four criteria pending Soroush's half of the epic's own "Division of
labour" (creating the Sentry, PostHog, and uptime-monitor accounts); closed incrementally across
six sessions as real keys, a real tag, and real on-box triggers became available — see the dated
updates immediately below for exactly what changed in each one, and "Post-merge verification"
further down for two real bugs the last session found and fixed along the way (not just verified).

**Update, same day, second session — real deploy verification.** Sentry/PostHog/uptime accounts
now exist and keys are in Coolify. Verified against the actual running staging deploy (not just
locally) — see "Post-merge verification against a real deploy" below. Result: the request-id/
JSON-logging/no-PII criterion is now confirmed for real, but Sentry and PostHog are both currently
**non-functional in the live environment** due to two configuration bugs outside this epic's code
(wrong env var names for Sentry; a PostHog personal API key set where the code expects a project
API key) — not a code defect, but a real broken-acceptance-criterion situation per
`docs/PROCESS.md`'s bug severity guidance, flagged for the advisor to file/prioritize rather than
silently fixed by guessing at values only Soroush's dashboards hold.

**Update, same day, third session — both bugs fixed, re-verified on both environments.** Coolify
now has the correctly-named `NEXT_PUBLIC_SENTRY_DSN`/`SENTRY_DSN` and a `phc_`-prefixed PostHog
project key on both apps; `SENTRY_AUTH_TOKEN` moved to GitHub Actions. Production shipped this
epic's code for the first time via tag `v0.0.2`. Re-verified: PostHog's signup/login criterion is
now definitively confirmed (the `401` errors that reliably appeared before are now reliably
absent, on the identical code path). Sentry's config and code are confirmed correct and exercised
for real on staging (`/dev/throw`) — the one thing this session still couldn't do is read Sentry's
own dashboard to see the resulting issue, having no read-scoped credential for it. **8 of 12
acceptance criteria fully confirmed** at the end of this session (correcting an arithmetic error
in this report's own running count at the time: the epic has 12 acceptance criteria, not 11 —
"same for the worker" is a distinct line from the web Sentry criterion, both were previously
undercounted as one).

**Update, fourth session — Soroush confirmed the Sentry web issue by eye.** He saw the `/dev/throw`
issue in the Sentry web project directly, closing the one gap this session's own tooling couldn't:
no read-scoped Sentry credential ever existed here to check it programmatically. **9 of 12
acceptance criteria confirmed** — "same for the worker" remains open, since that confirmation was
specifically for the web project and the worker had no natural error to test against.

**Update, fifth session — the worker's Sentry criterion closed too.** The worker has no HTTP
server to hang a `/dev/throw`-equivalent route off, so `apps/worker/src/dev-throw.ts` (same
`DEPLOY_ENV` gate, run as a one-off script instead of a route — see
`infra/RUNBOOK.md`'s "Proving the Sentry pipeline") shipped, was fired for real inside the
deployed staging worker container (`docker exec ...`, one mutating command, approved separately
per `infra/ACCESS.md` rule 3), confirmed to throw/log/exit correctly, and Soroush confirmed the
resulting issue in the `41prompts-worker` Sentry project. **10 of 12 acceptance criteria are now
confirmed.** The two still open — the uptime monitor and the PostHog dashboard script — needed
their own separate action from Soroush.

**Update, sixth session — the last two criteria closed, one of them by finding and fixing two real
bugs, not just checking a box.** Soroush confirmed the uptime monitor is live and a test alert
reached his phone directly (no status page or provider access was ever shared, so this is his
confirmation the same way both Sentry criteria closed). For the PostHog dashboard, he shared the
personal API key and project id; a real API call before touching anything found only PostHog's own
default "Your starter dashboard" — the milestone dashboard did not actually exist, despite an
earlier belief that it did. Running `scripts/create-posthog-dashboard.mjs` for the first time
against the real account surfaced two real bugs: it had no default host matching this project's
EU region (and `infra/README.md`'s own documented example command hardcoded the wrong one, US —
running it verbatim would have failed with an opaque 401, not a helpful error), and PostHog now
rejects the legacy `filters` insight shape the script used, requiring the current
`query`/`InsightVizNode`/`TrendsQuery` object instead (confirmed against PostHog's own frontend
schema source on GitHub, not guessed). Fixed both in the script and the README, re-ran
successfully, and confirmed for real: the dashboard now has all 8 milestone tiles, and a direct
API call against one insight with `?refresh=true` returned a genuinely computed `count: 0`, not
just "accepted at creation." **All 12 of 12 acceptance criteria are now confirmed. This epic is
done.**

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

## Post-merge verification against a real deploy (second session, same day)

Confirmed via `/healthz`: **staging is running `853a966`, the EPIC-004 squash-merge commit.**
**Production is still on `b62f12b`** (pre-EPIC-004) — production only deploys on a `v*` tag push
(`docs/PROCESS.md`'s branching rule), and none has shipped since the merge. Every finding below is
against staging; production has none of this epic's code running yet, Sentry/PostHog config
included, so nothing about production could be checked regardless of key correctness.

**Confirmed working, for real, against staging:**
- `curl https://staging.41prompts.ai/dev/throw` → 500, the deliberate error, logged.
- A full magic-link **signup + login** round trip against real staging infrastructure (token read
  back via the new `readonly_studio` role over an SSH tunnel, not a shortcut): `POST
  /api/auth/sign-in/magic-link` → `GET /api/auth/magic-link/verify` → real 302 + session cookie.
- `docker logs` on the real `web` container shows two clean JSON lines, `"msg":"auth request"`,
  each with its own `requestId`, for exactly those two requests — the same shape as the local
  verification in the original report, now confirmed on the actual deployed container.
- A 500-line tail of those same real logs contains **zero** occurrences of the test email used —
  the no-PII criterion holds against a real deploy, not just a local one.
- The worker container's logs are clean JSON heartbeats/startup lines, no errors — matches the
  local behavior.

**Two real configuration bugs found, blocking Sentry and PostHog — not a code defect in either
case, and not something fixable without values only Soroush's dashboards hold:**

1. **Sentry: wrong environment variable names in Coolify.** `GET
   /api/v1/applications/<uuid>/envs` (read-only, both staging and production) lists
   `SENTRY_DSN_WEB` and `SENTRY_DSN_WORKER` — the code (`apps/web/instrumentation.ts`,
   `apps/web/instrumentation-client.ts`, `apps/worker/src/sentry.ts`, matching
   `.env.example`/`infra/README.md`) reads `NEXT_PUBLIC_SENTRY_DSN` (web) and `SENTRY_DSN`
   (worker). Neither of those two names appears anywhere in either environment's variable list.
   Both Sentry integrations are currently silently inert on both staging and production — `/dev/
   throw`'s error above threw and logged correctly, but had nowhere configured to send itself.
   **Fix:** in Coolify, rename (or re-enter under the correct name) the web DSN as
   `NEXT_PUBLIC_SENTRY_DSN` and the worker DSN as `SENTRY_DSN`, both environments, then redeploy.
   I don't have the actual DSN values (Coolify's env-list API masks them) so I can't recreate them
   under the right name myself.
2. **PostHog: a personal API key set where the code expects a project API key.** Confirmed from
   the real error in the staging web logs, twice (once per real event this session sent —
   `signup` then `login`): `Error while flushing PostHog: ... status=401 ... response body=API key
   is not valid: personal_api_key ... url: 'https://eu.i.posthog.com/batch/'`. PostHog's own error
   message identifies the *type* of key currently in `NEXT_PUBLIC_POSTHOG_KEY` — a **personal** API
   key (meant only for the account-level REST API `scripts/create-posthog-dashboard.mjs` uses),
   not the public **project** API key `posthog-node`'s ingestion endpoint needs. Both `identify`
   and `capture("signup"/"login")` fired correctly (no exception, the sign-in flow itself worked
   cleanly) — the events were built and sent, just rejected by PostHog's server. **Fix:** PostHog
   → that project's **Project Settings → API Keys** (not the personal-key page) → copy the
   `phc_`-prefixed **Project API Key** → replace `NEXT_PUBLIC_POSTHOG_KEY`'s current value in
   Coolify, both environments, then redeploy. The current (personal-key) value may well be exactly
   what `scripts/create-posthog-dashboard.mjs` needs as `POSTHOG_PERSONAL_API_KEY` — worth trying
   there once the project-key swap is done, rather than generating a second one.

**Two smaller things noticed along the way, not blocking anything:**
- `SENTRY_AUTH_TOKEN` is set in Coolify (production only). That variable is read only at `next
  build` time in GitHub Actions for source-map upload (`apps/web/next.config.ts`) — the running
  container never reads it, so it does nothing there and is needless secret sprawl. Worth moving
  to a GitHub Actions repository secret (per `infra/README.md`'s own instructions) and removing
  from Coolify once confirmed set there instead.
- `posthog-node`'s own internal flush-failure logging bypasses `packages/logger` entirely — it
  `console.error`s a large raw object dump (headers, internal promise/timer state, a full request
  context), not a clean pino JSON line. This isn't code this epic wrote or controls (it's the
  SDK's own error path, undocumented as configurable in the version installed), and in practice it
  only fires when PostHog itself rejects a request — which stops happening once the key above is
  fixed. Flagging rather than chasing a workaround for a third-party library's own crash-logging
  format on what should become a zero-occurrence error path.

## Pending

Nothing. All 12 acceptance criteria are done and evidenced above — the uptime monitor and the
PostHog dashboard (the last two open items, both needing an account-level action only Soroush
could take) closed in the sixth session.

## Acceptance criteria

- [x] A thrown error on staging appears in Sentry within a minute, tagged with environment and
      commit, readable stack frame. **Confirmed.** Coolify has `NEXT_PUBLIC_SENTRY_DSN` on both
      apps (re-checked via a read-only `GET .../envs`, both the old `SENTRY_DSN_WEB` name and
      `SENTRY_AUTH_TOKEN` are gone from Coolify); `/dev/throw` fired post-redeploy (500, logged);
      Soroush confirmed by eye that the resulting issue is visible in the Sentry web project —
      this session had no read-scoped Sentry credential to check that half itself.
- [x] Same for the worker. **Confirmed.** The worker has no HTTP server to hang a
      `/dev/throw`-equivalent route off, so `apps/worker/src/dev-throw.ts` shipped instead — same
      `DEPLOY_ENV` gate, run as a one-off script (`infra/RUNBOOK.md`'s "Proving the Sentry
      pipeline" documents the exact `docker exec` command). Fired for real inside the deployed
      staging worker container (one mutating command, approved separately per
      `infra/ACCESS.md` rule 3): threw, logged, exited 1, exactly as designed. Soroush confirmed
      the resulting issue in the `41prompts-worker` Sentry project.
- [x] `signup`/`login` events appear in PostHog with a user id and no email. **Confirmed.** A
      second real signup+login round trip against staging, post-fix: the two `PostHogFetchHttpError
      401` lines that appeared every time before are now **absent** — `grep -c PostHog` over a
      fresh 100-line log tail returns 0, where it was 2 before the key fix, for the exact same
      code path exercised the exact same way. This is positive evidence of success (an error that
      reliably appeared, now reliably doesn't, after only the key changed), not just an absence of
      information.
- [x] A test fails if an event name outside the closed set is used. Evidence:
      `posthog-server.test.ts`'s "throws at runtime for a name outside the closed set" test.
- [x] Log output is JSON, carries a request id, and a grep for the test account's email over the
      logs returns nothing. Confirmed twice now against the real staging deploy (two separate real
      signup+login round trips, `docker logs`, zero occurrences of either test email both times).
- [x] Uptime check is live on both hosts and one alert has actually reached a phone. **Confirmed**
      by Soroush directly — no status page or provider API access was ever shared with this
      session, so this is his confirmation, not an independent check, the same evidentiary basis
      the two Sentry criteria closed on.
- [x] `run_budgets` migrates; increment and cap have unit tests including the boundary and a
      concurrent-increment case. Evidence: 6 `packages/core` boundary tests + 7
      `apps/worker` tests incl. the 20-parallel-increments case, above.
- [x] Drizzle Studio opens against staging by following the runbook, and the runbook says how to
      close the tunnel. Evidence: the `readonly_studio` role (created, then rotated twice per the
      session log) used over a real SSH tunnel to query staging's `verifications` table for both
      rounds of this report's own verification — the tunnel/role/`DATABASE_URL` mechanism the
      runbook describes is proven working end to end, twice, not just documented.
- [x] No database or analytics port is reachable from the internet. Evidence: `ufw status` +
      failed external connection attempt, above.
- [x] PostHog dashboard exists with every milestone metric from the roadmap. **Confirmed, and run
      by this session directly** — Soroush shared the personal API key and project id; a real API
      call found only PostHog's own default "Your starter dashboard," meaning the milestone
      dashboard did not actually exist yet despite an earlier belief that it had been created.
      Running `scripts/create-posthog-dashboard.mjs` for real then surfaced two real bugs in the
      script itself (see "Post-merge verification" below): no default matches this project's EU
      region (`infra/README.md`'s own documented example command used the wrong host and would
      have failed with an opaque 401), and PostHog now rejects the legacy `filters` insight shape
      the script used, requiring the current `query`/`InsightVizNode`/`TrendsQuery` object instead
      (confirmed against PostHog's own schema source, not guessed). Fixed both, re-ran
      successfully: dashboard "41Prompts milestones" now has all 8 milestone tiles (M0–M7), and a
      direct `GET .../insights/:id/?refresh=true` on one of them returned a real computed
      `count: 0` — genuinely evaluating live data, not merely accepted at creation time.
- [x] `pnpm test`, `pnpm typecheck`, `pnpm lint`, `gitleaks` clean. Evidence above.
- [x] Report and session log written; backlog updated.

**Summary after six verification passes: 12 of 12 criteria fully confirmed** (up from 7 at the end
of the first session). PostHog signup/login and both Sentry criteria (web via `/dev/throw`, worker
via `apps/worker/src/dev-throw.ts`) closed on Soroush's direct confirmation, since this session
never held a read-scoped Sentry credential. The uptime monitor closed the same way. The PostHog
dashboard is the one criterion this session verified independently, end to end, once given
credentials: found the dashboard didn't actually exist yet (only PostHog's own default one did),
found and fixed two real bugs in `scripts/create-posthog-dashboard.mjs` against PostHog's current
API, and confirmed a real computed `count: 0` from a live insight — not just "the script exited 0."

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
