<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# No epic is in progress

Last updated 2026-09-21, at the end of EPIC-016c.

**`CLAUDE.md` says "the current epic is always `docs/epics/CURRENT.md`", so when there is no current
epic this file has to say that** rather than hold a stale copy of a finished one. A new session that
reads a completed epic here has been handed work that is already merged, and the only thing standing
between it and re-implementing that work is noticing the report.

**And a stale copy is not hypothetical.** This session began with this file naming EPIC-072b as
next, while the newest commit on `main` carried EPIC-016c — scoped, planned, unbuilt. The sequence
had to be read out of `git log` rather than out of the file whose whole job is to say it. Whoever
writes the next epic file: copy it here in the same commit.

## What just finished

**EPIC-016c — the rotator, as the mockup draws it.** Merged into local `main` as `144faff` on
2026-09-21, with `node scripts/gates.mjs ci` green on `9bdbfe3`.

- Epic file: `docs/epics/EPIC-016c-rotator-parity.md`
- Plan: `docs/epics/plan-EPIC-016c.md`
- Report: `docs/epics/reports/EPIC-016c-report.md` — **read §2 before writing another absence
  assertion anywhere on this site.** The rule-10 colour guard had been passing without checking
  anything, on four routes, since EPIC-016; §11 carries four open items.
- Session log: `docs/epics/sessions/EPIC-016c-session.md`
- Drive: `scripts/drive-epic-016c.mts`, 18/18, screenshots in
  `docs/epics/reports/screenshots/EPIC-016c/`

## What is next

**EPIC-072b — About and Careers, honest.** Its file already exists:
`docs/epics/EPIC-072b-about-and-careers.md`. Copy it here at step 1 of `docs/AUTONOMOUS.md`'s loop.

**Take the next row from `docs/epics/plan-mockup-parity.md`, not from `docs/backlog.md`.** The
mockup-parity programme is not in the backlog — `CLAUDE.md` reserves that file for Soroush — so the
plan is the sequence, and it records which of its rows are done. Rows 1 to 3 (EPIC-023, EPIC-024,
EPIC-016b) are finished, EPIC-016c is a follow-on to row 3, and EPIC-072b is row 4.

## State of the tree

`origin/main` is **30 commits behind** local `main`. Nothing is pushed and nothing deploys, so no
staging or production URL is evidence about any of this work — `CLAUDE.md`, "Nothing is pushed".
`docs/epics/RELEASE-DUE.md` has been waiting since 2026-09-20; cutting it is Soroush's.
