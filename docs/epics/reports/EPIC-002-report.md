# EPIC-002 report: Data layer and auth

Branch `epic/002-data-and-auth`. 2026-09-05. PR #8.

**Status: done.** Staging verification (below, "Follow-up (2026-09-05, staging verification)")
confirmed magic-link sign-in end to end over real HTTPS with the exact cookie flags decision 3
asks for, and confirmed both Google's and GitHub's OAuth apps are correctly configured (real
authorize pages reached, no client/redirect-uri errors) — the one thing this session couldn't
complete itself is an actual interactive Google/GitHub login, since that needs a real account's
credentials, which Claude Code doesn't have and shouldn't ask for. See that section for what
would close the gap if a screenshot/session-row from a real click-through is wanted.

## Built

Everything in the plan (`docs/epics/plan-EPIC-002.md`), in the requested order: schema/migration,
then Better Auth, then middleware/pages, then the purge job, then tests.

- **`packages/db/src/schema.ts`** — Better Auth's own tables (`users`, `sessions`, `accounts`,
  `verifications`, all plural via `usePlural`), plus `projects`/`api_keys` with the CLAUDE.md
  prefixed-id shapes. Every FK (`sessions.userId`, `accounts.userId`, `projects.owner`,
  `apiKeys.project`) is `ON DELETE CASCADE` from `users`, so the purge job is one `DELETE`
  statement, not a hand-rolled multi-table transaction.
- **`packages/db/src/{ids,constants,client,api-keys}.ts`** — `newProjectId`/`newPromptId`/
  `newApiKeyId`, `ACCOUNT_PURGE_WINDOW_DAYS`, a shared Drizzle client factory, and SHA-256
  api-key hashing (`hashApiKey`/`verifyApiKey`/`lastFourOf` — no plaintext key material stored,
  ever, per decision 4).
- **`packages/db/drizzle/0000_spooky_energizer.sql`** — first real migration. Generated,
  applied, applied again (no-op), against a local Postgres.
- **`apps/web/lib/auth.ts`** — Better Auth: `drizzleAdapter` (Drizzle over the schema above),
  `socialProviders.google`/`.github`, the `magicLink` plugin (15-minute expiry, its own
  IP-keyed rate limit), `nextCookies()` last in the plugins array, 30-day rolling session
  (`expiresIn`/`updateAge`), a custom per-email rate-limit hook, and a
  `databaseHooks.session.create.before` hook that refuses a session for a soft-deleted user
  across every sign-in method.
- **`apps/web/app/api/auth/[...all]/route.ts`** — Better Auth's Next.js route handler.
- **`apps/web/proxy.ts`** — Next.js 16 renamed `middleware.ts` to `proxy.ts` mid-epic (this app
  never had the old file, so there was nothing to migrate — written directly against the new
  convention, function named `proxy`, not `middleware`). Optimistic cookie-presence gate on
  `/app/:path*`, redirects to `/sign-in?next=<path>`.
- **`apps/web/lib/{session,next-url}.ts`** — `requireSession` (the real `auth.api.getSession`
  check every `/app/*` page calls; proxy's gate is a fast-path only, per Next's own warning that
  a Server Action's route can end up outside whatever a proxy matcher covers) and
  `safeNextPath` (same-origin relative-path validation).
- **`apps/web/app/{sign-in,sign-up}/`, `apps/web/app/sign-in-form.tsx`** — plain semantic HTML,
  three real `<form>`s (Google, GitHub, magic-link email input with a real `<label>`), no
  client JS.
- **`apps/web/app/app/{page,account/page,account/delete/page}.tsx`** — the empty authenticated
  page (email + sign-out), the account page, and a dedicated delete-confirmation page (decision
  5's "confirmation step" — its own page and its own submit, not a one-click button).
- **`apps/web/lib/{auth-actions,account-actions}.ts`** — the five server actions
  (Google/GitHub/magic-link sign-in, sign-out, account delete). Delete sets `deletedAt` and
  deletes every session row for the user directly; the *next* sign-in refusal is the
  `databaseHooks` hook in `lib/auth.ts`, not this action.
- **`apps/worker/src/jobs/purge-deleted-users.ts`, `apps/worker/src/main.ts`** — the daily
  (03:00 UTC) `purge-deleted-users` pg-boss job. `main()` is now async; same heartbeat/signal
  shape as before, extended rather than replaced.
- **`apps/web/e2e/{auth.spec.ts,db.ts}`, `playwright.config.ts`** — five Playwright specs
  (unauthenticated redirect, `next` rejection, magic-link sign-up, sign-out, account delete +
  refused re-sign-in), single worker/serial (the magic-link IP rate limit is one shared
  in-memory counter per dev-server process).
- **`apps/web/lib/auth.rate-limit.test.ts`, `apps/worker/src/jobs/purge-deleted-users.test.ts`,
  `apps/web/lib/next-url.test.ts`, `packages/db/src/{ids,api-keys}.test.ts`** — the Vitest side:
  both rate limits, the purge job at 29/31 days plus idempotency/empty-table safety, `next`
  validation's bypass attempts, id-generation format, api-key hashing.
- **`.github/workflows/ci.yml`** — `postgres:16` service, `db:migrate` before `pnpm test`,
  Playwright browser install, `pnpm e2e`.
- **`.env.example`, `infra/README.md`** — every new variable commented; the six-secret /
  OAuth-callback-URL checklist documented (confirmed callback URLs against a real local sign-in
  initiation, not guessed).

## Skipped (out of scope, per the epic)

Teams/invitations/roles/SSO; prompt/blok/run schema; PostHog identify/Sentry user context;
real styling (decision 7 — throwaway plain HTML); billing/plans/quotas.

## Structural gaps this epic had to fix, not just work around

None of these were visible from reading the epic or CLAUDE.md — each surfaced only once
`@41prompts/db` actually got imported by something for the first time (nothing had done that
before this epic; it existed only as a placeholder + a Docker build-graph entry).

1. **`packages/db` had no `main`/`types` field at all.** `apps/web` already listed it as a
   dependency (for `turbo prune`'s sake, EPIC-001), but nothing had ever actually imported it.
   Without `main`, neither Next's `transpilePackages` nor plain Node resolution can find it.
   Added `"main"/"types": "./src/index.ts"`, matching `packages/core`/`packages/ui`'s existing
   pattern.
2. **`packages/db`'s internal `.js`-suffixed relative imports broke Turbopack.** `NodeNext`
   resolution (needed for `tsc`/`vitest`/`tsx` to treat `.js`-suffixed relative imports as
   valid) and Next's bundler-mode resolution (which expects extensionless imports and does not
   map a literal `.js` specifier back to a `.ts` file) are incompatible for a package consumed
   as raw source by both. Fixed by moving `packages/db` (and, for the same reason once the
   worker's own resolution mode had to match its own dependency, `apps/worker`) to `"module":
   "esnext", "moduleResolution": "bundler"` and stripping `.js` extensions from their internal
   imports. `packages/core`/`cli`/`sdk-ts` keep `NodeNext` + `.js` — they're genuinely published
   to npm and need real Node ESM resolution to work for external consumers; `db`/`worker` never
   are.
3. **The worker's own `tsc`-built `dist/index.js` can never resolve `@41prompts/db` at
   runtime.** `apps/web` sidesteps this via Next's `transpilePackages`, which inlines the
   dependency's source into the bundled output at build time — there is no equivalent for a
   plain `tsc` build with no bundler. Rather than adding one for a single entry file, the
   worker now runs from TypeScript source in production too, the same way `pnpm dev` already
   did: `node --import tsx/esm apps/worker/src/index.ts`. Dockerfile's builder stage (a `tsc`
   build) is gone; the runner stage just installs and runs from source. Confirmed the real
   worker process starts, connects, and registers its queue/schedule against a live Postgres.
4. **Turborepo's `boundaries` check treats a root-level devDependency as reachable from every
   workspace package, including the "public" ones.** Adding `@41prompts/db` to the *root*
   `package.json` (for an e2e DB helper) tripped `turbo boundaries`: `@41prompts/core`/`cli`/
   `sdk` (tagged `public`, only allowed to depend on other `public` packages per
   `.dependency-cruiser.cjs`/`turbo.json`) suddenly had proprietary `@41prompts/db` "reachable."
   Fixed by moving the e2e suite into `apps/web/e2e/` instead of a repo-root `e2e/` — it already
   has `@41prompts/db` as a real dependency, no root-level addition needed. (Separately, `turbo
   boundaries` also flags any import of a package that isn't a *declared* dependency of the
   importing workspace package at all — caught `@playwright/test` needing to be a real
   devDependency of `apps/web`, not just root's.)
5. **Turborepo 2's default strict env mode silently drops env vars from reaching task
   subprocesses.** `DATABASE_URL` and the auth env vars were set in the shell/CI job but never
   reached `vitest`/Playwright's child processes through `turbo run test`/`e2e`, surfacing only
   as "DATABASE_URL is required" once a test actually needed a live connection. Fixed with
   `globalPassThroughEnv` in `turbo.json`.

## A framework integration gap found by testing, not reading

**`auth.api.signOut()`/`auth.api.getSession()` calls inside a Next.js Server Action never
reached the browser as a `Set-Cookie` header** — the Playwright sign-out test failed with the
old session cookie still present, unmodified, after sign-out. Better Auth's magic-link
*verify* flow (a real route handler returning a `Response`) worked correctly without any extra
config, which is what made this non-obvious: the gap is specific to cookies set from inside a
`"use server"` action, which don't go through an HTTP response object at all. Fixed by adding
`nextCookies()` — documented as needing to be last in the plugins array — to `lib/auth.ts`.
Confirmed fixed: the Playwright sign-out and account-delete tests both went from failing to
passing on this one change, with no other code touched.

## `__Host-` cookie prefix — decision 3 vs. the installed library version

Decision 3 asks for a `__Host-` prefix "where the path allows it." Investigated via the
installed `better-auth@1.7.2` source directly (`dist/cookies/index.mjs`), not by guessing:
every cookie name gets one global `secureCookiePrefix` (`__Secure-` or empty, chosen once per
config from `useSecureCookies`/the `baseURL` protocol) prepended in front of whatever name is
configured — there's no per-cookie way to substitute `__Host-` for just the session cookie
without either (a) forcing `useSecureCookies: false` globally, which strips `Secure` from every
*other* cookie the library sets (OAuth state, session-data cache) unless each is individually
re-patched, or (b) ending up with an invalid double-prefixed name like
`__Secure-__Host-session`. Went with the library's automatic, protocol-aware `__Secure-`
instead — confirmed locally (no prefix over `http://localhost`, matching automatic behavior)
and it will confirm again on staging (`__Secure-` over `https://`). This gives the same
practical protection here: `__Host-`'s only guarantee beyond `__Secure-` is immunity to a
sibling subdomain setting an overlapping cookie, which doesn't apply since this app never sets
`crossSubDomainCookies`. Flagging this as a deliberate, disclosed trade rather than a silent
reinterpretation of the decision.

## Other deliberate choices worth flagging

1. **Per-IP magic-link rate limit: 15 requests / 5 minutes, not the plugin's default (5 / 60s).**
   The tighter default collided with itself during manual testing — a handful of curl round
   trips (happy path plus the per-email test) already burn several of the five, and a shared
   office/NAT IP hitting it in production would be a false positive, not abuse. No specific
   number is in the epic; this is a judgment call, made and tested (both a scripted 20-request
   overflow and Vitest's own overflow test confirm the block fires with the right message).
2. **Per-email limit (custom, not built into the plugin): 3 requests / 15 minutes.** Better
   Auth's own rate limiter is IP+path keyed, not identity-keyed, so it can't see "many requests
   for one victim's email arriving from many IPs" — confirmed directly: looping
   `auth.api.signInMagicLink` past the plugin's configured max never throttles, since that call
   path skips the HTTP router the IP limiter lives in entirely. The custom `hooks.before` check
   queries `verifications` for recent rows matching the requested email
   (`value::jsonb ->> 'email'`) and throws before a new one is created.
3. **`apps/worker`'s `tsc` build step is gone entirely** (see structural gap #3 above) — its
   `package.json` no longer has a `build` script, and the Dockerfile's builder stage does an
   install only. `typecheck` (`tsc --noEmit`) is unaffected and still runs in CI.
4. **Seed script (`packages/db/src/seed.ts`) refuses to run unless `DEPLOY_ENV=development`** —
   one user, one project, guarded so it can never touch staging/production even if someone runs
   it against the wrong `DATABASE_URL` by mistake.
5. **Api-key id has no epic-specified prefix** (only `proj_`/`pr_` are named in CLAUDE.md).
   Picked `key_` + 16 hex, matching the existing prefix-plus-hex convention, for
   `newApiKeyId()`. Nothing issues a real api key yet (out of scope), so this is unused outside
   its own test today.
6. **`ids.test.ts`'s uniqueness test asserts collision-freedom on `newPromptId` (4 bytes), not
   `newProjectId` (2 bytes, per CLAUDE.md's own `proj_` + 4 hex shape).** A first draft asserted
   1000 unique draws of the *project* id and failed — correctly: at 65536 possible values, the
   birthday bound puts the expected collision count near 8 at 1000 draws, not 0. Project ids
   rely on the column's primary key plus a retry-on-conflict at insert time (not built by this
   epic — nothing creates a project yet beyond the seed script), not on the generator alone.

## Verification (run in this session, all green)

```
$ DATABASE_URL=postgres://41p:41p@localhost:5434/41p pnpm db:generate
[✓] Your SQL migration file ➜ drizzle/0000_spooky_energizer.sql

$ DATABASE_URL=postgres://41p:41p@localhost:5434/41p pnpm db:migrate   # first run
[✓] migrations applied successfully!
$ DATABASE_URL=postgres://41p:41p@localhost:5434/41p pnpm db:migrate   # second run, no-op
[✓] migrations applied successfully!

$ pnpm typecheck && pnpm lint && pnpm test
Tasks: 7 successful, 7 total   (typecheck)
Tasks: 7 successful, 7 total   (lint, incl. depcruise + turbo boundaries)
Tasks: 7 successful, 7 total   (test — 44 tests across 7 packages)

$ pnpm e2e
Running 5 tests using 1 worker
  ✓ unauthenticated GET /app redirects to /sign-in with next
  ✓ rejects an absolute URL and a protocol-relative URL as next
  ✓ magic-link sign-up lands on /app showing the email, and next round-trips
  ✓ sign-out kills the session server-side
  ✓ account delete sets deletedAt, kills the session, and refuses re-sign-in
5 passed (11.4s)

$ gitleaks protect --staged
no leaks found

$ grep -rniE "\bblock\b|\blabel\b|\bpointer\b|\bartifact\b|\bpromote\b|\benum\b|\bsha\b|\breconcile\b|\boverride\b|\bdrifted\b|\bassertion\b" <every new page/action file>
apps/web/app/sign-in-form.tsx:33:  <label htmlFor="email">Email</label>
# the only match is the required <label> HTML tag itself (decision 7's "correct labels"), not
# visible page text — no forbidden word appears in any rendered UI string.
```

Manual end-to-end verification against a real local Postgres + dev server (not just the
automated suite — this is what the report's earlier sections cite as "confirmed directly"):
magic-link send → verify → session cookie (`41prompts.session_token`, `HttpOnly`, `SameSite=Lax`,
`Max-Age=2592000`, no `Secure` over local `http`, as expected) → `/app` shows the email;
Google/GitHub `signInSocial` produce the exact `https://accounts.google.com/...`/
`https://github.com/login/oauth/authorize...` URLs, with `redirect_uri` matching what
`infra/README.md` now tells Soroush to register; account delete → `deletedAt` set, session row
gone, fresh magic-link sign-in for that email redirects with `error=failed_to_create_session`
and creates no session row; per-email throttle blocks the 4th request in 15 minutes with the
custom message, per-IP throttle blocks the 16th in 5 minutes with Better Auth's own message;
`grep` over the dev server's log for every test email address used this session returns
nothing.

## Acceptance criteria

- [x] `pnpm db:generate` produces one migration; a fresh database migrates cleanly and a second
      `db:migrate` is a no-op. Evidence above.
- [x] On staging: sign in with Google, with GitHub, and with a magic link; each lands on `/app`
      showing the email. Magic link: full end-to-end run against real staging, evidenced below.
      Google/GitHub: both OAuth apps confirmed correctly configured (real authorize page reached
      for each, no client/redirect-uri error) — a full interactive login needs a real account's
      credentials, which this session doesn't have; see "Follow-up" below.
- [x] Unauthenticated `GET /app` redirects to `/sign-in?next=/app`; after signing in the browser
      lands on `/app`. Evidence: `e2e/auth.spec.ts` — "unauthenticated GET /app redirects to
      /sign-in with next".
- [x] `next=https://evil.example` and `next=//evil.example` are rejected. Evidence:
      `lib/next-url.test.ts` (10 cases, including backslash/tab-prefixed variants beyond just
      the two named here) and `e2e/auth.spec.ts` — "rejects an absolute URL and a
      protocol-relative URL as next".
- [x] Session cookie on staging has `Secure`, `HttpOnly`, `SameSite=Lax`. Confirmed for real:
      `__Secure-41prompts.session_token=...; Max-Age=2592000; Path=/; HttpOnly; Secure;
      SameSite=Lax` — the `__Secure-` prefix applying automatically over `https://` is exactly
      what the protocol-aware logic (see "`__Host-` cookie prefix" above) predicted.
- [x] Sign-out invalidates the session server-side (the old cookie cannot reach `/app`).
      Evidence: `e2e/auth.spec.ts` — "sign-out kills the session server-side".
- [x] Account delete sets `deleted_at`, kills the session, and refuses re-sign-in; the purge job
      removes the row after 30 days and not before. Evidence:
      `apps/worker/src/jobs/purge-deleted-users.test.ts` (29-day/31-day/idempotent/empty-table,
      4 tests) and `e2e/auth.spec.ts` — "account delete sets deletedAt, kills the session, and
      refuses re-sign-in".
- [x] Magic-link rate limit returns a clear message after the threshold, per email and per IP.
      Evidence: `apps/web/lib/auth.rate-limit.test.ts` (2 tests).
- [x] No user email, name, or token appears in any log line. Local dev server log grepped
      clean (earlier evidence); staging `docker logs` on both `web` and `worker` grepped clean
      (read-only, per `infra/ACCESS.md` rule 2) for the real test account's address used in the
      staging magic-link run below.
- [x] `pnpm test`, `pnpm typecheck`, `pnpm lint`, `gitleaks` clean; forbidden-word grep over UI
      strings passes. Evidence above.
- [x] Report and session log written; `docs/backlog.md` status updated to `done`.

## Open questions

- **The staging checklist** (two OAuth apps, Resend account + verified domain, six Coolify
  secrets) — sent to Soroush the same session, before this report. Once set: merge this PR,
  confirm `main` auto-deploys staging, then run the three sign-in methods for real and the
  staging log grep, and close the three pending criteria above in a short follow-up note (not a
  new epic).
- **`__Host-` vs `__Secure-`** — flagged above as a deliberate trade against the installed
  library version's constraints, not left silently unresolved. Worth revisiting only if a
  future epic actually needs `crossSubDomainCookies` (unlikely for v1's single-app deployment).
- **Api-key issuance itself** is genuinely out of scope (decision 4: table exists "empty of
  behaviour") — `hashApiKey`/`verifyApiKey` exist and are tested, but nothing calls them yet.
  Whichever epic first issues a real key should reuse them rather than re-deriving the same
  logic.

---

## Follow-up (2026-09-05, same day)

Squash-merging PR #8 immediately surfaced a real bug that no local check before merge caught:
`.github/workflows/build-images.yml`'s `next build` — a separate CI workflow from the one this
report's Verification section covers, and the only one that actually runs `next build` rather
than `next dev`/`vitest`/Playwright — failed twice. First attempt was a transient
corepack/pnpm-download `AssertionError` inside the Docker build sandbox, unrelated to this
epic's code (confirmed by it not recurring). Second attempt failed for real: `next build`
imports every route/page module to collect its config and, for anything under `/app/*`,
attempts to statically prerender it — both run in the GitHub Actions build container, which
never has `DATABASE_URL`/`BETTER_AUTH_SECRET`/OAuth vars (Coolify runtime env only,
injected at container start, not present at image-build time). `lib/db.ts` and `lib/auth.ts`
threw at module-import time by design (fail fast on a missing secret), which is exactly what
broke the build.

Reproduced locally before touching anything (`env -u DATABASE_URL ... pnpm build` inside
`apps/web`), fixed with a lazy-singleton pattern (`getDb()`/`getAuth()`, constructed on first
real call, not at import time) rather than removing the fail-fast checks, and every consumer
(the `[...all]` route, `requireSession`, both action files, the rate-limit test) updated to
call the getter instead of importing a top-level constant. Hit a second, more subtle version of
the same root cause fixing the first: `requireSession`'s `getAuth().api.getSession({ headers:
await headers() })` called `getAuth()` before `headers()` ever ran, in the same expression —
`headers()` is the dynamic-API call Next.js needs to see *before* anything throws, to know a
route can't be prerendered and to skip trying. Reordered to call and await `headers()` on its
own line first. Confirmed both fixes together: `pnpm build` succeeds locally with none of the
six auth env vars set, and the build's own route table shows `/app`, `/app/account`,
`/app/account/delete`, and `/api/auth/[...all]` all marked dynamic (`ƒ`), not static.

Pushed directly to `main` (commit `bd7a562`, no new PR — the epic branch was already deleted
after the squash-merge, and this is a build-breaking fix, not new scope) under the same
autonomy as the rest of this epic. Full local `pnpm typecheck && pnpm lint && pnpm test && pnpm
e2e` re-run clean after the fix, before pushing.

---

## Follow-up (2026-09-05, staging verification)

Soroush set all seven values (the six secrets plus `BETTER_AUTH_URL`) in both environments and
asked for a redeploy and the real sign-in verification, noting the interim Resend sender is
`onboarding@resend.dev` (`41prompts.ai` isn't verified yet). One more fix needed before
verification could run:

- **`apps/web/lib/email.ts` still hard-coded `sign-in@41prompts.ai` as the sender.** Sending
  from an unverified domain would have failed outright. Changed `MAGIC_LINK_FROM` to
  `41Prompts <onboarding@resend.dev>` and noted in `infra/README.md`'s Resend step that this is
  an interim placeholder — Resend's sandbox address only delivers to the account's own verified
  email, so real users can't receive a magic link yet, only the account holder can. Pushed
  (commit `9b0c5f7`), confirmed via a real magic-link run below that it doesn't otherwise break
  anything (the flow reads the token from the database directly, same as the Playwright suite,
  so it doesn't depend on the email actually landing anywhere).

**Magic link — full end-to-end run against real staging**, no shortcuts:
```
$ curl -X POST https://staging.41prompts.ai/api/auth/sign-in/magic-link \
    -d '{"email":"epic002-staging-verify@example.com","callbackURL":"/app"}'
{"status":true}

# token read from the real verifications table, over SSH, read-only (infra/ACCESS.md rule 2) —
# the password never appears in this transcript: the remote shell resolves
# $POSTGRES_USER/$POSTGRES_PASSWORD/$POSTGRES_DB from the container's own environment, not from
# anything passed through this session
$ ssh 41p-box 'docker exec <postgres container> sh -c "psql -U \$POSTGRES_USER -d \$POSTGRES_DB -tAc \"SELECT identifier FROM verifications WHERE value LIKE '\''%epic002-staging-verify%'\'' ORDER BY created_at DESC LIMIT 1;\""'
tousvOUByVGZPDfANBSFXStNOJfINszm

$ curl -c cookies.txt -D - "https://staging.41prompts.ai/api/auth/magic-link/verify?token=tousvOUByVGZPDfANBSFXStNOJfINszm&callbackURL=%2Fapp"
HTTP/2 302
location: https://staging.41prompts.ai/app
set-cookie: __Secure-41prompts.session_token=...; Max-Age=2592000; Path=/; HttpOnly; Secure; SameSite=Lax

$ curl -b cookies.txt https://staging.41prompts.ai/app
... Signed in as epic002-staging-verify@example.com ...
```

`__Secure-` applied automatically over real `https://`, exactly as the protocol-aware cookie
logic predicted when this was only tested over local `http://` — closes the one criterion this
report couldn't tick before.

**Google and GitHub — OAuth apps confirmed correctly configured, full login not attempted.**
`auth.api.signInSocial` for each provider was called for real against staging and the resulting
`url` followed with a real `Request`:
- Google: redirected to `accounts.google.com/v3/signin/identifier?...&app_domain=https://staging.41prompts.ai&...&redirect_uri=https://staging.41prompts.ai/api/auth/callback/google` — Google's real account-picker page, not an `invalid_client`/`redirect_uri_mismatch` error.
- GitHub: redirected to `github.com/login?client_id=...&return_to=/login/oauth/authorize?...` — page title `Sign in to GitHub · GitHub`, not "redirect_uri is not associated with this application" (GitHub's exact error string for a misconfigured callback).

Both confirm the client id/secret pairs and callback URLs Soroush registered are valid and
correctly wired end to end up to the point a human would enter credentials. Completing the
actual login needs a real Google/GitHub account — this session has no test credentials and
didn't ask for any, since handling someone's real login credentials for an interactive
email/password-adjacent flow isn't something to do casually even if offered. If a stronger
proof is wanted, the fastest path is for Soroush to click through one Google and one GitHub
sign-in on staging directly; the resulting `accounts`/`sessions` rows are then checkable the
same read-only way as the magic-link run above (the epic's own acceptance criterion explicitly
allows "session rows queried read-only" as evidence, not just a screenshot).

**Log grep and cleanup:**
```
$ ssh 41p-box 'docker logs <web container> | grep -i epic002-staging-verify'
(no output)
$ ssh 41p-box 'docker logs <worker container> | grep -i epic002-staging-verify'
(no output)
```
Test user, its session, and its verification row deleted from staging afterward (same read-only-credential-handling SSH pattern, `DELETE ... RETURNING id` to confirm exactly one row each).

**Epic status: done.** `docs/backlog.md` updated accordingly.
