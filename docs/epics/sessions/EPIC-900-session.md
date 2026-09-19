<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# EPIC-900 — session log

**2026-09-19.** Branch `epic/900-tech-debt-sweep`. Claude Code, in the advisor's chair for the epic
file and the implementer's for the rest (`docs/PROCESS.md`, amendment of 2026-09-15).

## The prompt

`prompt_continue` in the repository root: read `CLAUDE.md`, `docs/PROCESS.md`, `docs/AUTONOMOUS.md`,
`docs/epics/CURRENT.md`, `docs/backlog.md` and `docs/decisions/AUTONOMOUS.md`; work out where the
project is from git and the filesystem rather than from any of them; pick up the next epic and build
it. Plus a new standing instruction, dated the same day: **the drive is watched** — it opens the
built app in the IDE preview pane and drives a visible browser.

## Which epic, and why it was not a gate stop

`node scripts/pick-next-epic.mjs` printed `GATE: ▣ GATE 3`, as it has for four consecutive epics.
The cell is stale rather than undecided — `GATE-3.md` records Go on 2026-09-16 and `GATE-5.md` Go on
2026-09-17, and every epic behind both has shipped with a report. Stopping there would have been
stopping on a typo. EPIC-072's ruling of 2026-09-18 settled exactly this and is followed rather than
re-litigated.

Behind it, `docs/epics/HANDOVER.md` claims every remaining product row needs Soroush. **Verified row
by row against `docs/backlog.md` rather than trusted**: EPIC-035 deferred by his own GATE 3 ruling;
EPIC-070 needs a Stripe account; EPIC-071 `deferred`; EPIC-073 depends on 035; EPIC-064 needs
recruited people; EPIC-060–063 depend on 064; EPIC-006b/c/d `not scheduled`. **EPIC-900 is the only
buildable row left**, and unlike EPIC-901's session there was no choice to put to him — so it was
built rather than asked about, and the ask comes at the end as `prompt_continue` specifies.

## Plan, and where it was departed from

`docs/epics/plan-EPIC-900.md`, written before any code. Two departures, both recorded here because
the plan is the record:

1. **The gate's tests are `apps/web/dead-code.test.ts` under vitest, not `scripts/dead-code.test.mjs`
   under `node --test`.** The plan said the latter; the repository has four precedents for the
   former — `audit.test.ts`, `binary-files.test.ts`, `forbidden-words.test.ts`,
   `license-gate-boundary.test.ts` — each running the script in a **child process** because
   `turbo boundaries` refuses an import that leaves `@41prompts/web`. Consistency with four
   precedents beat a plan written before looking.
2. **The gate and its 43 fixes are one commit, not two.** The plan had the gate land first so it
   could be seen going red. That commit would have been a tree where `pnpm dead-code` fails, and
   `CLAUDE.md` says never auto-commit a broken state. The red is evidenced in the report instead.

## What took longer than expected

**The gate failing on itself, twice.** Both times it protected symbols with *prose*: first a
Markdown file (the epic file naming its own findings), then a comment inside a code file (the gate's
own header naming the two examples). Neither was predicted; both were found by running it against
the real tree and diffing against the survey that commissioned the epic. That diff — 35 against 39,
then 37 against 39 — is the only reason either was noticed, and it is the argument for measuring the
tree before writing the gate rather than after.

**`better-auth`.** `pnpm update -r` moved it 1.7.2→1.7.5 and two auth tests failed with
`Drizzle schema mismatch`. The first instinct was that a de-export had broken something; the second
was "environmental". Neither — 1.7.3 added a startup schema check that our `accounts.issuer` column
fails. Running the test standalone gave a *different* failure (missing `BETTER_AUTH_URL`), which is
the shape `docs/PROCESS.md` warns about: an instrument that answers a different question. Reproducing
it under `gates.mjs`'s own environment gave the real error in one run.

Then the useful question: **is this broken today?** Probed rather than reasoned about — signed a
fresh user all the way through magic-link verification against the built app and counted rows.
**1 user, 0 accounts.** So the column has never been written and is not a live defect; it blocks the
upgrade and it becomes real the first day a second sign-in method exists. That took ten minutes and
turned "the upgrade failed" into a sentence somebody can act on.

**The drive's first run**, which waited 30s for a `blok-card` test id that does not exist. Invented
rather than read off `decompile.spec.ts`. Cost one run; the fix was two minutes of reading.

## Decisions

Ten, in `docs/decisions/AUTONOMOUS.md`, dated 2026-09-19.

## Verification, tail

```
pnpm dead-code
  No orphaned export: 888 exported values across 590 source files are each named
  somewhere else (790 files read, 0 allowed by name).

node scripts/gates.mjs ci --allow-dirty        # commit 5dd04c9
  17 step(s), all passed, 13m15s wall
  · pnpm e2e  PASS  7m21s  4 test(s) skipped on darwin
  · pnpm dead-code  PASS  0m01s
  --allow-dirty: 1 uncommitted file(s) were NOT part of this run.   [app-icon.jpg]

npx tsx scripts/drive-epic-900.mts
  PASS  the server answering is the build just made — BUILD_ID AOohmCBaYrb0BZQGuu5wv
  PASS  the dependency set under test is the upgraded one, with better-auth held at 1.7.2
  PASS  the decompiler turns a pasted prompt into bloks in the built app — 5 bloks
  PASS  and runs the detectors over it — 2 findings
  PASS  creating a project through the UI works — heading "Sweep drive 2026-09-19"
  37/37
```

A second `gates.mjs ci` run covers the docs commit that carries the report, because it also touches
`apps/web/lib/site/changelog.ts`, which is application code:

```
node scripts/gates.mjs ci --allow-dirty        # commit 7f554b6
  17 step(s), all passed, 13m29s wall
  · pnpm e2e  PASS  7m16s  4 test(s) skipped on darwin
  · pnpm dead-code  PASS  0m01s
  --allow-dirty: 1 uncommitted file(s) were NOT part of this run.   [app-icon.jpg]
```

Both runs print the same three uncovered things, and the first — darwin skipping the four `-linux`
visual baselines — is the one that matters most this epic, because React and Next both moved. The
report says so rather than implying the green covered it.

## Open questions

All five are in the report's §12 and all five are Soroush's: `app-icon.jpg`, the `accounts.issuer`
migration, the two gate status cells, the infra drill, and a release that is 206 commits overdue.

## For the next session

**This was the last buildable row in `docs/backlog.md`.** Everything else needs an account, a
payment method, a lawyer, recruited participants, or a decision. The next session should re-verify
that against the backlog rather than trusting this sentence — `docs/epics/HANDOVER.md` was wrong
about the next epic for two days once, which is why it says so at the top.

`pnpm dead-code` is now a gate. If you add an export nothing else names, it fails — delete it, drop
the keyword, or put it in `ALLOWED` with a reason somebody could disagree with. `ALLOWED` is empty
today and that is worth keeping true.
