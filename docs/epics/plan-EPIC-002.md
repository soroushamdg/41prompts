# Plan: EPIC-002 Data layer and auth

Branch: `epic/002-data-and-auth`. Build order per instruction: schema/migration → Better Auth + 3 providers →
middleware + 4 pages → purge job → tests → verify on staging.

## 0. Preconditions checked

- `packages/db` is a placeholder (`_placeholder = true`), no real migrations exist yet.
- `drizzle-orm` + `pg` already pinned in `packages/db`; `better-auth`, `pg-boss`, `resend`, `@playwright/test`
  are not installed anywhere — new deps.
- No `middleware.ts`, no `/sign-in|/sign-up|/app` routes, no id-generation helper, no e2e setup, no CI e2e job.
- `.env.example` already stubs all six secrets + `BETTER_AUTH_URL`, just needs per-line comments.
- The `${...}` rule (EPIC-001 F2 / EPIC-008): new secrets must reach containers only via Coolify's Environment
  Variables tab → auto-generated `.env` → `env_file: .env`. Never add a `${NEW_VAR}` to
  `infra/docker-compose.{staging,production}.yml`. Nothing about EPIC-002 requires touching those two files.

## 1. Schema and migration (`packages/db`)

- `src/ids.ts`: `newId(prefix, hexBytes)` using `node:crypto` `randomBytes`; `newProjectId()` → `proj_` + 4 hex
  (2 bytes), `newPromptId()` → `pr_` + 8 hex (4 bytes) — prompt id helper is unused until EPIC-020+ but the
  epic file names both shapes together, so define both here once rather than twice later. Vitest: format,
  uniqueness over N draws, hex-only body.
- `src/schema.ts`: replace placeholder.
  - Better Auth core tables — shape follows Better Auth's own Drizzle adapter expectations exactly (confirmed
    by reading the installed package's schema/types after `pnpm add`, not guessed): `user`, `session`,
    `account`, `verification`. Native Better Auth id shape (text, its own default id generator) — decision 4
    says explicitly not to force our prefixed ids onto these.
  - `deletedAt` timestamp column added to `user` for soft delete (decision 5) — additive to Better Auth's own
    columns, doesn't conflict with its adapter contract as long as it's nullable and Better Auth never writes
    it.
  - `projects`: id `proj_` + 4 hex, `owner` FK → `user.id`, `name`, `slug` (unique), `createdAt`, `deletedAt`.
  - `apiKeys`: id, `project` FK → `projects.id`, `name`, `hashedKey`, `lastFour`, `createdAt`, `lastUsedAt`,
    `revokedAt`. No plaintext key material column, ever (decision 4).
- `pnpm db:generate` → first real migration SQL under `packages/db/drizzle/`.
- Local verification: bring up a throwaway Postgres (`docker run --rm -p 5433:5432 -e POSTGRES_PASSWORD=... postgres:16`
  or reuse `infra/docker-compose.yml`'s `postgres` service), run `db:migrate` twice, confirm second run is a
  no-op (exit 0, no new SQL applied) — this is the epic's first acceptance criterion.
- Seed script: `packages/db/src/seed.ts` (or `scripts/seed.ts`), one user + one project, guarded so it only
  ever runs against a local/dev database (checks `DEPLOY_ENV !== "development"` and refuses otherwise, since
  this must never run against staging/production).

## 2. Better Auth (`apps/web`)

- Install `better-auth`, `resend`.
- `apps/web/lib/auth.ts` (or similar): `betterAuth()` config — Drizzle adapter over `@41prompts/db`'s schema,
  `emailAndPassword` disabled (no passwords, decision 2), `socialProviders: { google, github }` reading
  `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET` from `process.env`, magic-link plugin (`better-auth/plugins`)
  with a `sendMagicLink` callback that calls Resend — no-ops (no network call, no log line) when
  `RESEND_API_KEY` is unset, which is what CI and local dev without the secret rely on; the Playwright magic-link
  test reads the token straight from the `verification` table instead of an inbox, so the no-op path is
  sufficient for it. Session config: cookie `httpOnly`, `secure`, `sameSite: "lax"`, `__Host-` prefix on the
  session cookie name, 30-day rolling expiry, rotate on sign-in — read exact option names from the installed
  package's types rather than assuming. `baseURL` read from `BETTER_AUTH_URL` env var, never hard-coded.
  Rate limiting: Better Auth's built-in rate limit config, a custom rule scoped to the magic-link
  send endpoint, keyed by IP; per-email throttling added at the app layer (a small check against the
  `verification` table's recent rows for that email) since Better Auth's own limiter is IP/route-keyed, not
  identity-keyed — confirm this gap against the installed types before writing the per-email path, and if the
  installed version already supports per-identifier limiting, use that instead and drop the custom check.
- `apps/web/app/api/auth/[...all]/route.ts`: Better Auth's Next.js route handler export.
- Constants: `packages/core` is zero-dependency pure logic — but this is web/db-specific, not segmenter-shaped,
  so the purge window constant (`ACCOUNT_PURGE_WINDOW_DAYS = 30`) lives in `packages/db/src` (shared by web's
  delete-account handler, for messaging, and the worker's purge job) rather than in `packages/core`.

## 3. Middleware and four pages (`apps/web`)

- `middleware.ts`: matcher `/app/:path*`. Reads the Better Auth session cookie (edge-safe check, not a full DB
  round trip if avoidable — check what Better Auth's Next.js helpers offer for this). No session → redirect to
  `/sign-in?next=<path>`. `next` validation lives in a small pure function (`packages/core`? — no, this is a
  web routing concern, not segmenter/compiler logic; put it in `apps/web/lib/next-url.ts` with a Vitest suite
  directly): only a same-origin relative path starting with a single `/` and not `//` is accepted (rejects
  `https://evil.example`, `//evil.example`, `/\evil.example`); anything else falls back to `/app`.
- `/sign-in`, `/sign-up`: plain semantic HTML forms — Google button, GitHub button, email input + magic-link
  submit. Real `<form>`/`<label>`/`<button>` elements, visible focus states, no styling beyond what's needed for
  layout legibility (decision 7). Every string checked against ADR-003's forbidden list.
- `/app`: server component, redirects (via middleware) if unauthenticated; shows the signed-in email and a
  sign-out control (form posting to a server action / API route that calls Better Auth's sign-out, per decision
  3 "sign-out must kill a session server-side").
- `/app/account`: shows email, a delete-account control behind a confirmation step (destructive action inside
  the product, not just a bare button) that sets `deletedAt`, kills the session, and redirects to `/sign-in`.

## 4. Purge job (`apps/worker`)

- Install `pg-boss`.
- `apps/worker/src/jobs/purge-deleted-users.ts`: queries `user` rows where
  `deletedAt < now - ACCOUNT_PURGE_WINDOW_DAYS`, cascades to owned `projects`/`apiKeys` (FK `ON DELETE CASCADE`
  in the schema, or explicit deletes in a transaction if the adapter's cascade isn't reliable — decide once the
  schema is written and pick the simpler one), logs a count only (`purged: 3`), never an id/email. Clock is
  injected (a `now: () => Date` parameter) so Vitest can move it without faking global timers.
- `apps/worker/src/main.ts`: start a `pg-boss` instance on `DATABASE_URL`, register the job on a daily
  schedule, keep the existing signal-handling shape (extend, don't replace, the current heartbeat/shutdown
  test pattern).
- Idempotent + safe on empty table: covered by the Vitest suite (29-day clock → 0 rows purged; 31-day clock →
  row purged; running twice at 31 days → second run purges 0, doesn't error).

## 5. Tests

- Vitest: id generation (`packages/db`), purge job at 29/31 days + double-run (`apps/worker`), `next` URL
  validation (`apps/web`), api-key hashing (`packages/db`, if hashing lives there) or wherever the hashing
  function ends up living.
- Playwright (new: `playwright.config.ts` at repo root or `apps/web/`, root `pnpm e2e` script, a Postgres
  service in CI): magic-link sign-up (submit email, query the `verification` table directly for the token,
  visit the magic-link URL, land on `/app`), unauthenticated `/app` → `/sign-in?next=/app`, `next` round-trip
  after sign-in, sign-out kills the session (old cookie can't reach `/app` again).
- CI: add an `e2e` job (or step) with a `postgres:16` service container, `pnpm db:migrate` before running
  Playwright, dummy non-secret `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET` (never real), no
  `RESEND_API_KEY` (exercises the no-op send path, matching what the magic-link test needs).

## 6. Docs and secrets

- `.env.example`: per-line comments on the six secrets + `BETTER_AUTH_URL` (already stubbed, just needs
  prose).
- `infra/README.md`: new step documenting the six Coolify secrets, where they come from, and that
  `BETTER_AUTH_URL` is set per environment (`https://staging.41prompts.ai`, `https://app.41prompts.ai`) — not
  secret, but still only reaches the container via the same Environment Variables tab.
- The one checklist message to Soroush (OAuth apps ×2 environments, Resend account + domain verification, six
  Coolify secrets) goes out once the code is written and I know the exact callback URLs Better Auth expects
  (confirmed against the installed package, expected default `/api/auth/callback/{provider}` under
  `BETTER_AUTH_URL`) — not before, and not drip-fed after.

## 7. Verification sequence

1. `pnpm db:generate && pnpm db:migrate && pnpm db:migrate` (second is a no-op) — local Postgres.
2. `pnpm test && pnpm typecheck && pnpm lint` — local.
3. `pnpm e2e` — local, against local Postgres, dummy OAuth env vars.
4. Push branch, open PR, confirm CI green.
5. Squash-merge → `main` auto-deploys staging. Once Soroush has set the six secrets there, confirm real Google,
   GitHub, and magic-link sign-in on `https://staging.41prompts.ai`, cookie flags via response headers, and a
   read-only grep of staging web/worker logs for the test account's address (must return nothing).
6. Write report + session log, flip `docs/backlog.md` and `CURRENT.md` to EPIC-003.

## Open risk flagged now, not discovered mid-build

Real end-to-end OAuth/magic-link verification on staging depends on Soroush completing the checklist (creating
two OAuth apps, a Resend account + verified domain, six Coolify secrets). Code, tests, and the PR can be
finished and merged without that being done yet, but the epic's own acceptance criteria are explicit that a
passing local Playwright run is not sufficient — the report will not claim the epic done until the staging
sign-ins are actually verified. If that verification is still pending when everything else is finished, the
report says so plainly rather than treating CI-green as equivalent to done.
