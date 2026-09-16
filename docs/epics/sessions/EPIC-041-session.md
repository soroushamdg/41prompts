<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# EPIC-041 session — the Versions page

Date: 2026-09-16 · Branch `epic/041-versions-page` · merged into local `main`

## The prompt

A session started by hand, not by `run-next-epic.sh`. The instruction was to read `CLAUDE.md`,
`docs/PROCESS.md`, `docs/AUTONOMOUS.md`, `docs/epics/CURRENT.md`, `docs/backlog.md` and
`docs/decisions/AUTONOMOUS.md` in that order, then work out where the project actually is from git
and the filesystem rather than from any of them, then pick up the next epic from the backlog and
build it through `AUTONOMOUS.md`'s loop.

## Where the project actually was

`git log` and `ls docs/epics/reports/` agreed with `docs/epics/HANDOVER.md` for once: EPIC-040 merged
at `1a63b9a`, Stage 4 in progress, **EPIC-041 next and with no epic file**. `origin/main` three
commits behind local `main`.

`docs/epics/RELEASE-DUE.md` exists and is stale — generated at `f3fa8a2`, which is now five commits
back. It is a runner stop (`run-epics.sh` writes it after three epics), and Soroush asked for the next
epic directly, so it was not treated as a blocker. It is raised at the end of the session instead.

## The plan, in one paragraph

Write the epic file in the advisor's chair (the route EPIC-040 took the same day), then: a snapshot
**reader** in `packages/core`; `applySnapshot` and a `comparison` column in `packages/db`; three
server actions and a pure view model in `apps/web`; the page; the CSS; the e2e; the drive.
`docs/epics/plan-EPIC-041.md` has the whole of it, written before any code.

## Decisions, and why

Five went into `docs/decisions/AUTONOMOUS.md`. The three that changed the shape of the work:

**Where an A/B shows its answer.** Not a third results screen. Two ordinary runs sharing a
`comparison` id, and the version list's pass-rate column is the answer. It is cheaper, it reuses two
surfaces that already exist, and — the argument that actually decided it — it keeps working for two
versions compared weeks apart rather than only for a pair run together. What it gives up is a
side-by-side of both runs' per-check results, and the epic file says so rather than leaving it to be
discovered.

**Restore pins the open draft before it applies anything.** The roadmap's Review line is "restore
never deletes", and read narrowly that is free. The thing a naive restore destroys is the *open
draft*: it is unpinned, rule 2 rewrites it in place, and everything typed since the last run has no
other home. Pin first and the history only ever grows.

**The pass rate carries no colour.** The mockup paints it red at 81.7% and amber at 88.0%. Rule 10
reserves the three for pass, fail and drift, and a percentage is a measurement rather than a verdict
— amber would claim drift and red would claim a failure against a bar nobody set. Ink, with the
counts beside it.

## What took longer than expected, and what it bought

**The drive, twice over, and both times it was worth it.**

Two of its assertions failed on the first real run. Both were mine being wrong: they looked for an
`expected` blok's words in compiled text, where by design those words can never appear. Chasing *why*
they were wrong found a real defect in EPIC-040 — deduping versions on `compiledHash` makes a change
to the **check set** invisible, so restore would drop the blok and A/B would run with fewer checks
than the prompt has. `snapshot_hash` is the fix, and the regression test was run against the old rule
first to prove it catches it. **No unit test in either package could have seen this**: each package
was self-consistent and the defect lived at the seam.

Then the "dark theme" screenshot turned out to be a mid-transition blend — a light page background
with text that read as a contrast failure that does not exist. The drive now sets the theme cookie
and asserts the ground is actually dark before believing the picture.

Then an old `next start` survived a kill and served a wiped `.next`, and the page came back unstyled.
Caught by the drive's own "the built app is styled" check — the check that exists because of the
twenty-epic outage, earning its place again.

**A flaky `pnpm e2e` that had a mechanism.** `activation.spec.ts` failed once and it would have been
easy to call environmental. It was not: specs that trigger runs without a worker leave `run-suite`
jobs on the queue, their `suite_runs` rows are then cascaded away by `deleteTestUser`, and the next
run's first worker-starting spec — `activation`, alphabetically first — drains that backlog inside
its own 60-second budget. Three observations agreed. `apps/web/e2e/global-setup.ts` now removes jobs
pointing at nothing before anything starts; it removed 12 on its first run.

**A smaller one, found by writing a test rather than running it.** `bloks.id` is a global primary key,
so a snapshot naming another prompt's blok cannot be applied. Refusing the whole restore with a named
error beats the two alternatives, both of which lie: minting a fresh id breaks the identity `diff()`
depends on, and skipping the blok produces a prompt the person never had.

## Verification, tail

```
pnpm test        8 checked, 8 passed
pnpm typecheck   8 checked, 8 passed
pnpm lint        11 checked, 11 passed
pnpm e2e         219 passed, 4 skipped (Linux-only visual baselines)

node scripts/gate-run.mjs   →  16 step(s), all passed, 8m26s, on 0fe43fe
node scripts/drive-epic-041.mjs  →  DRIVE PASSED — every check
```

## Open questions

In the report, §11, five of them. The two most likely to matter: whether both sides of the compared
pair should be ink-inverted in the history list, and that pressing Restore (or A/B) silently pins the
open draft, which changes what the next save does without the page saying so.

Two items are carried forward untouched and both are EPIC-040's: a version that fails to record is
still a silent gap, and nothing prunes history.

## For the next session

**A release is overdue and `RELEASE-DUE.md` is stale.** It was generated at `f3fa8a2`; local `main`
is now several commits past that and `origin/main` is behind. Regenerating it is
`node scripts/release-due.mjs`; cutting it is Soroush's, and it starts with a push he has to make.

**Stage 4 has two rows left**: EPIC-043 (BYO-key threat model, and it must come before EPIC-042
stores a key) and EPIC-042 (three providers). Neither has an epic file.
