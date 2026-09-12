# EPIC-009: Actions budget
Stage: 0 (late) · Depends on: EPIC-008 · Size: S

## Goal
Stop burning GitHub Actions minutes on work a $5 box can do for nothing, and stop tagging releases that are not
releases. CI keeps running on GitHub, where it is cheap and where a green tick before merge is worth paying for.

## What happened
EPIC-008 moved both image builds to GitHub Actions, at roughly six to ten minutes per merge to `main`, on top of
CI, compliance and e2e. Thirty-odd merges in four days exhausted the Free plan's 2,000 minutes; the same account's
older, larger project spent $1.42 in a month against this project's $10.58. EPIC-008's report said to watch the
budget. Nobody did, including the advisor, who asked for a tag per ruling and never asked the number again.

The lesson is not "images are expensive". It is that a per-merge cost multiplied by an unbudgeted merge rate is
invisible until it stops the work.

## Decisions (do not re-litigate)
1. **Staging images build on the box again.** Coolify builds from the repo on push to `main`, as it did before
   EPIC-008. That is the 5-minute build EPIC-008 replaced; on staging it costs nothing and competes with nothing.
2. **Production keeps pulling a prebuilt image.** Actions builds and pushes only on a `v*` tag, never on `main`.
   That preserves the reason EPIC-008 existed: production is never served by a box that is also building.
3. **Tags are releases, not checkpoints.** A tag means "this goes to production". Rulings, copy fixes and
   fix-ups merge to `main` and reach staging without one. Write this into `PROCESS.md` next to the other rules; it
   is the single change that most reduces the burn.
4. **CI stays on GitHub**: `pnpm test`, `typecheck`, `lint`, `compliance`, `binary-files`, `e2e`. Tests are minutes
   well spent. Only the image build moves.
5. **The budget is visible.** A short section in `infra/RUNBOOK.md` says where to read Actions usage, what the
   monthly allowance is, and what the current burn per merge and per tag measures. A number nobody looks at is the
   same as no number, so also state when to look: at the close of every epic.
6. Nothing in the deployed product changes. Same images, same compose files, same tags; only where the staging
   image is built.

## Scope
- `.github/workflows/build-images.yml`: drop the `push: branches: [main]` trigger, keep `v*` tags and
  `workflow_dispatch`. Say in the file's header why, so nobody restores it as an improvement.
- Coolify staging resource: back to building from the repo rather than pulling `:staging`. That is a UI change,
  so give Soroush the exact clicks in one checklist; do not attempt it.
- `infra/docker-compose.staging.yml`: back to `build:` for `web` and `worker`, or documented as unused if Coolify
  builds from `infra/docker-compose.yml` directly. Whichever, one file describes staging and says so.
- `PROCESS.md`: the tags-are-releases rule.
- `infra/RUNBOOK.md`: the budget section, with today's measured numbers.
- `docs/roadmap.md` and `docs/backlog.md`: EPIC-009 added to Stage 0 as a late entry with this reason.

## Out of scope
- Moving CI off GitHub. Tests are the minutes worth paying for.
- Self-hosted runners. More moving parts than the problem justifies at this size.
- Changing the plan or adding a payment method. Soroush's decision, declined.
- Any change to what production runs or how it is deployed.

## Acceptance criteria
- [ ] A merge to `main` triggers CI and compliance but **no image build**; staging updates via Coolify's own
      build. Evidence: the Actions run list for one merge, plus staging's `/healthz` showing that commit.
- [ ] A `v*` tag still builds and pushes both images and deploys production. Evidence: the workflow run and
      `app.41prompts.ai/healthz` showing the tag's commit.
- [ ] Staging's build on the box completes in under ten minutes and does not make `/healthz` unavailable on the
      apex during it. Evidence: timing and a poll during the build.
- [ ] `PROCESS.md` states that tags are releases and names the three things that do not warrant one.
- [ ] `infra/RUNBOOK.md` has the budget section with measured minutes per merge before and after, and says to
      check at the close of every epic.
- [ ] One file describes how staging is built, and a stale one is deleted rather than left to mislead.
- [ ] `pnpm test`, `typecheck`, `lint`, `compliance`, `binary-files` clean.
- [ ] Report and session log written; backlog updated.

## Notes for the implementer
- CI cannot run until the allowance resets or the account changes, so this epic's own PR may merge without a green
  tick. Say so in the report, run every gate locally, and paste the output as the evidence CI would have given.
- The Coolify half is Soroush's; batch it into one checklist with exact clicks.
- Measure rather than estimate: the Actions run list has per-run durations for the last month. Put real numbers in
  the runbook.
- If reverting staging to an on-box build turns out to break something EPIC-008 fixed, stop and write
  `docs/epics/BLOCKER-EPIC-009.md` rather than half-reverting.
