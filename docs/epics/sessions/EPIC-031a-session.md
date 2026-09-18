<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: Apache-2.0
-->

# Session · EPIC-031a · the first real Anthropic call

Date: 2026-09-16 · Branch `epic/031a-the-call`

## Prompt sent

Soroush set the key on staging, then pushed `main`. Both halves of what this row had been deferred
on since 2026-09-14. "Continue."

## What unblocked it, in order

1. **The push landed** and, against `PROCESS.md`'s own prediction, **CI went green** — both
   workflows, first push after 27 commits and a two-day gap. The previous run on `main` had failed.
   That is the strongest evidence yet that `gates.mjs ci` does what it was built for.
2. **Staging redeployed** to the same commit as local `main`, which also means migrations 0007–0009
   applied: the web entrypoint chains `db:migrate && next start`, so a failed migration would have
   left nothing serving.
3. **The worker had the key.** `"provider":"anthropic"` in its startup log. That was the epic file's
   one open item, and it was open for a real reason — the key reaches the worker through
   `env_file`, not through the compose `environment:` block, so it was worth checking rather than
   assuming.

## Reading before spending

Four of the things this epic exists to catch were answerable from the installed packages, and
reading is free: the `usage` field names match, both models are priced, and `response.body` is on
the type. Three of the four held. **The fourth did not, and the type was no help** — `body` is
declared optional and came back undefined. §4 of the report.

## The finding

`result.response?.body` was undefined, so the adapter stored the SDK's normalised view and rule 6's
"raw provider payload" was not raw. **The tell was the token counts**: `inputTokens` camelCase,
where Anthropic's own body is `input_tokens`. That is a one-line observation that no amount of
reasoning about the SDK would have produced — it came from reading the row the call actually wrote.

The expensive half is that **the resolved model id was never captured**, so a call that cost real
money still cannot say which model produced it. That is exactly what rule 7 exists to make
answerable, and it was silently unanswerable.

## My mistake, and it cost a second call

The drive deleted its test user as its last act. `runs.owner` cascades from `users`, so the cleanup
**destroyed the evidence the epic exists to collect** — payload, tokens, latency, `purge_after`.
Screenshots survived; the row did not.

The general form is worth keeping: **a cleanup that runs unconditionally at the end will eventually
delete the thing the run was for.** Verify, then clean up. The drive now does, with the reason in
the code.

A smaller one, same session: the cleanup SQL lost its quotes through `psql -c` inside `sh -c` inside
`ssh`, and Postgres answered `column "claude" does not exist`. Piping over stdin is the shape
`PROCESS.md` documents, and the reason is this exact failure.

And one of my own making earlier: regex surgery on `verify-first-call.mjs` wiped its preamble. I
restored it from git and made one careful edit instead of three careless ones. Worth recording
because the instinct to keep patching was the wrong one.

## Decisions inside the epic's latitude

- **Drive EPIC-034's example rather than build a fixture.** It is the shortest honest path to a real
  call, and because it contradicts itself it asks a question no fake can answer: does a real model
  do what the prompt says? It did what the *last* blok said.
- **Fix the adapter here rather than defer it.** The epic's own checklist has "the resolved model id
  is recorded" as a criterion, and it failed. Fixing the thing the criterion names is the epic, not
  scope creep.
- **Do not pretend to have the body.** The fallback labels itself `normalised: true`. Rule 6's gap
  is now legible; whether the rule or the adapter should move is Soroush's, and the report asks.

## Verification

```
node scripts/drive-epic-031a.mjs --verify     # 8 of 9 database checks passed
node scripts/gates.mjs ci                     # on the adapter fix
```

Three criteria remain unticked and the report says which and why. All three need a push first.

## Open questions

Report §7. The first one is whether a normalised view satisfies rule 6, because the privacy page
describes that retention to users.
