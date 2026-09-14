# BLOCKER · EPIC-023

**Status: blocked before planning. Nothing was implemented and no plan file was written.**

## What

**EPIC-023 does not exist.** The instruction was "then EPIC-023 per `docs/roadmap.md` and
`docs/backlog.md`", and neither file contains it. Nor does anything else in the repository.

## Where it surfaced

Before planning, reading the two named files for the epic's goal, scope and acceptance criteria.

## Evidence

| check | result |
|---|---|
| `grep -rn "EPIC-023" .` (working tree, excluding `node_modules`) | no match |
| `git grep -n "EPIC-023" $(git rev-list --all)` (every commit on every branch) | no match |
| `git log --all --oneline \| grep 023` | no match |
| `ls docs/epics/EPIC-023*` | no such file |
| `docs/backlog.md` Stage 2 rows | EPIC-090, EPIC-020, EPIC-021a, EPIC-021b, EPIC-022 — no 023 |
| `docs/roadmap.md` Stage 2 sections | ends at "EPIC-022 Variables · S"; the next heading is Stage 3, EPIC-030 |
| `docs/epics/CURRENT.md` | "**EPIC-021b is the current epic.**" |

Stage 2's numbering runs 020, 021a, 021b, 022 and stops. Stage 3 opens at EPIC-030. **023 is not a
gap in the sequence that someone forgot to fill; it is past the end of the stage.**

## Which criterion it blocks

All of them — there are none to block. There is no goal, no scope, no out-of-scope list, no
acceptance criteria and no verification section, because there is no epic file. Under
`docs/PROCESS.md` the advisor writes `docs/epics/EPIC-xxx-name.md` and copies it to `CURRENT.md`
before Claude Code plans against it. That step has not happened for 023.

## Why this was not reinterpreted into the nearest plausible epic

`CLAUDE.md`: *"If an acceptance criterion is impossible or contradicts a rule here, write
`docs/epics/BLOCKER-EPIC-xxx.md` and stop. Do not reinterpret silently."*

There were three plausible re-readings and each one is a different piece of work, which is precisely
why guessing is the wrong move:

- **A typo for EPIC-021b**, the epic `CURRENT.md` actually names. It has a report
  (`docs/epics/reports/EPIC-021b-report.md`) but its backlog row still says `current` and it has no
  session file, so it is genuinely ambiguous whether it is finished.
- **A typo for EPIC-030**, the next epic in sequence, which would start Stage 3. `PROCESS.md`:
  *"Nothing in a later stage starts until the stage before has a report for every epic."* Stage 2
  cannot be declared closed from here — EPIC-021b's row says otherwise, and two Stage 2 rows
  (EPIC-021a, EPIC-022) read `built — awaiting the staging hand-drive`.
- **A genuinely new Stage 2 epic** the advisor has written but not committed.

## Options

1. **The advisor writes `docs/epics/EPIC-023-<name>.md`** and copies it to `CURRENT.md`, per
   `PROCESS.md` step 1. Then this session's step 3 runs as asked. *Recommended if 023 is real.*
2. **Name the intended epic instead** — if "023" was a slip for EPIC-021b or EPIC-030, say which,
   and for EPIC-030 also say whether Stage 2 is being declared closed (see the stage rule above) and
   what happens to EPIC-021b's `current` row.
3. **Close out Stage 2 first.** EPIC-021b has a report but no `docs/epics/sessions/EPIC-021b-session.md`
   and a `current` backlog row; EPIC-021a and EPIC-022 are `built — awaiting the staging hand-drive`,
   which this session's staging drive of #69 may be able to discharge. Tidying those is real work
   with a definite scope, unlike 023.
4. **Cut it.** If 023 was only a placeholder for "whatever is next", the backlog already answers that
   and no epic file is needed.

## What this session did instead

Step 1 was completed: PR #69 merged with all five gates green. Step 2 was **half** completed — the
deployed staging URL was driven in a browser signed out, and the signed-in half is blocked on a
separate thing (a `docker exec` to read the magic-link token, refused by the permission classifier).
See `docs/epics/sessions/2026-09-14-session.md` §2 for exactly what passed and what is still
unticked, and §4 for the R2 backlog row added under the same instruction.
