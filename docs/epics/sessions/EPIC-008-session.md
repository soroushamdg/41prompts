# EPIC-008 session log

**Date.** 2026-09-04.

**Prompt sent.** Full autonomy to plan, implement, self-review, push, open the PR, and squash-merge once CI is
green, with only two checkpoints requiring Soroush: any box-mutating command (per `infra/ACCESS.md` rule 3), and
a single batched checklist for Coolify UI / GitHub secrets / GHCR credential steps, delivered once, at the point
it was first needed. Nine numbered decisions given directly in the prompt (workflow triggers, image tags, compose
shape, deploy-webhook mechanism, registry auth approach, rollback design, Actions budget) — told to implement
these as given, not re-litigate. Told to write `docs/epics/plan-EPIC-008.md` first per `docs/PROCESS.md`, then
proceed without waiting for approval on the plan itself.

**Plan summary.** `docs/epics/plan-EPIC-008.md` written after read-only reconnaissance (SSH + Coolify API GETs,
per `infra/ACCESS.md` rule 2 — no approval needed): confirmed Coolify 4.3.17 has no private-registry credential
store (settling the epic's "check Coolify's Registry settings first" question in one pass, by reading
`ApplicationDeploymentJob.php`'s own error message rather than guessing); found the staging and production
application uuids and their current (pre-epic) config; found one live instruction conflict between this
session's prompt and `docs/epics/CURRENT.md`'s literal acceptance criteria (the `${...}`-in-compose-files
question) and one scope conflict (kill-container test and production-deploy criterion both listed "out of
scope" in `CURRENT.md` but explicitly requested in this session) — resolved both in favor of this session's
direct instruction, documented for the advisor rather than silently reinterpreted or blocked on.

**Decisions made and why.**
- **Two explicit jobs (`build-web`, `build-worker`) in `build-images.yml`, not a matrix.** Only the web job needs
  `SOURCE_COMMIT`; a matrix would need a per-leg conditional for one build-arg, which reads worse than two short
  jobs.
- **`COOLIFY_STAGING_UUID`/`COOLIFY_PRODUCTION_UUID` as GitHub secrets, not hardcoded workflow env values.**
  First draft hardcoded them (they're not sensitive — I'd already read them via a `GET`). Corrected to match the
  prompt's explicit decision #6, which names both as secrets: the workflow file then names no
  environment-specific identifier at all, and a future app re-creation is a secret update, not a PR.
- **`env_file: .env` kept in the new compose files**, even though neither `CURRENT.md` nor the prompt mentioned
  it. Dropping it (my first draft did) would have silently regressed how every *future* epic's Coolify-managed
  secret (API keys, `R2_*`) reaches the container — today it requires zero compose-file changes, because
  `env_file: .env` picks up whatever Coolify's Environment Variables tab generates. Caught in self-review before
  committing.
- **Compose `${...}` deviation implemented as instructed, not as `CURRENT.md` literally says** — see the report's
  "Deviations" section for the full reasoning. Recorded loudly in the plan, the PR description, and the report
  rather than silently resolved, since it's a real conflict between two documents Soroush controls.
- **Registry auth: `docker login ghcr.io` on the box, run by Soroush himself over SSH, PAT never pasted into this
  session.** Confirmed as the only option (no Coolify UI alternative exists in 4.3.17). Could have asked Soroush
  to paste the PAT for me to run the command, but `infra/ACCESS.md` rule 7's spirit (never let a secret sit in
  the transcript unless actually necessary) applies even to secrets Claude Code doesn't technically manage.

**What took longer than expected.**
- **The production deploy failed twice after the human checklist was done, for two unrelated real reasons, not
  Coolify quirks.** First: a genuine bug in what I shipped — `docker-compose.production.yml`'s host port bindings
  (`5432`, `3000`) collided with staging's, since both run on the same box. Found by reading the actual
  deployment failure log out of `coolify-db`'s `application_deployment_queues.logs` column (the REST API's
  `/deployments` endpoint only lists currently-active deployments, not history — had to go to the DB directly,
  read-only, per `infra/ACCESS.md` rule 4's "except read"). Fixed with different host ports for production
  (`5433`/`3001`) and a fresh push, no new tag needed since Coolify reads the compose file fresh from `main`'s
  HEAD regardless of which ref's webhook triggered the deploy. Second: `app.41prompts.ai` briefly returned
  Traefik's default cert (503) — looked like a missing Domains-tab step (matching the pattern of EPIC-001 F3's
  staging fix), asked Soroush about it, but the domain was in fact already configured correctly (confirmed by a
  screenshot); a short re-test once the actual deploy had gone through and Let's Encrypt had time to issue the
  cert resolved it — a timing artifact of production's very first real deploy, not a missing setup step.
- **The kill-container test's first attempt was methodologically wrong.** `docker kill <container>` does not
  trigger `restart: unless-stopped`'s auto-restart — Docker's restart-manager explicitly stands down for any
  container stopped via the Docker API (`kill` or `stop`), logging `"stopping restart-manager"`, because the
  policy means "restart unless someone told it to stop," and an API-level kill counts as being told. Had to
  repair the now-dead container (`docker start`, approved separately) and re-run the test correctly: signal the
  container's **host PID** directly with `sudo kill -9`, bypassing Docker's stop API to simulate a real crash.
  That version worked as expected (healthy again in 9s). Neither `infra/RUNBOOK.md` nor any doc in this repo
  mentioned this Docker semantic before — flagged in the report as a gap for a future small doc fix.

**Tail of verification output.**
```
$ curl -s https://staging.41prompts.ai/healthz
{"ok":true,"commit":"772184d11188a79bb8d4d2fe6e51ac2f28a6fac5","env":"staging"}
$ curl -s https://app.41prompts.ai/healthz
{"ok":true,"commit":"b62f12b2f46b5eab0e36605cc927aea55f42ad26","env":"production"}
$ docker pull ghcr.io/soroushamdg/41prompts-worker:production
Error response from daemon: Head "https://ghcr.io/v2/soroushamdg/41prompts-worker/manifests/production": unauthorized
$ pnpm lint && pnpm typecheck && pnpm test
... 7 successful, 7 total (×3, all cache hits, no application code changed)
$ actionlint .github/workflows/*.yml
(clean, after fixing two SC2086 findings in rollback.yml's first draft)
$ gitleaks detect
no leaks found
```

**Open questions (for the advisor).**
- `docs/epics/CURRENT.md`'s "no `${` anywhere" acceptance criterion needs reconciling with the amendment this
  session was given directly — see the report.
- `docs/epics/CURRENT.md` could not be set to EPIC-002 as asked: no `docs/epics/EPIC-002-*.md` file exists yet
  for me to copy in, and epic files are advisor-owned. Left `CURRENT.md` pointing at EPIC-008.
- `infra/RUNBOOK.md`'s kill-container section should get a short note about the `docker kill` vs. host-PID
  `kill -9` distinction found this session — not added here since it belongs to EPIC-001's file scope, not this
  epic's touch list; flagging so it isn't lost.
