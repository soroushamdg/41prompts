# Discovery survey — n=2, not actionable

Date: 2026-09-10 · Raw export: `responses.csv` (17 columns, 2 rows, verbatim)

**Two responses. Nothing here is evidence.** This page exists so the two answers are in the
repository rather than in an inbox, and so that nobody later mistakes a screenshot of one of them
for a finding. Two responses cannot separate a pattern from a coincidence, and neither answer is
treated as input to any epic.

EPIC-005 (ten ICP interviews) is **cut**, not deferred, as of 2026-09-10. This survey is not a
substitute for it and is not being counted toward it. The substitute named in `docs/roadmap.md` is
the milestone kill criteria measured against the live funnel.

## Who answered

| | R1 | R2 |
|---|---|---|
| Owns a production prompt today | Yes | "I did previously" |
| Company size | 51–200 | 51–200 |
| Before a prompt change ships | "Other" — an automated suite, plus manual review of the cases the change targets and cases it might disturb | "Someone eyeballs the output" |
| Prompt-change breakages in 3 months | 0 | 2–5 |
| How they found out | n/a | "Output quality dropped, and we received feedback from users or QA teams running regression tests" |
| Pays for anything in this area | Nothing | Nothing |
| Open to a 30-minute call | no answer | no answer |

Both are inside the ICP's stated company-size band (10–500). Only R1 is inside the ICP as written —
"owns at least one prompt running in production". R2 answered "I did previously", which is a
different person with a different problem.

## What the two answers say, held loosely

- **Both pay nothing today.** The ICP as written in `CLAUDE.md` and `docs/roadmap.md` says the ICP
  "already pay for something (LangSmith, Braintrust, or nothing but their own time)". Two people is
  not a reason to change that sentence, and it is not a reason to keep it either.
- **The two pre-ship processes are the two ends of the range the product assumes**: one has a suite
  and reasons about blast radius; one looks at the output. The product is aimed between them.
- **R2's detection path was users and QA, not a metric.** That is the shape EPIC-012a's findings and
  Stage 3's checks are aimed at. One data point.
- **R1 reports zero breakages in three months** while running a suite. If that held at scale it
  would be an argument against the wedge. At n=1 it is an anecdote about someone with good habits.

## What this is not

- Not a pattern. Two responses, no recruitment record, unknown response rate, self-selected.
- Not a pricing signal. Nobody was shown a price.
- Not an activation definition. EPIC-034 still has no definition of "activated" from research; that
  gap moved with the EPIC-005 cut and is recorded in `docs/roadmap.md`.
- Not a contact list. Neither respondent left an email, so nothing personal is committed here. The
  ids in `responses.csv` are the survey tool's own response and network identifiers.

## If this is ever picked up again

Ten of these, or ten interviews, would be a research epic with a report — not an addendum to this
file. Adding a third and fourth response to `responses.csv` without re-reading this page is how a
sample of two becomes a quoted statistic.
