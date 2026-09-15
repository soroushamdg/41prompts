# Running unattended

You are a Claude Code run started by `scripts/run-next-epic.sh` with
`--dangerously-skip-permissions`. Nobody is watching. There is no one to ask.

This file is the standing instruction for that. It does not replace `CLAUDE.md` or
`docs/PROCESS.md` — both still bind, in full — it says what to do at the moments where
those two assume a person is available and there is not one.

Read `CLAUDE.md`, `docs/PROCESS.md` and your epic file before you start. Then follow the
loop below.

---

## The loop, in order

One epic. One branch. One merge into local `main`. These steps run in this order, and each one is
recorded as it finishes:

| # | step | done when |
|---|---|---|
| 1 | `epic-file` | `docs/epics/EPIC-xxx-<name>.md` exists in `PROCESS.md`'s format — read it, and copy it to `docs/epics/CURRENT.md`. **You are never handed an epic that has no file**; the picker stops on a `todo` row without one rather than starting it (see below). If the file you were handed is missing, something is wrong upstream: say so and stop rather than inventing the epic. |
| 2 | `plan` | `docs/epics/plan-EPIC-xxx.md` written. Plan first, always; `CLAUDE.md` says stop and show the plan, and unattended "show" means write it down before you write code. |
| 3 | `implement` | the code is written, on the branch the runner named. |
| 4 | `gates` | `node scripts/gate-run.mjs` green, with every package reporting. A `PARTIAL` is not a pass. **Run that, not a list of gate commands** — see below. **Commit your work first:** `gates.mjs` now advertises a `ci` mode, so `gate-run.mjs` resolves to it and runs it alone — and that mode tests a clean checkout of a **commit** and refuses a dirty tree (exit 2, with the files named). |
| 5 | `local-drive` | the feature driven in a real browser against the **built** app (`pnpm build`, then `next start`), signed in as a fresh throwaway user. Not `next dev`. Screenshots into `docs/epics/reports/screenshots/EPIC-xxx/`. **Since 2026-09-15 this is the browser-drive Definition-of-Done item** — there is no deployed drive, because there is no deploy. |
| 6 | `merge` | `git merge --no-ff` into local `main`, on a green gate. Record the merge commit. **No push, no PR, no `gh`** — `CLAUDE.md`, "Nothing is pushed" (2026-09-15). The merge commit's message carries what a PR description carried, new dependencies and their reasons included. |
| 7 | `report` | `docs/epics/reports/EPIC-xxx-report.md` and `docs/epics/sessions/EPIC-xxx-session.md` written. |
| 8 | `backlog` | the epic's own status cell in `docs/backlog.md` ticked. |

Then `node scripts/run-state.mjs clear` and exit. Clearing the state file is how the runner
learns the epic finished; an epic that ends without clearing it will be resumed.

### Record each step as you finish it

```
node scripts/run-state.mjs set --step gates
node scripts/run-state.mjs set --step merge --merge-commit 9f3a1c2
node scripts/run-state.mjs clear        # only when step 8 is done
```

**This is not bookkeeping.** A run that dies after step 6 and before step 8 has left
finished work on `main`. A runner that started that epic over would branch from a `main` that
already contains it and reimplement it into a conflict. The state file is what makes the next
invocation resume at step 7 instead.

Your prompt names the step to resume at. **Everything before it is already done and on
disk. Verify it, do not redo it.** If step 6 says merged, check `main` — the code is there.

**The old steps 6–10 were `push`, `ci`, `merge`, `deploy`, `drive`** and they are gone as of
2026-09-15 — four of the five described GitHub and Coolify doing something, and nothing is pushed
to either. `run-state.mjs` keeps them as recognised names so a state file written before that date
still resumes rather than restarting from the top; it will not let a new run set one.

---

## Never stop to ask

You cannot ask. A question is a stopped run that nobody will restart for hours.

When a question arises, answer it in this order and **cite which source settled it**:

1. `CLAUDE.md` — the rules, the vocabulary, the naming, the "never touch" list.
2. `docs/decisions/ADR-*.md` — the irreversible choices, ADR-003 for any word.
3. `docs/design/` — the mockups are the spec. `docs/design/README.md` first.
4. The epic file, and `docs/roadmap.md` for the epic's tasks, tests and review.
5. `docs/PROCESS.md` — how the work is done, and every rule written from a past failure.

If none of them settles it: **choose what best serves the ICP** — an AI engineer at a company
of 10–500 people who owns a production prompt — **and the epic's stated goal.** Then log it.

### `docs/decisions/AUTONOMOUS.md` is the one thing that must never be skipped

One line per decision, appended:

```
| date | EPIC-xxx | the question | the choice | the reason |
```

This is the batch Soroush reviews later. It is the entire substitute for him being asked at
the time, so a decision made and not logged is a decision he never gets to reverse. If you
are ever choosing between logging a decision and anything else, log the decision.

**This is a deliberate carve-out from `CLAUDE.md`'s "Never touch" list**, which covers
`docs/decisions/*`. `docs/decisions/AUTONOMOUS.md` is the one file in that directory an
unattended run appends to, and it appends only — it never edits an existing line and never
touches an ADR.

---

## Hard limits, unattended

**Never create a `v*` tag.** Production never moves without Soroush. A tag is the only signal
this project has for "we decided this is good enough for real users" (`PROCESS.md`, "Tags are
releases, not checkpoints"), and an unattended loop spending it would empty it of meaning.

**Never change production.** Not its Coolify settings, not an environment variable, not its
database, not its R2 objects. On 2026-09-13 eleven production environment variables were
overwritten in one paste; that is the failure mode, and it does not need an agent to be
malicious, only to be unsupervised.

**Everything in `CLAUDE.md`'s "Never touch without an explicit instruction" list still
applies**, including `docs/backlog.md` and `docs/roadmap.md`. Two carve-outs, both narrow:

- the **status cell of the epic you are working**, in `docs/backlog.md`, at step 8;
- appending to `docs/decisions/AUTONOMOUS.md`.

Nothing else in either file. Not another row, not a paragraph under the table, not the
roadmap at all.

**Merging to local `main` is allowed. Pushing and deploying are not** — amended 2026-09-15,
`CLAUDE.md`, "Nothing is pushed". The merge is already the process (`PROCESS.md`, "Claude
merges", 2026-09-14) and its three stops still apply: a red gate, a change that needs a ruling,
or a change you have not driven in a browser. Unattended, the second stop is different: you do
not stop, you decide and log it. The first and third are unchanged and absolute. **`git push`,
`gh pr`, and any Coolify deploy are now in the same category as touching production: not
yours.**

**Nothing else reaches the box.** The read-only `SELECT` for a magic-link token and the
`claude-drive-%@example.com` delete are the only two database statements you may run, both on
staging, both already granted as standing permissions in `CLAUDE.md`. Every other mutating
command on the box needs one command, one yes — and there is nobody to say yes, so the answer
is no.

### The gate is `scripts/gates.mjs`, whatever it currently does

**Run `node scripts/gate-run.mjs`. Never `pnpm test && pnpm typecheck && pnpm lint && pnpm
compliance`, and never any other list written down in advance.**

`scripts/gates.mjs` is the repository's definition of the local gate, and it is being worked
on: the direction is a mode that reproduces CI exactly — clean checkout, frozen lockfile, cold
cache. A list of commands copied into this file, or into a run's head, is a copy of a decision
that lives somewhere else, and it goes stale **silently**. The day the parity mode lands, a
hardcoded list keeps running the old, weaker check and reports it as a pass — which is the
`PARTIAL`-read-as-pass failure again, one level up.

`gate-run.mjs` asks `gates.mjs` what modes it accepts, reading the answer out of the tool's own
usage line rather than guessing at a name, and then:

- if a **CI-parity mode** is advertised — as a positional `ci`, or a flag like `--ci` or
  `--ci-parity` — it runs **that, alone**, because a mode claiming parity with CI covers what
  CI covers;
- otherwise it runs **every** advertised mode, and then `pnpm compliance`, because today
  `gates.mjs` does not carry `reuse`, `license-gate`, `binary-files` or `mirror-dry-run` and
  dropping them silently is the thing being avoided;
- and if `gates.mjs` says nothing about itself, it **fails** rather than substituting a gate of
  its own invention.

It prints which it chose and why before it runs anything, so the run log says in one line
which gate actually executed. `node scripts/gate-run.mjs --explain` prints the plan without
running it.

**Nothing needs editing when the parity mode lands**, and nothing in this repository needs to
coordinate with whoever lands it. If you find yourself about to write a gate command into a
script, a report or a plan, you are re-creating the copy this exists to delete.

### Three strikes on the same cause, then stop

**If a gate fails three times on the same cause, stop that epic.** Write
`docs/epics/BLOCKER-EPIC-xxx.md` — what, where it surfaced, which criterion it blocks, what
you tried three times, and the options — and exit non-zero. Do not try a fourth way.

"The same cause" is the test: three different failures are three problems and you keep going;
the same failure three times is a wall, and the fourth attempt is how an unattended run burns
an afternoon rediscovering it.

---

## The browser drive is not optional

**It does not get skipped because the change looks small.** Twenty epics passed every gate
while the deployed `/app` rendered as unstyled text, and every one of those epics looked fine
from the test output. `PROCESS.md`'s "Plan, implement, drive it in a browser, then push" is
the rule; this section is only what changes when nobody is watching.

**Step 5, against the built app locally, is the drive an epic is not done without** — amended
2026-09-15, when the deployed step went away with the push. `pnpm build` then `next start`,
never `next dev`: a dev server serves CSS from memory and generates every chunk on request, so
it cannot fail the way the thing that broke twenty epics failed. A built app can. Sign in with
the magic-link token read back from the local database, the mechanism `apps/web/e2e/db.ts`
already uses.

**Say what the local drive does not cover**, in the report, rather than letting it read as a
deployed one: the image build, the Coolify environment, Traefik, migrations against the real
database. Those wait for Soroush's next push. Where staging *is* serving the commit under test
— check `/healthz` — the deployed drive is still worth doing and is still governed by the one
sanctioned mechanism (`PROCESS.md`, "Driving a deployed environment"): the magic-link token read
back with a single read-only `SELECT` on staging, token to a scratchpad file and never into a
transcript, container name looked up rather than hardcoded.

**A worker-only or core-only epic with no route and no user-visible string says so in the
report**, in its own numbered section, the way EPIC-030's report §11 does. It does not leave
an unticked box that reads like an omission, and it does not claim a drive that did not
happen.

### A fresh user for every drive. Never a persistent one.

Every drive signs in as

```
claude-drive-<label>-<timestamp>@example.com
```

created fresh for that drive, and **there is deliberately no standing test account**.

**The reason matters more than the convention.** The `/app` dead end was found on 2026-09-14
only because the drive signed in as an account with no projects, hit a page with no project
list and no link to one, and had nowhere to go. A reused account accumulates state: after the
first run it always has a project, so the empty state is never rendered again and a first-run
defect becomes permanently invisible. That is the same shape as the helper that reloaded — a
convenience that normalises state, hiding the defect from every test that uses it
(`PROCESS.md`). A persistent test user is that failure with a login.

**Where the epic needs an account that already has data, build the data through the product's
own UI.** Create the project by clicking through project creation; create the prompt by
creating a prompt; add the bloks by adding bloks. Do not seed the database. **Driving the
creation path is part of the test** — it is how you find out that the path a real user takes
to reach the state your feature needs is broken.

**Clean up at the start of the drive and again at the end:**

```sql
delete from users where email like 'claude-drive-%@example.com';
```

Staging only. Running it **first** is what makes a drive whose browser died self-healing
rather than something the next run has to notice; the statement is idempotent and deleting
nothing is a normal outcome. Two independent guards make this safe — the `claude-drive-`
prefix is ours and appears nowhere else, and `example.com` is reserved by RFC 2606 so no
deliverable address can ever match. Deleting the user is enough; projects, prompts, bloks and
the variable tables all cascade.

---

## What the runner handles, so you do not

These are `scripts/run-next-epic.sh` and `scripts/run-epics.sh`, not you. They are described
here so that you recognise them when they happen and do not work around them.

### Staging must be serving before an epic starts

The runner checks before every epic, and **not with `/healthz` alone** — `/healthz` returns a
JSON literal from a route handler and was green through the whole of the 2026-09-13 outage. It
proves a process is up and nothing else. So the check also fetches the apex, finds the
stylesheet the page links, fetches **that** and confirms it is real CSS, and loads `/sign-in`
and confirms there is a submittable form on it.

If staging is not serving, no epic starts.

**Amended 2026-09-15: this check no longer gates anything you do.** It was there because the
old step 10 drove the deployed URL, and an epic whose deploy could not be verified should not
have reached step 3. Nothing deploys now, so a red staging check says only that the commit
Soroush last pushed is unwell — worth reporting to him, and not a reason to refuse to build.

### Gates are a full stop

`docs/backlog.md` carries `▣ GATE` rows. **When the next item is a gate, the loop stops and
exits**, having written what the gate requires into the log. A gate is Soroush's decision, it
is recorded in `docs/decisions/GATE-n.md`, and the epics behind it are not reachable by
stepping around it. You will never be handed an epic from behind an undecided gate.

### Rows whose dependency is a person

A row marked `blocked`, `deferred`, `cut` or `cancelled` is **skipped** — not attempted, not
ticked, and never counted as done. The same goes for a row the advisor marked `not scheduled`
or `awaiting` something, and for a row whose epic file says in as many words that it waits on
Soroush; the runner names the file and the line in the log when it skips one.

**You will still occasionally be handed an epic that turns out to need a person** — an
account on somebody else's service, a domain purchase, a signature, an interview with a real
human being. The backlog cannot always tell in advance. When you find that out, that is a
`BLOCKER`: write `docs/epics/BLOCKER-EPIC-xxx.md` saying which step needs a person and what
exactly they have to do, and exit. Do not build a half version. Do not tick the row.

### A row with no epic file stops the loop

**A `todo` row that has no `docs/epics/EPIC-xxx-*.md` is a full stop, like a gate.** The runner
names the row, says what is missing, and exits; it does not step over it to the row below.

**EPIC-006 is why.** Its row said `todo`, it was the first row of the first stage, and no epic
file existed — so nothing told the picker that every one of its tasks needs Soroush's own
accounts and a payment method. It was picked ahead of every epic that was actually ready, and
the run would have discovered the problem at the first namespace.

**A stop rather than a skip, deliberately.** An unwritten row is not known to be
human-blocked — it is unknown. The epic file is where an epic says it needs a person, which is
exactly what cannot be read when there is no file, and stepping over it would start a later
epic on the assumption that whatever was skipped was safe to leave behind. Someone writes the
epic, or marks the row `deferred` or `blocked` with a reason, and the loop moves again.

**This is not yours to fix from inside a run.** Writing the epic file for a row nobody has
scoped is the advisor's job, and `docs/backlog.md` is on the "never touch" list. The loop
stopping is the correct outcome.

### A blockered epic is not handed back

Once you write `docs/epics/BLOCKER-EPIC-xxx.md`, the picker skips that row on every subsequent
pass, whatever its status cell still says. `PROCESS.md` has the advisor set the row to
`blocked` — but the advisor is asleep and the row still says `todo`, and without this the loop
would pick the same epic straight back, block on the same cause, and call that two consecutive
blockers while having tried exactly one epic.

**Do not set the row to `blocked` yourself.** The status cell carve-out is for ticking an epic
you finished. Writing the BLOCKER file is the whole of your job here; turning it into a status
is Soroush's.

### Two consecutive blockers stop everything

One blocker is a hard epic. **Two in a row means something upstream is wrong** — a broken
environment, a bad assumption in the stage, a dependency that is not actually done — and every
further epic is paying for it. The loop stops after the second rather than generating a third
blocker at full price.

### A release is due every three epics

**After every third completed epic the loop stops**, writes `docs/epics/RELEASE-DUE.md` naming
the commits production does not have and what a `v*` tag would carry, and waits. It never
tags. Soroush cuts the release; restarting the loop is how he says he has.

**Why three and not ten.** Every epic merges to `main` while staging and production stay where
they are, so the gap is monotonic — it only ever grows, and nothing in the loop closes it.
**Since 2026-09-15 it grows faster**: nothing is pushed, so staging no longer moves either and
the drift is now against *both* deployed environments rather than production alone. Ten epics of
drift is not ten times the risk of one, it is worse than that:

- **The deploy that eventually happens is the largest this project has ever done**, on the
  system that failed twice on 2026-09-13, and the last two production incidents were both
  deploy-time.
- **A big release cannot be bisected.** If something breaks after a ten-epic tag, the failure
  could be in any of ten epics and the rollback is all ten. After a three-epic tag it is one
  of three and you can read the diff.
- **Production is the only environment with real users' rows in it.** Staging's drive data is
  disposable; a production migration that has never run against real data is not.
- **The gap is already 40 commits and 271 files** as of 2026-09-14, before this loop has run a
  single epic. Three is not a cautious number chosen in the abstract; it is smaller than where
  the project already is.
- **Nothing is rehearsed on staging any more.** Under the old loop every epic reached a
  deployed environment before production saw it. `RELEASE-DUE.md` is now the *first* moment any
  of it meets a real build, a real image, and a real database.

Ten would be the number if the release were cheap and reversible. It is neither: it builds
both images, deploys the box, and the rollback path is `infra/rollback` and a runbook. Three
keeps each decision small enough that Soroush can read the whole diff before making it, which
is the only thing that makes an unattended loop safe to leave running at all.

### STOP, and the usage window

`touch STOP` in the repository root stops the loop — between epics, and **mid-epic**: the
runner polls for it while you are working and terminates the run if it appears. Your state
file is left in place on purpose, so removing `STOP` and restarting resumes at the step you
reached. The same goes for `SIGTERM`.

If the usage window runs out, the runner sleeps until it resets and **resumes the same epic at
the same step**. It does not skip to the next one. You will not notice this happened; you will
simply be started again with a resume step.

---

## What the log is for

`docs/epics/sessions/autonomous-run.log` gets every decision the runner makes: which epic
started, what was skipped and why, what merged, what failed, what it is waiting for. It is
gitignored (`*.log`), so it stays on the machine that ran it — and that is deliberate: it is a
machine's record of a night's work, not a repository artifact, and an epic commit should never
sweep it up.

Your own record is the two files at step 7, and those **are** repository artifacts:

- `docs/epics/reports/EPIC-xxx-report.md` — built, skipped, open questions, exact verify
  commands, every acceptance criterion with its evidence.
- `docs/epics/sessions/EPIC-xxx-session.md` — date, prompt, plan summary, decisions and why,
  what took longer than expected, the tail of the verification output, open questions.

Write them as if the next session has no memory of this one, because it does not.
