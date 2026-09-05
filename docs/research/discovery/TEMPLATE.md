# Discovery interview: <company / handle>

Date: YYYY-MM-DD · Interviewer: · Source (how they were found):

## Company size

Headcount, funding stage or revenue band if offered, whether the team building with prompts is
the whole company or one team inside a larger one.

## Role

Title, whether they personally write/edit the prompt in production or review someone else's,
how long they've held this kind of responsibility.

## Current tooling

What they use today for the prompt itself (a string in code, a config file, a vendor's own
console, a homegrown internal tool) and for anything adjacent (evals, logging, versioning). Name
every tool, not just the category.

## Current spend

Dollars per month on model API calls, on any eval/observability tooling, on anything they'd
plausibly bucket under "prompt tooling" today — even if the honest answer is "we don't track that
separately" or "$0, this is free-tier".

## The last prompt change

Walk through one real, recent edit end to end: what triggered it, who made it, how they knew it
was safe to ship, how long it took, what would have told them if it broke something.

## The last breakage

A real production incident where a prompt was the cause or a suspect — regression after an edit,
a model version change that silently altered behaviour, a prompt injection, an output format the
downstream code choked on. What caught it (a user complaint, a metric, nothing until much later),
what the fix was, what changed afterward.

## The pricing reaction

Show or describe the actual pricing page. Record the unfiltered first reaction, then the
specific number they said felt fair, then whatever they said would have to be true for them to
pay it (a specific feature, a specific integration, a trust threshold).

## Their definition of "working"

In their own words, not ours: what does it mean for a prompt to be "good" or "done" for them?
What would they check before feeling confident shipping an edit, if they had unlimited time?

## Other notes

Anything said unprompted that doesn't fit a field above — often the most useful part.
