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

## Claude merges. The 2026-09-13 no-merge rule is reversed (2026-09-14)

**Claude merges its own PRs once every gate is green.** Plan, implement, self-review, drive it in a
browser, push, watch the gates, merge, report. Soroush does not press the button.

**Claude still never pushes to `main` directly.** A change reaches `main` through a branch, a PR and
a green gate, exactly as before. What changed is only who performs the merge at the end of that.

### The three stops

Merging is the default, not the reflex. **Stop and report instead of merging when any of these is
true:**

1. **A gate is red** — or a gate that would have told you something did not run. The test is the one
   below: ask what the gate checks, not whether it ran. A red gate is never merged past, and "it
   passes locally" is not a substitute (a local run is the same commands on one machine without the
   clean-checkout guarantee).
2. **The PR needs a ruling.** Wording, a vocabulary choice, a product decision, anything where the
   right answer is Soroush's rather than the implementer's. Ship the question, not the guess.
3. **Merging would land something you have not driven in a browser.** The browser-drive rule below is
   a Definition-of-Done item, not a nice-to-have. If the change touches anything a user sees and the
   drive has not happened or could not complete, the PR waits. An unticked criterion is a stop, and
   "the tests pass" has already been proved not to substitute — that is the whole content of the
   2026-09-13 incident.

Anything else — green gates, no open question, driven and working — merges without asking.

### Why the previous rule was reversed, recorded so nobody restores it

**Soroush's decision, 2026-09-14.** The rule of 2026-09-13 said Claude may push and open a PR and
stops there, that Soroush presses merge on every PR, and that the rule must not be dissolved by a
later "go ahead". It lasted one day and **cost a single-use exception every single time it was
applied** — #67, #68 and #66 on the day it was written, then #69 the next morning. A rule that needs
an explicit exception on every occurrence is not governing anything; it is a speed bump with a
standing waiver, and each waiver had to be argued, quoted back and confirmed before any work could
proceed.

**One thing to be accurate about, because "record why" is worthless if the record is wrong.** Soroush
gave the reason for reversal as a billing constraint that no longer applies. **That is not the reason
the original rule wrote down for itself.** Its stated rationale was review, not cost:

> Pushing and merging were one motion. That meant **nobody outside the agent ever saw the tree in the
> state it landed in** […] A PR that sits for five minutes with a human looking at it is not process
> theatre; it is the only point in the pipeline where somebody who did not write the change decides
> it should exist.

Both are written here rather than one quietly replacing the other. The decision to reverse is
Soroush's and stands either way; the discrepancy is recorded so that anyone who later reads "it was
only about billing" can see that the original text said something else.

**What the reversal therefore gives up, stated plainly.** The human read before a change lands on
`main` is gone. Nobody outside the agent sees the tree in the state it lands in. That was a real
property and it is being traded for throughput, knowingly. **The three stops above are what is left
of it**, and they are the reason this is a reversal with conditions rather than a return to pushing
and merging as one motion. The 2026-09-13 rule was written because that single motion had no brake
at all; the brake now lives in the stop list instead of in a person.

**Do not restore the old rule by citing the incident.** The 2026-09-13 outage was not caused by the
agent merging. It was caused by nobody having loaded a deployed page in a browser across twenty
epics. The defence against that is stop 3 and the browser-drive rule, both of which survive here
intact.

**History, so the log is readable.** Four PRs (#61, #63, #64, #65) merged by the agent under the
original process. #67, #68 and #66 merged under a single-use exception on 2026-09-13. #69 merged
under another single-use exception on 2026-09-14. From #70 onward, the rule above applies and no
exception is needed.

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

## A helper that normalises state hides the defect from every test that uses it (2026-09-14)

**This replaces two earlier entries** — "A test written from the implementation asserts the
implementation" and the named `next dev` mechanism under the browser-drive rule. They were two
write-ups of one failure, and a third instance arrived before anyone noticed they were the same
thing. One rule, three instances.

### The three

1. **`auth.spec.ts` asserted the dead end as correct.** It navigated to `/app` and asserted the
   sign-in `next` value was `/app`. Both true; both the bug. `/app` was a stub with no project list
   and no link to one, so every user who signed in was stranded, and the suite named that destination
   as the expected one. Green for the whole of EPIC-021a, 021b and 022.
2. **`playwright.config.ts` ran the suite against `next dev`** for twenty epics. The dev server
   generates every chunk on request and serves CSS from memory, so a stylesheet that fails to build,
   a chunk that 404s or a stale workspace `dist` **cannot reach the suite**. That is how 151
   assertions stayed green while the deployed `/app` rendered as unstyled text.
3. **`addBlok` ends in `await page.reload()`** in `variables.spec.ts` and in `compiled-pane.spec.ts`.
   Every test in both files therefore reloads between writing a blok and looking at the result — and a
   reload is a fresh server render, which is precisely the thing that makes the stale client state
   look correct.

### The general form

**A convenience that normalises state — reload, wait, retry, reset, a friendlier server — makes the
system look settled, and a defect in how the system settles by itself then cannot be observed.** The
helper is not wrong about anything; it is silent about the one thing that matters.

**Why a helper is worse than the same line inside a test.** A normalising line in a test body is
visible to whoever reads that test, and it is one test. In a helper it is invisible at every call
site and it disables **every test in the file at once**. `variables.spec.ts` has four tests and none
of them could fail on BUG-022. That is not four chances to catch it; it is zero, bought with one line
written for tidiness.

### The rule

**A helper that normalises state must justify itself in a comment that says what it is waiting for
and what it could therefore hide. No justification, no normalisation — delete the line and let the
test wait on a real condition instead.**

Concretely:

- **Wait on a condition, not a duration.** `expect(locator).toHaveText(…)` retries against the real
  thing. `waitForTimeout(350)` asserts that 350ms is enough on every machine forever, and passes when
  the value never arrives at all.
- **A `reload()` inside a helper is the sharpest case**, because it converts "the app updated" into
  "the server rendered", and those are different claims. If the test is about what the user sees after
  they act, reloading is not a detail — it is the assertion, replaced.
- **Assert a destination, not a path.** "Signing in lands somewhere with your projects on it", not
  "`next` equals `/app`". If the route changes and the user still arrives, the test should pass; if
  the route is unchanged and the user is stranded, it should fail.
- **Write the assertion from outside the implementation** — the mockup or the epic file — never by
  reading the handler and writing down what it does.
- **Ask what a person does next.** A page nobody can leave passes every assertion about what it
  renders. "And then what" is the question that catches it, and it is much easier to ask with the
  page in front of you, which is why the browser-drive rule below exists.

### What the harness itself owes

The same rule applies to the harness, because instance 2 was the harness. **`pnpm e2e` builds** —
through turbo, because `turbo.json`'s build task carries `dependsOn: ["^build"]` and a workspace
`dist` is a gitignored artifact that will otherwise be whatever was lying around. `E2E_DEV=1` returns
to the dev server for fast iteration while writing a test; never to make a failing one pass, and CI
has no escape hatch. The cost is a build on every run, and that is the price of testing the artifact
that ships rather than a development convenience that resembles it.

### The audit, 2026-09-14

Every helper in `apps/web/e2e/` was read for this shape. What it found:

| helper | file | normaliser | verdict |
|---|---|---|---|
| `addBlok` | `variables.spec.ts` | `page.reload()` | **hid BUG-022** |
| `addBlok` | `compiled-pane.spec.ts` | `page.reload()` | **hid BUG-021b-compiled-pane-stale** |
| `addBlok` | `canvas.spec.ts` | none | clean — and the three are otherwise near-identical, which is how the other two were spotted |
| `setTheme` | `landing`, `soft-ship`, `dev-ui`, `decompile` | `waitForTimeout(350)` | duration, not condition — justify or replace |
| `decompile` | `decompile.spec.ts` | `waitForTimeout(350)` | same |
| `signIn` / `newPrompt` | canvas, compiled-pane, variables, capture | navigation only, each awaited on a real condition | clean |
| `editSpanByHand` | `compiled-pane.spec.ts` | none; ends on a state assertion | clean |
| `expectSaved`, `setBlokText` | `canvas.spec.ts` | none; assert a real attribute | clean |
| `declaredName`, `spansOf`, `toDisplayText`, `asSubmitted`, `uniqueEmail` | various | pure, no page interaction | clean |

**Two live defects, both found by the audit rather than by a test**, and they are almost certainly one
bug: after an autosave, neither the compiled pane nor the Variables tab reflects the change until a
server render. Both helpers that hide it were written the same way in the same week.

## Plan, implement, drive it in a browser, then push (2026-09-13)

**Pushing is the last step, not the middle one.** The order is: plan → implement → **test in a real
browser** → iterate until there are no bugs → commit and push.

"Test in a real browser" means two things, and the second is the one that matters.

**1. Before pushing: drive the feature locally against the BUILT app**, not the dev server, signed in
as a seeded test user. Do the actual journey — create the thing, edit it, look at it — not just
assertions about it.

**2. After the deploy lands: smoke-drive the deployed URL.** Load the real page, confirm it renders
**styled and complete**, and confirm the feature works. **An epic is not done until this passes.**

**Why both, and why step 2 is not redundant.** EPIC-021a and EPIC-021b passed every e2e gate in CI —
151 Playwright assertions green — while the deployed `/app` rendered as unstyled text with no project
list. Playwright runs against a **dev server**, where CSS is served from memory by the dev middleware
and every chunk is generated on request. A build-time or asset-serving failure is therefore invisible
to it, and would have been invisible to a local drive too if that drive used `pnpm dev`. Only the
built app can fail the way the built app fails, and only the deployed one can fail the way the
deployed one does.

**The mechanism that made this possible is now the rule above**, "A helper that normalises state hides
the defect from every test that uses it", instance 2 — along with what `pnpm e2e` does about it.

**Credentials: there are none, and there must not be.** The seeded test user signs in through the
**magic-link token the harness reads from the database** — the mechanism `apps/web/e2e/db.ts` already
uses. Nothing is stored: the token is minted by the ordinary sign-in flow and read back from the row
it was written to, so there is no password in the repository, no secret in a transcript, and nothing
for anyone to type into a chat window. A Playwright storage-state fixture was the alternative and was
rejected: a committed session cookie is a bearer credential, and one that outlives its usefulness.

### Driving a deployed environment: the one supported mechanism (2026-09-14)

**This is the only sanctioned way for the agent to sign in on a deployed environment. It is written
down here so it is not renegotiated at the start of every epic.** It was renegotiated twice in two
days, and on 2026-09-14 the post-deploy drive of #69 stopped half-finished because the read was
refused mid-session — with the browser-drive rule now a Definition-of-Done item on every epic, that
would otherwise have recurred every epic.

**Soroush granted this as a standing permission on 2026-09-14.** No per-drive yes is needed. It is a
carve-out from `infra/ACCESS.md` rule 3 and `CLAUDE.md` server-access rule 3, and only this exact
shape is covered.

The flow, which is the same one `apps/web/e2e/db.ts` uses locally:

1. In the browser, go to the deployed `/sign-in`, enter a throwaway address, submit. This writes one
   `verifications` row through the ordinary sign-in flow. Nothing is created yet — Better Auth
   creates the user at **verify**, not at request — so an abandoned drive leaves no account behind.
2. Read the token back with **one read-only `SELECT`** on staging's database:

   ```
   ssh 41p-box 'docker exec -i <container> sh -c '"'"'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA'"'"'' < token.sql
   ```

   where `token.sql` is
   `select identifier from verifications where value::jsonb ->> 'email' = '<the address>' order by created_at desc limit 1;`

3. Open `/api/auth/magic-link/verify?token=<token>&callbackURL=<where the drive starts>`. Drive.

**The constraints, all of them binding:**

- **Staging only.** Never production. Production has real users' rows in that table.
- **Read-only.** A `SELECT` of one column of one row. No `INSERT`, `UPDATE`, `DELETE`, `ALTER` or
  `DROP` rides along on this permission — cleanup included. A drive that wants to delete its own test
  user is asking for a separate yes, and usually should just not create one (see step 1).
- **The token goes to a scratchpad file and never into the transcript.** It is a bearer credential
  for fifteen minutes. Redirect the command's output to a file; do not echo it, do not paste it into
  a report, do not put it in a commit message.
- **Look the container name up, never hardcode it.** `docker ps --filter "name=postgres-<app-uuid>"`.
  The suffix changes on every redeploy — it changed underneath this very drive between one command
  and the next, which is exactly how a hardcoded name becomes a confusing `No such container`.
- **Use a throwaway address that says what it is**, e.g. `claude-staging-drive-<date>@example.com`,
  so a row found later in the table explains itself.

**Still no standing credential exists.** That was the point of the original design and it is
unchanged: there is no password in the repository, no session cookie committed, no secret in a
transcript, and nothing for anyone to type into a chat window. What is standing is *permission to
run one read*, not a credential. A Playwright storage-state fixture remains rejected for the same
reason as before — a committed session cookie is a bearer credential that outlives its usefulness.

**If the permission blocks anyway, say so plainly and stop.** Do not work around it, and do not
report the drive as passing on the strength of the half that ran. Name which assertions did not run
and why, and leave them unticked.

### The drive cleans up after itself (2026-09-14)

**The browser drive is now a Definition-of-Done item on every epic, so it creates test data on every
epic.** The first day of it left six throwaway projects on staging. Two futures were available —
the drive tidies up, or staging accumulates rubbish forever — and only one of them survives contact
with a year of epics. **The drive tidies up.**

**The identity is the scope.** Every drive signs in as

```
claude-drive-<label>-<timestamp>@example.com
```

and cleanup is one statement:

```sql
delete from users where email like 'claude-drive-%@example.com';
```

Deleting the user is enough: `projects.owner`, `prompts.project`, `bloks.prompt` and the variable
tables all cascade, so one row removes the whole tree and nothing is orphaned.

**Two independent guards, which is why this is safe to make standing:**

1. **The prefix** `claude-drive-` is ours and appears nowhere else.
2. **`example.com` is reserved by RFC 2606** and can never be a deliverable address, so no real
   user's row can ever match this pattern — not by accident, not by someone signing up adversarially.

Either guard alone would do; both together mean the blast radius is a set that cannot contain a real
account.

**Soroush granted this as a standing permission on 2026-09-14**, narrowed to exactly this statement
on **staging**. It is the only write covered — the read-only `SELECT` above is otherwise still the
whole of what a drive may do to the database, and anything else is one command, one yes.

**Run it at the end of the drive, and again at the start.** Running it first makes a drive whose
browser crashed before cleanup self-healing rather than leaving a row for the next person to find;
the statement is idempotent and deleting nothing is a normal outcome.

**Not `DELETE FROM projects`.** Scoping by project name would mean matching on a string a person can
type, on a table real users own rows in. Scoping by identity means the pattern lives on the column
that decides ownership, which is the one that cannot be coincidentally satisfied.

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
