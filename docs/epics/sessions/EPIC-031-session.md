<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# Session · EPIC-031 · worker: run engine, Anthropic

Date: 2026-09-14 · Branches `epic/031-run-retention`, `epic/031-run-engine`

## Prompt sent

Plan first and stop; then four rulings answering Q1–Q4, plus four given before the questions were
restated — reserve and reconcile, degrade is out, keep the 50 of 200, build the overdue count. Then
"merge #86 and finish EPIC-031".

## The reporting mistake worth recording

Soroush could not see Q1–Q4, because I had written them into a PR body and then referred to them by
number in chat. **He reads the messages, not the branch.** Three rulings arrived anyway on the parts
he could see, and the questions had to be restated in full before the rest could be answered.

Worth keeping because it is a failure of the same family as everything else this week: a thing that
exists, is correct, and is not where the person who needs it will look. The plan file was not the
deliverable — the message was.

## What the epic file carries that the report does not

Soroush's instruction: *"write that reasoning into the epic file, not just the report — it is the
kind of decision the next person will be tempted to simplify."* So `EPIC-031-run-engine.md` leads
with `purge_after` at insert and the mechanism that makes the alternative wrong, and keeps Q2's
sentence verbatim because it is the argument rather than a summary of one:

> A queue that never drains is an outage that looks like patience.

That is a different standard from "the report explains it", and it is the right one. A report is read
once, by the person who asked for it. An epic file is read by whoever picks the work up.

## The test I got wrong, and why it was instructive

The cap test set a budget of two reservations, ran ten inputs, and expected it to stop early. It did
not — **because the release works.** `spentCents` grows by the actual cost of each call, not by the
reservation, so ten one-cent calls fit inside two thirty-three-cent reservations with room to spare.

My first instinct was that the cap was broken. It was the test's arithmetic, and the arithmetic is
the feature: reserve the worst case, release the overshoot, so a user is charged what the call cost
rather than what it might have. The reasoning is now in the test, because the surprise is the thing
worth documenting.

## Decisions inside the epic's latitude

- **The release is a separate statement from the reservation.** The reservation must be atomic with
  its cap check; the release must not be, because holding a row lock across a provider call is how
  one slow model blocks every other run for the same owner.
- **A failed call releases the whole reservation.** A provider outage must not cost somebody their
  month's budget.
- **The release is clamped at zero**, so a reconciliation bug costs a user headroom rather than
  silently minting budget.
- **The cache key sorts its parameter keys**, so a re-run does not miss the cache because somebody
  reordered a literal.
- **`executeRunSet` is sequential.** Parallel calls would make the reservation race itself.
- **The purge deletes the row, not just the payload.** A surviving skeleton still records that this
  person ran this prompt that day.

## What took longer than expected

Not the engine. The time went on getting the reservation arithmetic right in a test, and on the
retention half's fixtures — `users.name` is not-null and the first fixture omitted it, which is the
kind of thing that costs two minutes and is invisible in a report.

## Verification

```
test        8 checked, 8 passed     (24 new worker tests, 2 new web tests)
typecheck   8 checked, 8 passed
lint        11 checked, 11 passed
e2e         178 passed, 4 skipped, 0 failed
compliance  all OK
```

## Open questions

Report §8: the real Anthropic call site is unexercised by CI on purpose and the first real call is
worth scheduling; concurrency is one and raising it changes EPIC-004's table; and `estimateTokens` is
four characters per token, which is wrong for code and non-Latin scripts in a way that costs headroom
rather than money.
