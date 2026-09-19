<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# EPIC-055 — session log

**Date:** 2026-09-17. **Branch:** `epic/055-delivery-ui`. **Merged into local `main`** — not pushed.

**Prompt:** `prompt_continue` at the repository root — read `CLAUDE.md`, `docs/PROCESS.md`,
`docs/AUTONOMOUS.md`, `docs/epics/CURRENT.md`, `docs/backlog.md` and
`docs/decisions/AUTONOMOUS.md`, work out where the project is from git rather than from any of
them, then pick up the next epic and build it to Definition of Done.

---

## Where the project actually was

`docs/epics/CURRENT.md` still held EPIC-052. `git log` and `ls docs/epics/reports/` agreed it was
finished and merged (`53fcec5`, plus the `052a` follow-up). `docs/backlog.md` and
`docs/epics/HANDOVER.md` both named **EPIC-055** as next, with both dependencies done, and
**`▣ GATE 5` immediately after it as a full stop**.

Two runner artifacts were present and neither applies to a session a person starts by hand:
a `STOP` file dated 2026-09-14 (gitignored; `HANDOVER.md`'s own Housekeeping section says it does not
affect a hand-started session) and a stale `docs/epics/RELEASE-DUE.md` generated at `f3fa8a2`, well
behind local `main`.

EPIC-055 had no epic file, as EPIC-040 through EPIC-052 did not. Written in the advisor's chair on
that precedent, from `docs/roadmap.md`'s Goal/Tasks/Tests/Review.

## Plan summary

`docs/epics/plan-EPIC-055.md`, written before any code. Five surfaces in dependency order — `db`
(revoke, rotate), `lib` (`previewPublish`, the generated file), `ui` (three stylesheets), `app` (six
routes), e2e — then the correction to `binary-files.mjs`, then the drive. Eight commits planned;
seven happened, because the `ui` and `app` steps merged into one.

The plan's "what could go wrong, named in advance" listed four things. **One of them happened**:
"splitting `publishVersion` changes behaviour by accident", which the 24 existing publish tests were
named as the control for. They passed unmodified.

## Decisions and why

Ten rulings in the epic file, all logged to `docs/decisions/AUTONOMOUS.md` before implementation, and
an eleventh taken mid-implementation.

**Ruling 11 is the one that needs Soroush.** `docs/design/README.md` says cost deltas use neutral ink;
`packages/core`'s `publish/gate.ts` gives a moved cost the `drift` verdict, whose colour is amber,
with its own written argument. Flatly contradictory. I followed core and said so in the report rather
than settling it quietly — and I **corrected acceptance criterion C17**, which as first written
contradicted shipped code. Correcting a criterion I wrote, in the open, seemed better than building
against it or silently dropping it.

The other decision worth restating: **the apps-resolving table is not built and the page says why in
words.** An empty table is a claim — "no apps are calling this" — and GATE 5's demand measure is that
number.

## What took longer than expected

**The last 20% took most of the session, and all of it was real.** The pages themselves went in
cleanly: `previewPublish`, the three stylesheets and six routes were typechecking inside the first
third. Then:

- **Nine red results.** Four were the product and five were my own test code. The ratio is in the
  report §7 because it is the useful part: `HANDOVER.md` lesson 21 — read the assertion before
  reading the code — applied four times out of five.
- **The generated-file defect (§6.2)** cost the most and was worth it. Finding it meant reading the
  drive's *output* against the drive's own *label* and noticing they disagreed. The label was a
  string I had written; it claimed a signature nothing had checked.
- **Three `gates.mjs ci` runs at ~9m30s each.** The first was red on `binary-files` — my own NUL
  byte. The second failed at setup on a full Docker VM disk. The third was green.

## The NUL byte, which is the thing to carry forward

Three instances in one session, and they are one mechanism:

1. **Two committed documents** (EPIC-052's report and session log) carried one each, in the sentence
   about lesson 20. Found by scanning every tracked file by hand, before the epic started.
2. **The gate that exists for this** was pointed at `packages/` and `apps/` only, and when widened,
   still missed one of the two — it sniffed git's 8000-byte window and that NUL is at 12,411. `git
   diff` renders such a file perfectly; `grep` silently finds nothing in it. `grep -c '^#'` returned
   **0** for a report with nineteen headings.
3. **My own test file** — the one that fixes all of this — contained one. `pnpm binary-files` had
   been run *before that file existed* and never again, so it reported "926 checked" over a set that
   did not include it. Only `gates.mjs ci`, which clones a commit, found it.

(3) is `PROCESS.md`'s "Local green is not CI green" failure 2, verbatim, arriving in the session that
was fixing failure-mode 19. It is recorded in the test's own header.

**My first scan was also wrong**, and that is instance zero: `grep -q $'\x00'` is an empty pattern in
the shell, so it matched every tracked file and reported the whole repository as binary. Lesson 8 —
an instrument that cannot fire reads exactly like one that found nothing, and here it read as one
that found everything.

## Verification tail

```
node scripts/gate-run.mjs   →  gates.mjs ci on b2142dd7
  16 step(s), all passed, 9m33s

pnpm test        8 checked, 8 passed
pnpm typecheck   8 checked, 8 passed
pnpm lint       11 checked, 11 passed
pnpm e2e       260 passed, 4 skipped

npx tsx scripts/drive-epic-055.mts
  22 of 22 checks passed.
```

One environment event, named so it is not read as a result: the second CI run failed at *setup*
with "the throwaway database would not start" — Docker Desktop's VM disk full while the host had
18 GB free. 68 dangling volumes pruned (3.485 GB) after checking that all three in-use volumes were
attached to running containers, including another project's. `docker volume prune` without `-a`.

## Open questions

All four are in the report §10 and all are Soroush's:

1. **Ruling 11** changes one line of `docs/design/README.md`.
2. **`drive-epic-051.mts` and `drive-epic-052.mts` still mint keys directly.** EPIC-052's handover
   said both should stop once this tab shipped. I did not re-point them: they are committed evidence
   of their own epics and changing them means re-running two drives to prove they still work.
3. **An undeclared variable now appears in the generated file.** The alternative is Connect refusing
   to generate until every used name is declared. A product call.
4. **`packages/ui`'s `token-contract.test.ts`** names `0` as an allowed `border-radius` in its title
   and rejects it in its assertion. Somebody else's gate; I removed my redundant declaration instead.

## What is next

**`▣ GATE 5` — a full stop.** `docs/AUTONOMOUS.md`: a gate is Soroush's decision, recorded in
`docs/decisions/GATE-5.md`, and the epics behind it are not reachable by stepping around it. Stage 5a
is now complete: 050, 051, 052 and 055 all have reports.

Its criteria (`docs/roadmap.md`): *"Measured, 30 days after EPIC-055: number of distinct production
apps resolving from the CDN; number of paying or pilot customers asking for Python, CLI codegen, or
source access. Go to 5b: ≥5 apps and ≥2 explicit asks."*

**Neither number can be measured today**, and that is the honest state rather than a delay:

- **"Apps resolving from the CDN" needs a CDN**, which needs an R2 bucket, which is Soroush's step.
  EPIC-051 §4.1, EPIC-052 and this epic's ruling 2 all report it unbuilt for the same reason. The
  roadmap names a client ping as the wrong answer, so nothing here substitutes for it.
- **"30 days after EPIC-055" starts today**, and nothing is deployed — `origin/main` is 52 commits
  behind local `main`. The clock cannot start until Soroush pushes.

So GATE 5 is not merely undecided; it is **unmeasurable until a push and a bucket exist**. That is
worth saying plainly before anyone reads its `—` status cell as an oversight, and it is the same
shape as the GATE 3 note (`docs/epics/GATE-3-readiness.md`).
