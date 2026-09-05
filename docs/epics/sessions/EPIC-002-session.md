# EPIC-002 session log

**Date.** 2026-09-05.

**Prompt sent.** Same autonomy as EPIC-008: plan into `docs/epics/plan-EPIC-002.md` and proceed
immediately, implement, self-review, push, open the PR, squash-merge once CI is green, no pausing
for approval on code/docs/merges. Two things reserved for Soroush: any command that changes the
box (one command, one yes), and the OAuth apps/Resend account/six Coolify secrets, batched into
one checklist message with exact callback URLs at the moment they're first needed. Build order:
schema/migration, then Better Auth with the three providers, then middleware and the four pages,
then the purge job, then the tests. Verify on staging with real Google/GitHub sign-ins before
calling it done — a local Playwright pass is not the acceptance bar. Two failure modes to avoid:
no more than one experiment on undocumented third-party behavior before writing a BLOCKER; never
let a secret or user email reach the transcript. The advisor edits sitting in the working tree
(EPIC-002's own file, the `${...}` clarification, matching roadmap wording) were already
committed before this session started, per a mid-session correction — confirmed and skipped
re-doing that step.

**Plan summary.** Written into `docs/epics/plan-EPIC-002.md` before any code: schema first
(Better Auth's own tables at their native shape, `projects`/`api_keys` at CLAUDE.md's prefixed
shape, all FK-cascaded from `users`), then Better Auth config, then route protection + the four
pages, then the worker's purge job, then tests, then the staging checklist and verification. Flagged
one open risk up front — staging sign-in verification depends on Soroush's checklist, and the
report would say so plainly if still pending when everything else was done. It was still pending;
the report does say so.

**Decisions made and why.**
- **`nextCookies()` added to the plugins array (last).** Found by testing, not reading:
  sign-out/account-delete are Server Actions, which don't set cookies through an HTTP response
  object the way a route handler does. Confirmed by watching the Playwright sign-out test go
  from failing (old cookie still present, unmodified) to passing on this one change.
- **`__Secure-` instead of `__Host-` for the session cookie**, against decision 3's "where the
  path allows it." Read `better-auth@1.7.2`'s own cookie-naming source directly rather than
  trial-and-error: one global secure-prefix applies to every cookie the library sets, computed
  once per config, with no per-cookie override that doesn't either break `Secure` on every other
  cookie or produce an invalid double-prefixed name. Documented as a deliberate trade in the
  report, not silently dropped.
- **`packages/db` and `apps/worker` moved from `NodeNext` to `bundler` module resolution.**
  `packages/db`'s existing `.js`-suffixed relative imports (needed for `NodeNext`) broke when
  Next's Turbopack tried to resolve them as literal `.js` files that don't exist. `apps/worker`
  had to follow for the same reason once it also became a consumer of `packages/db`'s raw
  source. `packages/core`/`cli`/`sdk-ts` keep `NodeNext` — they're genuinely published to npm.
- **The worker runs from TypeScript source in production too** (`node --import tsx/esm`), not a
  `tsc` build. A plain `tsc` build's output can't resolve `@41prompts/db` at runtime the way
  Next's `transpilePackages` does for `apps/web` — there's no bundler for a single Node entry
  file, and building one felt like more machinery than the actual problem needed.
- **E2e tests live in `apps/web/e2e/`, not a repo-root `e2e/`.** First attempt used the root;
  adding `@41prompts/db` there as a root devDependency made it "reachable" from every public
  package's dependency graph in Turborepo's boundaries check, tripping a real violation of
  CLAUDE.md rule 11. Moving the tests into `apps/web` (which already legitimately depends on
  `@41prompts/db`) fixed it without touching the boundary rule itself.
- **Per-IP magic-link limit raised to 15/5min from the plugin's default 5/60s.** The default
  collided with itself during manual verification (a few curl round trips already exhausted it).
  No number is specified in the epic; picked one generous enough to not be a false positive for
  a small shared-IP office, still real enough to matter, and confirmed both the block and its
  message fire correctly at the new threshold.

**What took longer than expected.**
- **Diagnosing why `@41prompts/db` had "no exports at all" under Turbopack.** Wasn't a caching
  issue (ruled that out with a full dev-server restart first) — it was `packages/db/src/index.ts`
  re-exporting `"./schema.js"` etc., which Turbopack (unlike `tsc` under `NodeNext`) does not map
  back to the real `.ts` file. Once diagnosed, the fix (strip the extensions, switch to `bundler`
  resolution) was quick, but getting from the error message to that root cause took several
  restart/inspect cycles, since the same symptom also briefly looked like a stale-cache problem.
- **The worker/`@41prompts/db` runtime-resolution gap** (documented in the report's "Structural
  gaps" section) needed working through several options — build `packages/db` to real `dist/`
  (regresses `apps/web`'s live-source dev experience via `transpilePackages`), bundle the worker
  with esbuild/tsup (new tooling for one entry file), or run the worker from source via `tsx` in
  production too (chosen) — before landing on the one that didn't trade away something else.
- **The rate-limit tests' first draft was wrong twice.** First: called `auth.api.signInMagicLink`
  directly for the per-IP test too, which never throttles (that call path skips the HTTP router
  the IP limiter lives in — confirmed by looping past the configured max with no effect).
  Second, after switching to `auth.handler` with a real `Request`: worked immediately. The
  per-email hook (which does run on every dispatch, direct-call or not) was correct on the first
  attempt.
- **`packages/db/src/ids.test.ts`'s uniqueness assertion was a real bug in the test, not the
  code**: asserted 1000 unique draws of a 2-byte-entropy id (`proj_` + 4 hex, CLAUDE.md's own
  shape) and failed with 992/1000 — correct behavior at that entropy, not a flaky generator.
  Fixed by asserting collision-freedom on the 4-byte `newPromptId` instead and documenting why
  project ids rely on the primary key, not the generator, for actual uniqueness.

**Verification output (tail).** See `docs/epics/reports/EPIC-002-report.md`'s Verification
section for the full transcript. Short form: `pnpm db:generate && pnpm db:migrate` (twice, second
a no-op); `pnpm typecheck && pnpm lint && pnpm test` — `7 successful, 7 total` on every task, 44
tests; `pnpm e2e` — 5/5 passing; `gitleaks protect --staged` — no leaks; forbidden-word grep over
every new UI-facing file — only match is the required `<label>` tag itself, no visible string
violates ADR-003. Manual verification against a real local Postgres + dev server for everything
the automated suite doesn't reach directly: magic-link send→verify→cookie→`/app`, the exact
Google/GitHub authorize URLs (matching what `infra/README.md` now tells Soroush to register),
account delete → refused re-sign-in, both rate limits' exact block messages, a clean grep over
the dev server's log for every test email used this session.

PR #8 opened, CI green (`ci: pass`), squash-merged to `main` per the "same autonomy as EPIC-008"
instruction — merging is also what's needed to get this code onto staging at all, since staging
tracks `main` and nothing about auth existed there before this epic.

**Immediate consequence of merging, flagged the same session:** `apps/web`'s Better Auth config
(`lib/auth.ts`) throws at module construction if any of `BETTER_AUTH_SECRET`,
`GOOGLE_CLIENT_ID`/`_SECRET`, `GITHUB_CLIENT_ID`/`_SECRET` are unset — deliberate fail-fast, not a
bug — which means staging's `web` container will not start at all once this deploy lands, until
Soroush's checklist (sent the same session, before the merge) is done. This is a real, active
outage window on staging (not production — nothing here has been tagged `v*`), not a hypothetical
follow-up item.

**Open questions.**
- The staging checklist itself — OAuth apps ×2, Resend account + domain verification, six Coolify
  secrets — sent to Soroush in the same message as this session's summary. Once done: confirm the
  staging `web` container comes back healthy, then run the three sign-in methods for real and the
  staging log grep, closing the three pending acceptance criteria in a short follow-up note.
- `__Host-` vs `__Secure-` — a deliberate trade against the installed library version, not an
  unresolved question, but worth a second look if a future epic ever needs
  `crossSubDomainCookies`.
