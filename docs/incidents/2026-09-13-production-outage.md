# Incident · 2026-09-13 · production down twice, staging never broken

**Written by Claude Code. Not an advisor review** — `CLAUDE.md` reserves `docs/reviews/` for Soroush,
so the incident record lives here instead. Move it if that is wrong.

## The sentence that explains the day

**No one had loaded a deployed page in a browser across twenty epics, and every gate was green
throughout.** CI passed, compliance passed, `/healthz` returned `ok=true`, e2e ran 151 Playwright
assertions against a dev server. The first time a person opened the deployed product and looked at
it, they found a page that had been a dead end since EPIC-021a, and the investigation that started
found production down.

## What actually happened

| time (UTC) | event |
|---|---|
| 03:00 | nightly backup runs; production healthy on `af089c7` |
| 12:35 | a **project-level Deploy** redeploys staging *and* production; production drops ≤ 38 s |
| 15:07 | fourteen production environment variables rewritten in one second — three intended, **eleven overwritten with staging's values** |
| 15:07–15:12 | two production deploys; `web` crash-loops on `FATAL: password authentication failed` |
| 15:11, 15:18 | Coolify's reconciler stops the production application, twice |
| 21:02–21:20 | diagnosis; role password aligned; production serves again |
| 23:54–23:59 | Soroush re-mints seven secrets, one row at a time |
| 00:12 | deploy renders all eleven restored variables |
| 00:16 | `ALTER ROLE` to the new password; production healthy |
| 00:33 | **reconciler stops it a third time** |
| 00:58 | started *through Coolify*, so desired state and reality agree |

## Root cause

**`POSTGRES_PASSWORD` was changed in Coolify while the database kept the password baked into its data
directory.** `POSTGRES_PASSWORD` only applies at first initialisation and silently does nothing
afterwards. `web`'s entrypoint chains `drizzle-kit migrate && next start`, so the container refused to
start — correctly. Ninety authentication failures, zero successes, and **no SQL error anywhere**,
which is what made it look like a migration problem for the first hour.

It was not a migration problem. Production pulls a fixed image tag; that image contained migrations
`0000`–`0003`, all already applied. There was never a new migration for it to run.

## Four Coolify hazards, now named

**1. The Environment Variables tab's Developer view overwrites silently.** It replaces the per-row
list with a textarea of `KEY=value` lines and saves the whole block, upserting by key: eleven rows
updated in place, three inserted, twenty untouched. No diff, no confirmation, no warning that a key
already holds a different value. Pasting a block containing keys you did not mean to touch overwrites
them. **This is what copied staging's secrets onto production.**

**2. A project-level Deploy deploys every resource in the project**, staging and production together.
`is_auto_deploy_enabled: false` does not protect against it — that flag guards the git trigger, not
the button.

**3. Coolify's reconciler stops a running application with no notification.** All three stops fired in
the *same second* as a `GetContainersStatus` poll completing. The log line reads
`App\Actions\Application\StopApplication`, which looks exactly like a human pressing Stop — it is not.
**Starting containers with `docker start` behind Coolify's back leaves its desired state saying
"stopped", and the reconciler will undo you.** Start through Coolify.

**4. `POSTGRES_PASSWORD` is init-only.** Changing it in Coolify changes what the clients present and
nothing about what the database accepts. The fix is `ALTER ROLE`, and `infra/RUNBOOK.md` has always
said so.

## The defence, stated plainly

**The only defence against hazard 1 is knowing the values exist somewhere other than Coolify.** Six
production secrets were unrecoverable: Coolify's API returns no values and keeps no history, and the
surviving duplicate rows turned out to be preview-scope variables, not backups. They had to be
re-minted from Google, GitHub and Resend.

## Staging was never broken

`/app` renders `Signed in as … / Sign out / Account` as unstyled text with no project list **because
that is what the page is** — an EPIC-002 stub with a bare `<main>`, no `className`, and no project
list, unchanged at the deployed commit. No missing chunk, no failed hydration, no error boundary. Two
hypotheses were wrong before the cheap check — reading the route's source — was done.

## The accidental finding, which is the largest

**Every user who signs in is stranded.** `DEFAULT_NEXT_PATH` is `/app`; `/app` links only to
`/app/account`; `/app/account`'s Back link returns to `/app`; and the single route into
`/app/projects` is a breadcrumb on a project page reachable only from the projects list. Live since
EPIC-021a.

**The e2e suite encoded it as correct.** `auth.spec.ts` navigates to `/app` and asserts the sign-in
`next` value is `/app` — the dead end is the expected destination, so the gate could never fail on it.

## Unexplained

The word **"Signed out"** in Soroush's screenshot appears nowhere in the codebase. `grep` over
`apps/web` and `packages` finds only "Sign out", the button label. Recorded as unexplained rather than
theorised; two theories have already been wrong today.

## What changed as a result

- `docs/PROCESS.md`: plan → implement → **drive it in a real browser** → iterate → push, with both a
  pre-push drive against the built app and a post-deploy smoke drive.
- `CLAUDE.md` Definition of Done: the deployed page was loaded in a browser and looked right, with a
  screenshot in the report.
- `/healthz` is no longer evidence of anything but the process being up. It returned `ok=true` while
  production was 503 on every other path, and while `/app` was a dead end.
