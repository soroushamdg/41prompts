# Process

Three roles. Soroush decides. Claude (advisor) writes epics, reviews, and keeps the backlog. Claude Code builds.

## The loop

1. Advisor writes `docs/epics/EPIC-xxx-name.md` and copies it to `docs/epics/CURRENT.md`.
2. Soroush commits it and runs Claude Code with:
   `Read CLAUDE.md and docs/epics/CURRENT.md. Plan first into docs/epics/plan-EPIC-xxx.md, then implement to Definition of Done.`
3. Claude Code produces a plan, then code, then `docs/epics/reports/EPIC-xxx-report.md`.
4. Soroush pastes the report (and any errors) back to the advisor.
5. Advisor reviews, updates `docs/backlog.md` status, and writes the next epic or a fix-up epic.

Never run two epics in parallel in one Claude Code session. One epic, one branch, one PR.

## Epic file format

```
# EPIC-xxx: Name
Stage: N · Depends on: EPIC-yyy · Size: S/M/L

## Goal
One sentence. What is true when this is done that was not true before.

## Scope
Bullet list of what is built.

## Out of scope
Explicit list. Claude Code must not build these even if they seem adjacent.

## Acceptance criteria
- [ ] Testable statements. Each one names how it is verified.

## Verification
Exact commands and expected output.

## Notes for the implementer
Constraints, pointers to mockups, known traps.
```

## Sizes

S: one session. M: two to three sessions. L: split it; an L in the backlog is a smell.

## Cadence

Weekly: advisor re-ranks the backlog against what shipped. Any epic older than two stages back gets deleted or rewritten.

## ADRs

Any irreversible choice gets `docs/decisions/ADR-nnn-title.md` before the code. Irreversible means: database schema for a public object, artifact format, SDK public API, licence, auth provider.

## Branching

`main` deploys to staging automatically. Tags `v*` deploy to production. Feature branches `epic/xxx-name`.

## Blockers

If Claude Code discovers mid-epic that a criterion is impossible, ambiguous, contradicts CLAUDE.md, or needs
something from a later epic, it writes `docs/epics/BLOCKER-EPIC-xxx.md` with: what, where it surfaced, which
criterion it blocks, and options (change scope, depend on another epic, split, cut). Then it stops. Soroush
pastes it to the advisor; a decision is written into `CURRENT.md` within 24 hours. Status in the backlog becomes
`blocked`; if still blocked after 7 days it is raised in the weekly review.

## Session log

Every Claude Code session ends with `docs/epics/sessions/EPIC-xxx-session.md`: date, prompt sent, plan summary,
decisions made and why, what took longer than expected, the tail of the verification output, open questions.
This is the context handoff for the next session and the audit trail for every choice.

## Weekly review

Every Friday Soroush writes `docs/weekly/WEEK-nn.md` (template in `docs/weekly/TEMPLATE.md`): what shipped,
what is blocked, the top risk, next week's epic, hours worked, and one line on energy. The advisor answers on
Monday. Two consecutive weeks over 50 hours or an "exhausted" line triggers a scheduled week off.

## Bugs found later

`BUG-<epic>-<slug>` rows in the backlog. P0 (data loss, security, keys): fixed within 24 hours as an S epic.
P1 (broken acceptance criterion): before the next epic starts. P2: into EPIC-900.

## Gates

Three go/no-go checkpoints, criteria in `roadmap.md`: after Stage 1, after Stage 3, after Stage 5a. The advisor
recommends; Soroush decides; the decision is written into `docs/decisions/GATE-n.md`.

## Research epics

Epics numbered 08x, 09x and 064 are research, not code. Their output is a write-up in `docs/research/` and,
where a finding changes an epic, an edit to that epic before it starts.

## Visual-regression baselines, and Docker disk

Playwright screenshots are platform-specific and CI runs `ubuntu-latest`, so baselines are generated
inside `mcr.microsoft.com/playwright:v<version>-noble` and committed with the `-linux` suffix. A
`-darwin` baseline is not a baseline: CI will never match it and fails on the missing snapshot either
way. The procedure is in EPIC-003's report and repeated in EPIC-016's.

That image needs more than 2 GB and Docker Desktop's VM disk is small and fills up. **If there is not
enough room, deleting unused Docker volumes and images to make space is fine** — `docker volume prune`
removes only volumes no container references, and any image removed re-pulls on demand. Check what is
attached first (`docker ps -a` and `docker inspect <name> --format '{{range .Mounts}}…'`); a running
project's data volume is not "unused" just because it is not ours.

## "Environmental" is a hypothesis, not a finding

A failing test explained as environmental — a slow runner, a local quirk, "it passes in CI" — is an
**unproven hypothesis about the cause**. It is not a reason to tick a criterion, and it is not a
finding that can be reported as one.

The rule: **a failure stays unticked until the environment is actually fixed, or the explanation is
actually proven.** "Pre-existing" is not an explanation either; it dates the failure without
identifying it.

This exists because it went wrong. Three auth e2e tests failed locally from EPIC-014 through EPIC-016
and were reported in three consecutive epic reports as pre-existing and environmental, on the evidence
that they also failed on the untouched tree. That evidence was real and the conclusion was still
wrong: `.env` set `BETTER_AUTH_URL` to port 3000, `E2E_PORT` was 3100, and Better Auth refuses a
request whose origin does not match `baseURL` — so **every sign-in in the suite silently failed**.
Ten minutes of looking, whenever it was actually looked at, produced a one-line fix in
`playwright.config.ts`. Three reports had already gone out saying otherwise.

If a failure is genuinely environmental, the environment is the bug. Fix it or write down exactly
which knob is wrong, not the word "environmental".

## A commit on `main` is refused by a hook, not by remembering (2026-09-12)

"One epic, one branch, one PR" is a line above. It was still broken **twice in one session**
(EPIC-021a), both times at the identical moment: right after a `git checkout main` following a merge,
when the next piece of work starts on a tree that happens to be sitting on `main`. Nothing was pushed
either time — but "nothing was pushed" is luck, and a rule that has to be remembered at exactly the
wrong moment is not a rule.

`.githooks/commit-msg` now refuses a commit on `main` unless **both** hold:

1. the subject line starts with `docs:`, and
2. every staged path is under `docs/`.

That is the advisor's case — epics, the backlog, reviews — and nothing else. **Both, not either.** A
`docs:` subject on a commit that also touches `packages/` is precisely the thing being stopped, and a
doc-only commit called `chore:` is still a commit on `main` that should have said what it was.

**Why `commit-msg` and not `pre-commit`.** Git gives the message file only to `prepare-commit-msg` and
`commit-msg`; at `pre-commit` it does not exist yet. This rule needs the message *and* the staged
paths, so it has to be one hook, and `commit-msg` is the earliest with both.

**Installing it.** `core.hooksPath` is local config that a checkout does not carry, so `pnpm install`
runs `scripts/install-hooks.mjs` through `prepare` and points git at `.githooks/`. `pnpm
hooks:install` does it by hand.

It never fails an install, and it has to survive three ways of being unable to run: no `.git` (a
Docker build, a shallow CI checkout), a `git config` that refuses, and **the script not being there
at all** — `scripts/` is deliberately excluded from the public mirror while the root `package.json`
is copied, so in the mirror `prepare` names a file that cannot exist. Hence `|| true`; nothing inside
the script can catch its own absence. `pnpm compliance` caught that the first time this was wired up.

**It is not a wall.** `git commit --no-verify` goes past it, as it goes past every hook. Deliberate: a
guard that cannot be overridden gets uninstalled the first time it is wrong, taking the rule with it.
This exists to make the mistake loud, not impossible.

**It was proved before being trusted**, all four cases: a code commit on `main` refused; a `docs:`
subject touching code still refused; a genuine docs-only commit on `main` allowed; the same code
commit on a branch allowed. The refusals are in EPIC-021a's report.

**It is `commit-msg`, and `pre-commit` cannot replace it.** Recorded because it was asked for as a
pre-commit hook and is not one. Git passes the message file only to `prepare-commit-msg` and
`commit-msg`; at `pre-commit` the message does not exist yet. This rule needs the message *and* the
staged paths, so it has to be a hook that has both, and `commit-msg` is the earliest. Nobody should
re-suggest `pre-commit` for it.

## A test suite never writes into the working tree (2026-09-12)

`pnpm e2e` used to rewrite committed screenshots on every run. It was listed as an annoyance in
EPIC-016's report, worked around by hand, and then swept into three separate commits in one session
before anyone treated it as a defect.

**It is a defect, and the cost is not the churn.** A suite that leaves `git status` permanently dirty
makes `git status` useless as a signal — and a useless `git status` is how the NUL byte survived two
self-reviews, which is the reason `pnpm binary-files` exists at all. A dirty tree you learn to ignore
is a review you are no longer doing.

- **`pnpm e2e`** runs everything except `apps/web/e2e/capture/` and writes nothing into the tree.
- **`pnpm e2e:capture`** sets `E2E_CAPTURE=1` and runs **everything**, generators included. It is the
  only command that may modify committed files, and running it is a deliberate act.

Two ordinary specs (`auth.spec.ts`, `landing.spec.ts`) end with a screenshot write that is
documentation rather than assertion. Those are guarded by `if (CAPTURING)` in place rather than moved,
because moving the whole test would take real assertions out of the default run — which is why
capture mode runs everything rather than only `capture/`.

**The class is guarded, not just the instances.** `apps/web/e2e-writes.test.ts` fails if any spec
outside `capture/` writes into `docs/` without that guard, so the next one is caught by a test rather
than by somebody's `git status` six weeks later.

## Cookie scoping is one-directional, and the parent always wins (2026-09-12)

Production sets `SESSION_COOKIE_DOMAIN=.41prompts.ai` so a session made on `app.` is visible on the
apex. **That domain matches every subdomain under it**, `app.staging.41prompts.ai` included.

Staging's cookie is scoped `.staging.41prompts.ai` and cannot reach production. The host-split report
called that "scoped one level below production, so the two cannot collide" — and that is exactly the
wrong conclusion. **Scoping a child protects the parent from the child. It does nothing to protect
the child from the parent.** The asymmetry is the whole bug: production only ever saw its own cookie
and worked; staging saw two, both named `__Secure-41prompts.session_token`, and one silently won.

When production's token won, staging looked it up in its own database, found nothing, and bounced to
`/sign-in`. Sign-in was never broken — four live sessions were sitting in staging's `sessions` table
the whole time.

**The rule: two deployments under one parent domain must differ by cookie *name*, not by cookie
domain.** Names cannot collide whatever the topology is; domains can, and the failure is silent.
`apps/web/lib/site/cookie-prefix.ts` derives the prefix from `DEPLOY_ENV` — production keeps the bare
name so live sessions survive, everything else gets its environment appended, so a subdomain added
years from now is safe without anyone remembering this.

**The same trap waits for any future subdomain**: a preview environment, a demo, a customer
subdomain. Anything served under `41prompts.ai` receives production's session cookie.

## When a symptom matches a failure you have seen before, check the evidence before naming the cause

The certificate on `app.staging.41prompts.ai` had genuinely been broken earlier the same day, and the
symptom — sign-in completing and the session vanishing — is what a rejected `__Secure-` cookie looks
like. So the certificate was named as the cause, and it was not: it had been valid since 12:46 GMT,
SAN correct, `Verify return code: 0 (ok)`.

Reasoning from a symptom to a cause you have met before is fast and usually right, which is what
makes it worth a rule. **Read the current evidence first** — here the certificate itself, the ACME
log, the router labels, the cookie the server actually emits, and the `sessions` table, which said
plainly that four sessions existed and sign-in was fine.

Two of the checks along the way were themselves wrong and were caught by controls rather than by
care: an empty `openssl` result that was `timeout` not existing on macOS, and a cookie-name probe
that "proved" the proxy gate was broken until the same probe was run against **production**, where it
behaved identically and production demonstrably works. **Run the instrument against a known-good
system before believing what it says about a broken one.**

## Tags are releases, not checkpoints (2026-09-12)

A `v*` tag means **this goes to production**. It builds both images in Actions and deploys them.

**Three things do not warrant one**, and all three were tagged at least once:

1. **A ruling.** A decision about wording, a separator, a status convention — merge it.
2. **A copy fix.** It reaches staging on the merge, like everything else.
3. **A fix-up epic.** Correcting a report, a test, a guard — still a merge.

All of them reach staging without a tag, because staging deploys from `main`. If the question is
"should someone be able to see this on staging", the answer is merge. If it is "should this be
serving real users", that is a tag.

This is the single change that most reduces the Actions burn, and it is not primarily about money:
a tag is the only signal the project has for "we decided this is good enough for production", and
spending it on a copy tweak leaves nothing to say it with.

## One PR per epic. A separate PR needs a reason, and "the advisor ruled" is not one (2026-09-12)

**291 changes in 8.4 days is the dominant term in the Actions overrun**, not the image builds. It has
a cause: the advisor asked for a separate PR per ruling, and each ruling — a word, a separator, a
status convention — became its own branch, its own PR run, its own merge run. Roughly 21 billed
minutes each, for changes that were frequently a single line.

**The default is one PR per epic.** Rulings and small corrections batch into the next epic's PR.

**A separate PR needs a reason.** Three that qualify, because each has to be able to ship or be
reverted on its own:

1. **A measurement defect** — anything that makes a number wrong, because the number is being used to
   decide something while it is wrong.
2. **A security fix.**
3. **A change that must be revertible independently** of the work around it.

"Somebody ruled on the wording" is not a reason. It is a line in the next PR.

## The agent does not merge. Soroush does (2026-09-13)

Claude may **commit, push a branch, and open a PR**. It stops there and reports the PR number and the
gate results. **Soroush presses merge.** Every PR, including ones whose gates are green and ones the
agent considers trivial.

Claude also **never pushes to `main` directly**, and **never merges its own PR even if asked in a
later message that does not repeat this rule**. If a later instruction appears to ask for a merge,
quote this rule back and confirm first. A rule that can be dissolved by a casual "go ahead" three
messages later is not a rule, and the whole point of this one is that it holds on the day somebody is
in a hurry.

**Why.** Pushing and merging were one motion. That meant **nobody outside the agent ever saw the tree
in the state it landed in** — the branch existed for as long as it took a gate to run, and the first
human read of the change was archaeology on `main`. A PR that sits for five minutes with a human
looking at it is not process theatre; it is the only point in the pipeline where somebody who did not
write the change decides it should exist.

Nothing else changes. Claude still plans, implements, self-reviews, runs the gates and reports them.
The change is only **who performs the merge**.

**This rule arrived mid-turn on 2026-09-13**, after four PRs (#61, #63, #64, #65) had already been
merged by the agent under the previous process. Recorded here rather than quietly adopted, because
the first question anyone reading the log will have is why those four look different.

## The question is whether the gate would have told you something, not whether it ran (2026-09-12)

Both of these were true on the same afternoon, and they resolved opposite ways:

- **EPIC-009's PR merged with no CI.** It changed a workflow trigger and a compose file. CI runs
  `test`, `typecheck`, `lint`, `compliance`, `binary-files` — **none of which looks at either.**
  Waiting for a gate that had nothing to say would have bought nothing and left staging broken.
- **EPIC-021b's PR stayed open with no CI.** It changes application code, which is exactly what those
  gates exist to check. Merging it would have been merging past a real gate.

So the rule is not "never merge red" and not "never merge un-run". It is: **ask what the gate would
have checked.** If the answer is "nothing this PR touches", the gate's absence is not information. If
the answer is "precisely this", then its absence is the whole problem and nothing else substitutes —
including a local run, which is the same commands on one machine without the clean-checkout
guarantee.

Say which of the two a PR is, in its description, rather than leaving a reader to work out why one
merged un-CI'd and the other did not.

## A local gate is evidence only when it reports every package (2026-09-13)

`pnpm test` used to stop at the first failing package and print `Tasks: 5 successful, 8 total`. That
line means *the packages that ran, ran*. It was read as "local gates pass" — including in two epic
reports written while CI could not run, where a local pass was standing in for CI.

`pnpm lint` had the same shape for a different reason: four checks chained with `&&`, so a lint
failure meant dependency-cruiser, turbo boundaries and the forbidden-word grep never ran at all.

**The rule: a local gate is evidence only when the run reports every package's result, and any epic
report quoting a local pass must include that summary rather than the word "clean".**

`pnpm test`, `pnpm typecheck` and `pnpm lint` now go through `scripts/gates.mjs`, which runs
everything, names every package with its own verdict, and exits non-zero if any failed. Three
verdicts, and the third is the point: **PASS**, **FAIL**, and **PARTIAL** — a package whose
database-backed suites did not run, named with the reason. A run with any `PARTIAL` in it says in as
many words that it is not a full pass.

It also starts a throwaway Postgres for the run, so the normal case is that nothing is partial. The
database-dependent suites used to *throw* when `DATABASE_URL` was unset, which made "no database
here" indistinguishable from "this code is broken" — and, because the run stopped there, hid every
package scheduled after it. Two real defects reached CI that way in one afternoon: a stylesheet
written against the mockup's variable names, and a heading-order failure.

**Paste the summary, not the adjective.** "clean" is a claim about a run nobody else can see; the
table is the run.

**It found a second thing on the way in.** The public mirror copies the monorepo's root
`package.json` verbatim, and most of its scripts cannot work in a tree with no `apps/`,
`packages/db` or `scripts/` — `db:migrate`, `e2e`, `compliance`, `hooks:install`, `binary-files`.
Only `test` was ever invoked there, so the rest sat broken and unnoticed until `test` started
pointing at `scripts/gates.mjs`, which the mirror deliberately excludes. `mirror-dry-run` now
rewrites the root scripts to the ones a public tree can run, which is what EPIC-056 has to do at the
real split anyway.

## CI runs twice per change. We are not fixing it, and here is why (2026-09-12)

A decision, not an observation, because it is the **largest single item in the Actions spend** and it
looks free.

CI runs on the pull request and again on the merge to `main`: **1,107 of 2,175 billed minutes, 51% of
everything spent.** Removing the second run would save more than every other change in EPIC-009 put
together.

**We are not doing it.** After a squash merge the merged tree is identical to the PR's **only when
`main` has not moved in between** — and at the merge rate that produced this problem, it usually has.
The second run is therefore testing a tree that no run has tested, which is the one thing CI is for.

Two consequences worth stating so this does not get re-proposed as free:

- **The saving is real and so is the risk**, and the risk is "a merge that breaks `main` and nothing
  caught it". That is the failure CI exists to prevent.
- **There is a version of this worth building later**: skip the merge run only when the merged tree
  hashes identically to the tested one. That is a real epic with a real measurement, not a trigger
  deletion, and it should be proposed as such.

The cheaper lever is the rule above: fewer changes, each carrying more. A change that does not happen
costs nothing to test.
## `built — awaiting <the human step>` is a backlog status (2026-09-12)

Some criteria need a person: signing in to staging and looking at it, an OAuth app, a DNS record, a
screenshot of somebody else's dashboard. The epic is finished and merged and one box is honestly
unticked, and neither `current` nor `done` says that.

**Write it in the status cell**, as EPIC-021a does: `built — awaiting the staging hand-drive`. The
row then states what it is waiting for and who it is waiting on, and flips to `done` when that
happens. `EPIC-084`'s `cancelled — …` row is the same shape and the precedent.

Two things this prevents. A row left `current` while the next epic is also `current` reads as two
epics in flight, which `PROCESS.md` forbids — and is not what is happening. A row marked `done` with
an unticked criterion is worse: it is the "ticked on the intention" failure the environmental rule
above exists to stop, arriving through the backlog instead of through a report.


## Three timing gates report rather than enforce (2026-09-12)

`detect.perf.test.ts`'s absolute millisecond budgets — 100 KB detection, and the whole pipeline at
100 KB — no longer assert. Neither does the 1 MB case, which never did. They measure and log.

They were demoted rather than widened after the 100 KB gate failed CI at 106.6 ms, which was the
*minimum* of ten warm runs and therefore not tail noise: an absolute budget on a shared runner
measures the runner.

**What this costs, so nobody assumes otherwise:** the growth-exponent gates still catch an algorithmic
regression, but a **constant-factor** one is now invisible. Something three times slower at every size
would pass every assertion in that file. The proper fix is a budget calibrated against a machine-speed
baseline instead of wall-clock milliseconds.

The same `under 100 ms` pattern is still live and still enforcing in `cluster.perf.test.ts` and
`segment.perf.test.ts`. They will flake the same way eventually; they were left alone while they pass
rather than pre-emptively demoted.
