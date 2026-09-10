# Customer discovery interviews

> **EPIC-005 is cut** (Soroush's decision, 2026-09-10). These interviews gate nothing. Stage 1 does
> not wait on them, and no epic may be blocked on them; the prototypes in `docs/design/` and
> `docs/roadmap.md` are the spec, and the per-milestone kill criteria in `docs/roadmap.md` are the
> feedback mechanism before Stage 2. The two survey responses that did arrive are in `survey/`,
> marked n=2 and not actionable.
>
> The rest of this page is kept as the **format**, so that reopening the epic is a decision about
> whether to run interviews and not also a decision about how to write them up.

Ten of these were, until the cut, a Stage 0 exit condition: `docs/backlog.md`'s stage rule is
literal — "Nothing in a later stage starts until the stage before has a report for every epic" — and
EPIC-005 (10 interviews with ICP engineers, 5 written use cases, pricing check, activation
definition) was a Stage 0 epic.

ICP, from `CLAUDE.md`: an AI engineer at a company of 10–500 people who owns a production prompt.
Screen for that before booking the call, not during it.

## Process

1. Copy `TEMPLATE.md` to `<company-or-handle>.md` in this directory, one file per interview.
2. Fill it in during or immediately after the call — not from memory a day later.
3. Quote the interviewee directly wherever their own words matter more than a summary,
   especially for "the pricing reaction" and "their definition of working."
4. Ten files here is EPIC-005's own acceptance bar for the interview count; the epic also needs 5
   written use cases, a pricing check, and an activation definition synthesised across all ten —
   that synthesis is the advisor's job once the interviews exist, not a per-interview field.

## What these are for

Not a survey to aggregate — a check against the ICP and the pricing/positioning bets already made
in `docs/decisions/` and `docs/roadmap.md`. A pattern across even three or four of these ("nobody
tracks prompt spend separately," "the last breakage was a silent model version change," "working
means passing the eval suite we already don't trust") is worth flagging to the advisor before all
ten are done, not held until the count is reached.
