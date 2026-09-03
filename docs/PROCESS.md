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
