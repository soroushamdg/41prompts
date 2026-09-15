# EPIC-031a: the first real Anthropic call
Stage: 3 · Depends on: EPIC-031 · Size: S

**Scoped 2026-09-14 and deferred the same day**, because it needed `ANTHROPIC_API_KEY` set by
Soroush. **He set it on staging on 2026-09-15, with a $5 balance, a $5 cap and no auto-recharge**, so
the deferral is lifted and this file is the plan for the event.

## Goal
Make the first call this project has ever made to a real model, deliberately, and write down what
happened — including the real cost in cents.

---

## Why this is an epic and not a line in another one

`EPIC-031`'s adapter sits behind an interface and **every test uses a fake**. That is the right
design and it leaves exactly one thing untested by construction: the `@ai-sdk/anthropic` call site
itself. The first time it runs for real, something will be wrong with a key, a header, a model id, a
token count or a response shape — and it should be a person doing that on purpose rather than
whoever is unlucky.

Three epics have since been built on top of it (EPIC-032, EPIC-033, EPIC-034) and **every run in
every test, screenshot and browser drive was answered by a fake**. This is where that stops.

---

## What was checked before spending anything, 2026-09-15

Four of the things this epic exists to catch are answerable by reading the installed packages, and
reading is free. Done first on that basis:

| risk | finding |
|---|---|
| `usage` field names — v4 was `promptTokens`, v5 is `inputTokens` | **Clear.** `ai@7.0.99` types `LanguageModelUsage.inputTokens`/`outputTokens`, which is what `anthropic.ts` reads. A mismatch would have silently fallen back to the four-chars-per-token estimate and nobody would have seen a wrong number, only a plausible one. |
| `response.body` — rule 6's raw payload | **Clear.** `GenerateTextResult.response` is `LanguageModelResponseMetadata`, which carries `body?: unknown`, populated for HTTP providers. |
| Both models priced | **Clear.** `claude-sonnet-5` (runs) and `claude-haiku-4-5-20251001` (judge) both have rows. |
| The key reaching the right process | **Open.** `providerFor()` runs in **`apps/worker`**, which takes environment through `env_file: .env` in `infra/docker-compose.staging.yml` — `ANTHROPIC_API_KEY` is not in its explicit `environment:` block. Confirm the *worker* container sees it, not only `web`. |

**What reading cannot answer**, and what the call is therefore for: whether the key works, what
`claude-sonnet-5` actually resolves to, whether the reservation reconciles against a real token
count, how long a call takes, and what one costs.

---

## Decisions

**1. Local first, then staging. Two stages, one checklist.**

The event is scoped as "one call from staging", and it stays that. But a call-site defect found on
staging costs a fix, a push, a CI run and a redeploy — and the Actions allowance is the reason
nothing is pushed at all (`CLAUDE.md`, "Nothing is pushed"). The same defect found locally costs a
minute.

So: **rehearse locally against the built app, then do it on staging and write that one down.** The
checklist is identical; only the second one is the record.

**2. The call goes through the product, not a script.** EPIC-032 built the Runs page. A script would
exercise `executeRun` and prove nothing about the path a person takes, which is now the whole point
of having built the other three epics.

**3. The verifier reads the database, not the page.** Six of the eight criteria are facts in a `runs`
row — stored payload, `purge_after`, latency, cost, hashes, the reconciled reservation — and reading
them off a screen is how a criterion gets ticked on an impression. `scripts/verify-first-call.mjs`
asserts them and prints the numbers.

**4. Nothing about the key is printed, ever.** Not into a log, a payload, an error, a report or this
file. `runs` already carries a test that no stored payload contains a key-shaped string; the verifier
checks the real payload too, which is the first time that test has had real data to run against.

**5. The second call is the same call.** Repeating it proves the content cache answers and calls
nobody, which is the property that makes runs affordable. It is one line of the checklist, not a
second event.

---

## The checklist

Run it twice — once locally, once on staging — and record the staging numbers.

- [ ] The **worker** process has the key. Not `web`. `providerFor()` announces `provider: anthropic`
      at startup; the absence of "no provider configured" in the worker log is the check.
- [ ] The key appears in **no log line**, no stored payload, and no error.
- [ ] A run through the Runs page reaches `done`, not `refused`.
- [ ] The **resolved model id** — what Anthropic says it used, from the stored payload — is recorded.
      `claude-sonnet-5` is an alias; this is the first time anyone will see what it resolves to, and
      it is the fact `CLAUDE.md` rule 7 is about.
- [ ] `usage` arrived in the shape `costCentsFor` expects, rather than falling back to the estimate.
      The verifier tells these apart by re-deriving the cost from the stored token counts.
- [ ] The reservation reconciled: `run_budgets.spentCents` moved by the **actual** cost, not the
      reserved worst case.
- [ ] The raw payload is stored and `purge_after` is stamped 365 days out (rule 6).
- [ ] `latencyMs` is plausible — hundreds to a few thousand milliseconds, not 0 and not 60,000.
- [ ] **The real cost in cents**, written into the report. The first number anybody has for what a
      run costs.
- [ ] A second identical run is answered by the cache: zero calls, zero spend.
- [ ] The judge, too: a `refuses_to_answer` check graded by a real `claude-haiku-4-5-20251001`, with
      its cost counted separately. EPIC-033 has never been run against a real model either.

## Out of scope

- A second provider (EPIC-042), a load test, and any change to the Runs page.
- Production. It is 66 commits behind and has none of this code.

## Verification

```
DATABASE_URL=postgres://41p:41p@127.0.0.1:55435/41p node scripts/verify-first-call.mjs
```

**Against staging it needs Soroush.** The script runs `SELECT`s and nothing else — it refuses any
statement that is not one — but reaching staging's database means either a tunnel or
`docker exec … psql`, and `CLAUDE.md` server-access rule 3 puts `docker exec` behind one command,
one yes, with a single standing exception for the magic-link token that this is not. So: he runs it,
or he approves the one command.

**The verifier was itself verified**, on 2026-09-15, before it had anything real to look at. Fed a
fake-shaped payload and an Anthropic-shaped one it labelled each correctly, verified only the real
one, re-derived the cost independently and matched it, and surfaced an alias resolving to a dated
id. Fed only fakes it **refuses and exits 1** rather than blessing them — which is the failure that
would matter, because three epics' worth of fake runs are sitting in every database this will be
pointed at.

## Notes for the implementer

**1. Staging cannot do this until Soroush pushes.** `origin/main` is 17 commits behind and has no
`apps/worker/src/runs/provider.ts`. The key is set and idle until then.

**2. The app's budget cap will not protect the balance.** It is $5 **per account**, and `spentCents`
has no reset job — so every fresh throwaway drive account gets its own $5. The Anthropic-side cap is
what bounds spend, which is why it was set.

**3. `result.response` is marked `@deprecated` in `ai@7` in favour of `finalStep.response`.** It
works today and `body` is on both. Worth a follow-up, not worth blocking the first call.
