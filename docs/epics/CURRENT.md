# EPIC-002: Data layer and auth
Stage: 0 · Depends on: EPIC-001, EPIC-008 · Size: M

## Goal
A person signs in to `https://staging.41prompts.ai` with Google, GitHub, or an emailed link, lands on an empty
authenticated page, and can delete their account. Their row lives in our Postgres. Nothing about a user is stored
in a third party. The schema baseline every later epic builds on exists, with migrations that run on deploy.

## Division of labour
Claude Code implements everything in the repo and verifies on staging. Soroush creates the two OAuth apps and the
Resend account and sets six secrets in Coolify; ask for all of them in **one** checklist message, with exact
callback URLs, at the moment they are first needed.

## Decisions (do not re-litigate)
1. **Better Auth**, users in our Postgres, Drizzle adapter. No Clerk, no Auth.js.
2. **Three methods**: Google, GitHub, and magic link by email via Resend. No passwords anywhere; a password field
   is a credential to leak and a reset flow to build.
3. **Session**: cookie, `httpOnly`, `secure`, `sameSite=lax`, `__Host-` prefix where the path allows it, 30-day
   rolling expiry, rotated on sign-in. Sessions are rows in our database, not JWTs; sign-out must be able to kill
   a session server-side.
4. **Schema baseline** (Drizzle, `packages/db`): Better Auth's own tables (`users`, `sessions`, `accounts`,
   `verifications`) with its id shape; our tables use the prefixed ids from `CLAUDE.md` (`proj_` + 4 hex,
   `pr_` + 8 hex). Create now, empty of behaviour: `projects` (id, owner, name, slug, created_at, deleted_at),
   `api_keys` (id, project, name, hashed key, last_four, created_at, last_used_at, revoked_at — no key material
   in plaintext, ever). Do not create `prompts`, `bloks`, `runs`; those belong to the epics that use them.
5. **Soft delete + purge**: `users.deleted_at` set immediately on request, session killed, sign-in refused; a
   daily pg-boss job in `apps/worker` hard-deletes rows older than 30 days, cascading to owned projects and keys.
   The window is a product promise; make it a named constant, not a literal.
6. **Route protection**: middleware guards `/app/*`; unauthenticated requests redirect to `/sign-in?next=<path>`
   and land back on `<path>` after sign-in. `next` is validated as a same-origin relative path — an open
   redirect here is the classic phishing hole.
7. **UI is deliberately plain.** EPIC-003 builds the design system and EPIC-016 the real pages; anything styled
   now is thrown away. Sign-in, sign-up, the empty `/app` page and the account page use semantic HTML, correct
   labels and focus order, and nothing else. Vocabulary rules (ADR-003) still apply to every string.
8. **Separate OAuth apps for staging and production**, separate secrets, separate callback URLs. Never one app
   with two callbacks.
9. **Rate limits** on the magic-link endpoint (per email and per IP) from day one; an unthrottled email sender is
   an abuse vector that costs money.
10. **Email**: Resend, plain-text-first templates, the sender domain verified (SPF/DKIM). Link expires in 15
    minutes, single use, invalidated on use.

## Scope
- `packages/db`: schema above, generated migration, `db:migrate` already runs at container start (EPIC-001), seed
  script creating one user and one project for local work only.
- `apps/web`: Better Auth setup, three providers, `/sign-in`, `/sign-up`, `/app` (authenticated, empty, shows the
  signed-in email and a sign-out control), `/app/account` with delete, middleware, magic-link rate limit.
- `apps/worker`: `purge-deleted-users` job, scheduled daily, idempotent, logs counts.
- `.env.example`: every new variable, commented. `infra/README.md`: the six secrets and where they come from.
- Tests: Playwright — magic-link sign-up end to end (read the verification token from the database, do not scrape
  an inbox), unauthenticated `/app` redirect, `next` round-trip, sign-out kills the session. Vitest — purge job
  with an injected clock at 29 and 31 days, `next` validation rejects absolute and protocol-relative URLs, api key
  hashing.

## Out of scope
- Teams, invitations, roles, SSO. (Cut list; v1 is single-user.)
- Any prompt, blok, or run schema. (EPIC-020 onward.)
- PostHog identify, Sentry user context. (EPIC-004.)
- Styling, the real sign-in page, marketing copy. (EPIC-003, EPIC-016.)
- Billing, plans, quotas. (EPIC-070.)

## Acceptance criteria
- [ ] `pnpm db:generate` produces one migration; a fresh database migrates cleanly and a second `db:migrate` is a
      no-op. Evidence: output.
- [ ] On staging: sign in with Google, with GitHub, and with a magic link; each lands on `/app` showing the email.
      Evidence: three screenshots or the session rows queried read-only.
- [ ] Unauthenticated `GET /app` redirects to `/sign-in?next=/app`; after signing in the browser lands on `/app`.
      Evidence: Playwright test name.
- [ ] `next=https://evil.example` and `next=//evil.example` are rejected. Evidence: test name.
- [ ] Session cookie on staging has `Secure`, `HttpOnly`, `SameSite=Lax`. Evidence: response header, secrets
      redacted.
- [ ] Sign-out invalidates the session server-side (the old cookie cannot reach `/app`). Evidence: test name.
- [ ] Account delete sets `deleted_at`, kills the session, and refuses re-sign-in; the purge job removes the row
      after 30 days and not before. Evidence: two test names with the injected clock.
- [ ] Magic-link rate limit returns a clear message after the threshold, per email and per IP. Evidence: test name.
- [ ] No user email, name, or token appears in any log line. Evidence: grep over the staging web and worker logs
      for the test account's address, read-only, returning nothing.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint`, `gitleaks` clean; forbidden-word grep over UI strings passes.
- [ ] Report and session log written; `docs/backlog.md` status updated.

## Verification
```
pnpm db:generate && pnpm db:migrate && pnpm db:migrate    # second run is a no-op
pnpm test && pnpm typecheck && pnpm lint
pnpm e2e
curl -sI https://staging.41prompts.ai/app                 # 307 to /sign-in?next=/app
```

## Notes for the implementer
- Secrets are set by Soroush in Coolify; never in the repo, never printed (`infra/ACCESS.md` rule 7).
- `BETTER_AUTH_URL` differs per environment; read it from the environment, never hard-code a host.
- The purge job must be safe to run twice in the same day and safe to run on an empty table.
- If a decision here contradicts `CLAUDE.md` or an ADR, write `docs/epics/BLOCKER-EPIC-002.md` and stop rather
  than reinterpreting.
