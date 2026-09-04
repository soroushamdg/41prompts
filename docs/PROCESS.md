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
