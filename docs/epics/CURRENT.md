<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# No epic is in progress

Last updated 2026-09-21, at the end of EPIC-016b.

**`CLAUDE.md` says "the current epic is always `docs/epics/CURRENT.md`", so when there is no current
epic this file has to say that** rather than hold a stale copy of a finished one. A new session that
reads a completed epic here has been handed work that is already merged, and the only thing standing
between it and re-implementing that work is noticing the report.

## What just finished

**EPIC-016b — the home page, in full.** Merged into local `main` as `98c69f5` on 2026-09-21, with
`node scripts/gates.mjs ci` green on `2378347`, the commit before the merge.

- Epic file: `docs/epics/EPIC-016b-home-page-full.md`
- Plan: `docs/epics/plan-EPIC-016b.md`
- Report: `docs/epics/reports/EPIC-016b-report.md` — §8 carries four open items, two of which are
  decisions Soroush may want to reverse, and both are one line
- Session log: `docs/epics/sessions/EPIC-016b-session.md`

## What is next

**EPIC-072b — About and Careers, honest.** Its file already exists:
`docs/epics/EPIC-072b-about-and-careers.md`. Copy it here at step 1 of `docs/AUTONOMOUS.md`'s loop.

**Take the next row from `docs/epics/plan-mockup-parity.md`, not from `docs/backlog.md`.** The
mockup-parity programme is not in the backlog — `CLAUDE.md` reserves that file for Soroush — so the
plan is the sequence, and it now records which of its rows are done. Rows 1 to 3 (EPIC-023,
EPIC-024, EPIC-016b) are finished; EPIC-072b is row 4.

## State of the tree

`origin/main` is **19 commits behind** local `main`. Nothing is pushed and nothing deploys, so no
staging or production URL is evidence about any of this work — `CLAUDE.md`, "Nothing is pushed".
