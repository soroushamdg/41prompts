<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# EPIC-041: the Versions page — history, restore, A/B
Stage: 4 · Depends on: EPIC-040 · Size: S

**Written by Claude Code in the advisor's chair**, 2026-09-16, under `docs/PROCESS.md`'s amendment of
2026-09-15 and the precedent EPIC-040 set the same day. The Goal, Tasks, Tests and Review lines below
are `docs/roadmap.md`'s, unchanged; everything else is this file's reading of them.

## Goal

EPIC-040 made a version a real, frozen thing that every run points at, and **nothing renders any of
it**. This epic is the page where a person reads their own history, sees what one version changed,
puts an old one back without losing the one they were on, and runs two of them against the same
inputs to find out which is better.

## Scope

- **`/app/pr/[promptId]/versions`** — the Versions page. The mockup's two-column shape: the history
  on the left, the diff for the chosen pair on the right.
- **The list**: `Draft vN`, the note, when it was last written, and its pass rate — derived, from
  `passRateForVersions`, never a column.
- **The diff panel**: `diff(a, b)` from `packages/core`, rendered as added / removed / changed /
  moved in plain words, plus the compiled byte delta. The pair is in the URL, so a diff is a link
  somebody can send.
- **Restore**: put an older version's blok set back on the canvas, as a **new** version.
- **A/B**: run two versions against one input set, as two runs that know about each other.
- **A note on a version**: `prompt_versions.note` exists and nothing writes it. The list shows it and
  the page lets a person write one.

## Out of scope

- **Publishing, Live, and the Draft/Live pointer.** EPIC-050 and EPIC-051. Every version here is
  `Draft vN` because nothing in this product has ever been published (ADR-003).
- **Pruning history.** EPIC-040's report §11.3 raised it; deleting somebody's history is a product
  decision Soroush has not made. The page says how much it is showing and stops there.
- **The provider matrix and the heatmap.** EPIC-042.
- **A dedicated comparison results route.** See "The question this epic exists to answer well".
- **Changing how a version is minted.** EPIC-040's three rules are settled and confirmed by Soroush;
  this epic reads them and adds exactly one new pin site (restore).

## The question this epic exists to answer well

**Where does an A/B comparison show its answer?**

The obvious build is a third page: pick two versions, run both, land on a side-by-side results
screen. It is also the most expensive thing in this epic and it duplicates two surfaces that already
exist — `runs/[runId]` renders results by check with attribution, and the version list already has to
show a pass rate per version.

The answer this epic takes:

1. **A/B triggers two ordinary runs**, each pinned to its version, over the same input set, sharing
   one `comparison` id. Nothing about executing them is special; the worker already runs a
   `suite_runs` row from its frozen `promptText` and its frozen checks, and a version supplies both.
2. **The answer is the version list.** Two rows, two pass rates, derived from those runs. That is
   what "which version is better on these inputs" looks like, and it keeps working for versions
   compared weeks apart rather than only for a pair run together.
3. **The link is legible where a run is legible.** The run history row and the run detail page say
   which version ran and name the run it was compared against, as a link.

What this gives up, stated so the report does not have to discover it: there is no single screen
showing both runs' per-check results next to each other. A person compares by opening two run pages.
If that turns out to be the thing people actually want, it is an epic, not a corner of this one.

## Acceptance criteria

- [ ] **`/app/pr/[promptId]/versions` exists**, is owner-scoped, and 404s — never 403s — for a prompt
      that is not yours. Verified by a test in `apps/web`.
- [ ] **The list shows every version as `Draft vN`** with its note, when it was written, and its pass
      rate. A version nothing has run says so in words rather than showing `0`. Verified by a unit
      test over the view model and by the e2e.
- [ ] **The diff panel renders `diff(a, b)`** — added, removed, changed, moved, and the compiled byte
      delta — for the pair in the URL, defaulting to the two newest versions. Verified by a view
      test with fixtures per change type.
- [ ] **A moved blok reads as moved**, in the rendered words, not as a removal and an addition. The
      roadmap's named test, carried up from `packages/core` to the surface that shows it.
- [ ] **A prompt with one version renders the page without a diff**, saying why in a sentence. A
      first-run state that throws is the defect this criterion exists to stop.
- [ ] **Restore puts the older blok set back on the canvas** — text, kind, order and hand edits —
      and the canvas shows it. Verified by the e2e: edit → save → restore → the canvas is what it
      was.
- [ ] **Restore never deletes** (the roadmap's Review line). Every earlier version still exists
      afterwards, **and the work that was open when restore was pressed is pinned first**, so it is
      still reachable as its own version. Verified by a test asserting the version count went up,
      never down, and that the pre-restore content is still in the history.
- [ ] **A/B creates two linked runs** over one input set, one per version, each pinned to its own
      version, sharing a `comparison` id. Verified by a test in `packages/db` and by the e2e.
- [ ] **A run that predates versions says something honest.** `suite_runs.version` is nullable and
      stays nullable (EPIC-040 §11.2); the run detail page must not imply a version it does not
      have. Verified by a view test.
- [ ] **Vocabulary**: `Draft vN`, `check`, `Undo`. Never "block", "assertion", "current", "latest",
      "unsaved", "override". `pnpm forbidden-words` passes.
- [ ] **Colour**: the pass rate is **not** colour-coded by threshold. Green, red and amber mean
      pass, fail and drift and nothing else (`CLAUDE.md` rule 10), and a percentage is not a verdict.
- [ ] **Keyboard and touch**: every control on the page is reachable by keyboard, 44px on touch, and
      the page has no horizontal overflow at 390px. Verified in the drive, screenshotted.
- [ ] **The page was driven by hand against the built app**, screenshots in
      `docs/epics/reports/screenshots/EPIC-041/`.
- [ ] `node scripts/gate-run.mjs` green on the commit before it merges.

## Verification

```
pnpm test                       # core/db/web unit tests
pnpm typecheck
pnpm lint
pnpm e2e                        # versions.spec.ts gains the page, restore and A/B
node scripts/gate-run.mjs       # CI parity, on the commit
node scripts/drive-epic-041.mjs # with the built app on :3000 — the script header has the commands
```

## Notes for the implementer

**1. Restore pins the open draft before it applies anything.** Otherwise restoring over an unrun
draft destroys it: the open `Draft vN` is rewritten in place by rule 2 and the content that was in it
has no other home. Pin, apply, record — the history then gains rows and loses none, which is what
"Restore never deletes" has to mean if it means anything.

**2. `packages/db` still does not import `@41prompts/core`** (EPIC-040's logged decision). A restore
writes bloks from a snapshot; it takes the snapshot's blok shape as a local interface, the way
`recordVersion` takes it as `unknown`. Parsing the JSONB into core's `SnapshotBlok` belongs in
`packages/core` — pure, zero-dependency — and the web app is where the two meet.

**3. A version's `compiledText` is the historical fact and an A/B run must send it**, not a
recompile. The snapshot's bloks supply the *checks*; `version.compiledText` supplies the text and
`version.compiledHash` the hash. Recompiling under whatever `COMPILER_VERSION` is current would make
"run v3" mean something other than what v3 was.

**4. Positions are 0-based in the snapshot and 1-based on screen.** `diff` reports ordinals; a person
counts from one.

**5. The pass rate comes from `passRateForVersions`**, which reads the **most recent finished run**
of each version. It returns `rate: null` when nothing was graded, and null is not zero — EPIC-030's
`not_graded` is a third outcome that is never folded into a fail.

**6. Nothing reloads.** Every write goes through a server action that revalidates and the client asks
the router to re-render (`PROCESS.md`, "A helper that normalises state"). No `location.reload()`, no
`waitForTimeout` in a test.

**7. Read `compiled-pane.spec.ts` and `runs-helpers.ts` before inventing a selector.** EPIC-040 lost
time guessing at one that was already written down.
