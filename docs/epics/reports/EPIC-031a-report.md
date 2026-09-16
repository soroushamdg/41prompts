<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# EPIC-031a report — the first real Anthropic call

Date: 2026-09-16 · Branch `epic/031a-the-call`

**It happened.** On 2026-09-16 this project called a real model for the first time, from deployed
staging, through its own Runs page. Two calls, `$0.02`, `claude-sonnet-5`.

---

## 1. What the model actually said, and why it matters

The example prompt contradicts itself on purpose: one blok forbids the word "sorry", and the last
one tells the model to open every reply with an apology. A real model, asked to do both:

> **I'm sorry for the trouble.** Thanks for letting us know about this — an incorrect VAT number on
> an invoice is definitely something we want to fix quickly…

**It obeyed the nearest instruction and broke the stated rule.** The run came back
`This prompt is not verified: something failed`, the failure was attributed to the blok that owns
the rule, and the model's own words were on screen with the offending region marked.

That is the product's entire claim, executed end to end with no fake anywhere in the path. It had
never been true before today.

## 2. The numbers nobody had

| | |
|---|---|
| cost of a 2-input run | **$0.02** (1 cent per call) |
| tokens, one call | 59 in, 607 out |
| latency | 3,765 ms and 8,384 ms |
| model asked for | `claude-sonnet-5` (pinned in `DEFAULT_RUN_MODEL`) |
| model resolved to | **still unknown — see §4** |

`$5` buys roughly 250 runs of this size.

## 3. The checklist

Read out of staging's database by `scripts/verify-first-call.mjs --staging`, under a
one-command approval.

- [x] The **worker** has the key. `docker logs` on the staging worker: `"provider":"anthropic"` at
      startup. This was the epic's one open item and it is closed.
- [x] The key appears in no log line and no stored payload. Asserted against real provider data for
      the first time, rather than against a fake.
- [x] A run through the Runs page reaches `done`, not `refused`.
- [x] `usage` arrived from the provider rather than falling back to our four-chars-per-token
      estimate — 59 in, 607 out, and the stored cost re-derives from the price table exactly.
- [x] The reservation reconciled: spend moved by the actual cost (2c of a 500c cap), not the
      reserved worst case.
- [x] The raw payload is stored and `purge_after` is stamped 365 days out.
- [x] `latencyMs` is plausible.
- [x] **The real cost in cents.** §2.
- [ ] **The resolved model id.** §4 — this failed, and it is the most interesting failure.
- [ ] A second identical run answered by the cache at zero. Not driven: the cleanup removes the user
      between runs, so a repeat needs the same account. Cheap to add; not done.
- [ ] The judge against a real `claude-haiku-4-5-20251001`. Not driven — the example has no
      `refuses_to_answer` blok, so no judge call was made. EPIC-033 has still never met a real model.

## 4. The finding: rule 6 is not being honoured, and nothing could have told us but this

**`result.response?.body` came back undefined**, so `anthropic.ts` took its fallback branch and
stored `{ text, usage }`. `CLAUDE.md` rule 6 says *every run stores the raw provider payload*. What
was stored was the SDK's **normalised view**.

**The proof is in the row rather than in the reasoning**: the token counts arrived as
`inputTokens`/`outputTokens` — the SDK's camelCase — where Anthropic's own body uses `input_tokens`.

**Why no test caught it.** Every test uses a fake, and a fake writes whatever we tell it to write.
Three epics of green suites said nothing about the shape of a real response. This is exactly the
class of defect the epic's own file predicted: *"something will be wrong with a key, a header, a
model id, a token count or a response shape."* It was the response shape.

**Two consequences, and the second is the expensive one:**

1. Rule 6's promise — which the privacy page's 12-month retention row describes to users — is
   currently met by a normalised view, not by the provider's payload.
2. **The resolved model id was never captured.** `claude-sonnet-5` is an alias. The first real call
   cost money and still cannot answer "which model produced this verdict", which is precisely what
   rule 7 exists to make answerable.

**Fixed in `ca70def`, without pretending the body was obtained:** `modelId` is captured from the
response metadata, and the fallback labels itself `normalised: true` with a note, so the gap is
legible rather than silent. `verify-first-call.mjs` now reports which of the two was stored.

**Not yet proved.** The fix needs a push and a redeploy, and nothing is pushed. The criterion stays
unticked.

## 5. My mistake, and what it cost

The first version of the drive deleted its test user as its last act. `runs.owner` references
`users` with `onDelete: cascade`, so **the cleanup destroyed the payload, token counts, latency and
`purge_after` of the very call the epic exists to record.** The screenshots survived; the evidence
did not, and the call had to be paid for twice.

The drive now reads the row back **before** cleaning up, and the reasoning is in the code so the
ordering is not rediscovered.

A second, smaller one: the cleanup SQL was interpolated through `psql -c` inside `sh -c` inside
`ssh`, lost its quotes, and Postgres answered `column "claude" does not exist`. Piping over stdin —
the shape `docs/PROCESS.md` documents — means the SQL meets no shell at all.

## 6. Verification

```
ssh 41p-box docker logs <staging worker>        # "provider":"anthropic"
node scripts/drive-epic-031a.mjs --verify       # the drive, then the database checklist
```

The second runs `docker exec … psql` with `SELECT`s only, approved one command, one yes on
2026-09-16. The drive cleans up after itself at both ends under the standing permission.

## 7. Open questions for Soroush

1. **Does a normalised view satisfy rule 6?** §4. The fix captures the model id either way, but the
   rule says *raw provider payload* and we do not have one. Either the rule's wording should follow
   the reality, or the adapter needs to obtain the body another way (a `fetch` wrapper is the usual
   answer, and it is a bigger change than this epic).
2. **Three criteria are unticked** — the resolved id, the cached repeat, and a real judge call. All
   three are cheap and all three need a push first.
3. **`$0.02` per 2-input run** is the planning number now. A 200-input set is roughly `$2`, which the
   $5 cap will stop twice over — worth knowing before anyone demos a large set.
