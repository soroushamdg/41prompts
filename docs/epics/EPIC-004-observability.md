# EPIC-004: Observability and guardrails
Stage: 0 · Depends on: EPIC-002 · Size: S

## Goal
We see an error, a usage pattern, or a runaway cost before a user tells us, and no user can run up an unbounded
provider bill. Plus one honest way to look at the database.

## Division of labour
Claude Code implements and verifies on staging. Soroush creates the Sentry and PostHog projects and sets their
keys in Coolify; ask for all of it in **one** checklist message with exact variable names.

## Decisions (do not re-litigate)
1. **Sentry** for errors, web and worker, with the release set to the deployed commit (EPIC-008 already bakes
   `COMMIT_SHA`); source maps uploaded from the Actions build so a stack trace is readable.
2. **PostHog** for product analytics, EU or US host set once by variable. `identify` on sign-in with the user id
   only. Typed event helper; the event name set is closed and lives in one file:
   `signup`, `login`, `decompile_view`, `decompile_run`, `decompile_share`, `project_created`, `run_started`,
   `run_passed`, `publish`. Adding an event means editing that file, not scattering strings.
3. **No PII anywhere in logs or analytics**: no email, no prompt text, no provider payload. Ids only. This is a
   privacy-policy promise, not a preference.
4. **Logs**: pino JSON to stdout, request id per request, level from an environment variable. Docker keeps them;
   no log shipper on one box.
5. **Uptime**: an external check on `https://app.41prompts.ai/healthz` and `https://staging.41prompts.ai/healthz`,
   alerting to Soroush's phone. Free tier is fine; the requirement is that it reaches a phone.
6. **Run budgets**: a `run_budgets` table with per-plan defaults, incremented by the worker before a provider
   call and enforced as a hard cap. It exists now, empty of provider integration, so EPIC-031 has nothing to
   retrofit. The cap is a number in the database, not a constant in code.
7. **Drizzle Studio**: documented, not deployed. A runbook section showing how to open it against staging and
   production over an SSH tunnel, read-only credentials where practical, and a warning that production contains
   real user data. No database UI is ever exposed on a public port.
8. Cookie consent and the analytics opt-out live in EPIC-017 with the rest of the legal work; this epic must not
   make analytics impossible to disable later, so the PostHog client reads a consent flag that defaults to off
   for anonymous visitors in production.

## Scope
- `apps/web` and `apps/worker`: Sentry init with release and environment, error boundaries, a deliberate
  `/dev/throw` route (dev and staging only) to prove the pipeline.
- PostHog: typed event module, `identify` on sign-in, the nine events wired where they already exist (`signup`,
  `login`, `project_created`), the rest exported and unused until their epic lands.
- pino logger shared by web and worker; request id middleware; a redaction list.
- `packages/db`: `run_budgets` table and migration; unit-tested increment and cap logic in `packages/core` if it
  is pure, otherwise in `packages/db`.
- Uptime check configured; alert route tested once.
- `infra/RUNBOOK.md`: Drizzle Studio section; "an alert fired, what now" section.
- A PostHog dashboard containing every milestone metric from `docs/roadmap.md`, showing zero where there is no
  data yet.

## Out of scope
- Cookie banner, consent UI, privacy policy text. (EPIC-017.)
- Provider calls, real runs, real cost attribution. (EPIC-031.)
- Session replay, heatmaps, any recording of user content.
- Self-hosted analytics.

## Acceptance criteria
- [ ] A thrown error on staging appears in Sentry within a minute, tagged with the environment and the deployed
      commit, with a readable stack frame. Evidence: issue title and release value.
- [ ] The same for the worker. Evidence: issue.
- [ ] `signup` and `login` events appear in PostHog with a user id and no email. Evidence: event payload with the
      id redacted.
- [ ] A test fails if an event name outside the closed set is used. Evidence: test name.
- [ ] Log output is JSON, carries a request id, and a grep for the test account's email over staging web and
      worker logs returns nothing. Evidence: log line and grep output.
- [ ] Uptime check is live on both hosts and one alert has actually reached a phone. Evidence: screenshot.
- [ ] `run_budgets` migrates; increment and cap have unit tests including the boundary and a concurrent-increment
      case. Evidence: test names.
- [ ] Drizzle Studio opens against staging by following the runbook, and the runbook says how to close the tunnel.
      Evidence: the commands and one screenshot.
- [ ] No database or analytics port is reachable from the internet. Evidence: `ufw status` and a failed external
      connection attempt.
- [ ] PostHog dashboard exists with every milestone metric from the roadmap. Evidence: screenshot.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint`, `gitleaks` clean.
- [ ] Report and session log written; backlog updated.

## Verification
```
pnpm test && pnpm typecheck && pnpm lint
curl -s https://staging.41prompts.ai/dev/throw     # then check Sentry
```

## Notes for the implementer
- Sentry and PostHog keys are set by Soroush in Coolify; never in the repo (`infra/ACCESS.md` rule 7).
- The DSN in the browser bundle is public by design; the auth token used to upload source maps is not, and lives
  in GitHub Actions secrets only.
- Do not add an SDK to `packages/core`; it stays dependency-free (rule 11).
- One experiment maximum on any undocumented third-party behaviour, then `docs/epics/BLOCKER-EPIC-004.md`.
