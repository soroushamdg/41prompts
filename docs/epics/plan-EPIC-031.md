# Plan · EPIC-031 — worker: run engine, Anthropic

Written 2026-09-14, before any implementation, per `CLAUDE.md`. **Stopping here for review.**

Organised around the three things Soroush said he would read for. The budget section ends in options
rather than a choice, as asked.

---

## 1 · The 12-month retention closes a promise the privacy page already makes

### What the page says today

`apps/web/lib/site/legal.ts`, the retention table's fifth row:

| What | How long | Notes | Enforced by |
|---|---|---|---|
| Raw model responses from a run | **12 months — not built yet** | Running prompts against a model is not in the product yet (EPIC-031). When it ships, this row becomes real and this note goes | **—** |

EPIC-017 wrote it that way deliberately: stating "12 months" flat would have described a future
behaviour as a current one. **This epic is what makes it current**, and the same PR changes the
wording. That is `roadmap.md`'s own test for EPIC-017 — *"retention numbers match the code in 014,
031, 002"* — becoming real rather than aspirational.

### What changes, in the same PR

1. **A constant**, `RUN_PAYLOAD_RETENTION_DAYS = 365`, in `packages/db/src/constants.ts` beside the
   three that already live there. The page imports it, so the number on the page **cannot** be typed
   separately from the number the job enforces — the mechanism EPIC-017 already built.
2. **The row's text** loses "— not built yet" and its note, and becomes an ordinary row.
3. **The `Enforced by` cell stops being `—`** and names the file. `legal.test.ts` already walks every
   cited path and fails if the file does not exist, so a wrong citation fails the build.
4. **`legal.test.ts`'s "not built yet" test inverts.** It currently asserts the page *says* the row is
   not built. That test is correct today and becomes wrong the moment this ships — and it is exactly
   the shape `PROCESS.md`'s helper rule warns about, a test asserting the placeholder. It is replaced
   by one asserting the row states the enforced number, like the other three.

**Why 365 and not "12 months".** Months are not a unit a purge can use; the other three constants are
days and the job arithmetic is days. The page can say "12 months" in prose while the table says
365 days — or both can say 365. **Minor open question, Q4.**

---

## 2 · Rule 6, field by field — and where the purge actually runs

> *Every run stores the raw provider payload (purged after 12 months), prompt hash, input hash,
> model, params, latency, cost.*

### 2.1 How each of the seven is stored

One table, `runs`, one row per provider call. Shape and the reasoning for each column:

| rule 6 field | column | type | notes |
|---|---|---|---|
| raw provider payload | `payload` | `jsonb` | **exactly what the provider returned**, unedited. `jsonb` not `text` so a later question can be asked of it without reparsing every row. |
| | `purgeAfter` | `timestamp` | **stored, not computed at read time.** §2.2. |
| prompt hash | `promptHash` | `text` | `blokHash`-style content hash of the compiled text. Not the text: the prompt is already in `bloks`, and a second copy is a second thing to keep in step. |
| input hash | `inputHash` | `text` | hash of the input row. The input itself lives in the input set (EPIC-032). |
| model | `model` | `text` | the **resolved, pinned** model id, never an alias — `claude-sonnet-5`, not `claude-latest`. What was actually called, so a result is reproducible. |
| params | `params` | `jsonb` | temperature, max tokens, whatever was sent. Stored as sent, not as configured. |
| latency | `latencyMs` | `integer` | wall clock around the provider call only, not around the job. |
| cost | `costCents` | `integer` | computed from a dated price table; §2.3. Integer cents, the same unit `run_budgets` already uses. |
| — | `cacheKey` | `text`, indexed | `sha(compiled + input + model + params)`, the roadmap's key. |
| — | `owner`, `promptId`, `createdAt` | | attribution and ordering. |

**Keys are never stored and never logged.** `CLAUDE.md` and EPIC-004 decision 3. The adapter reads
the key from the environment at call time and it does not enter a row, a log line, or an error — the
report will show the `gitleaks`-style grep over the new code, and a test asserts the stored payload
contains no `sk-` prefixed string.

**The payload is the privacy-sensitive column**, because it can contain anything a model said about
whatever the user put in. That is what the 12-month clock is for, and why `purgeAfter` is a real
column rather than a policy someone remembers.

### 2.2 Where the purge *runs*, which is not where it is scheduled

Soroush's framing: *a purge job that exists and never fires is the EPIC-006d shape*. Taking that
seriously changes three things.

**It rides the existing sweep rather than taking a new cron entry.** `apps/worker/src/main.ts`
already schedules `purge-decompiles` and works it, and `purgeRunCounts` **already rides that same
job** — with the reason written in place: *"a second cron entry is a second thing that can silently
stop."* The 12-month purge joins it. One schedule, three sweeps, one place to check.

**It logs on every run, including zero.** The precedent is in the same file and says why:

> *"The count is logged on every run, including zero: the acceptance criterion for this job is that
> it is observed running, and a job that only speaks when it deletes something is indistinguishable
> from a job that is not scheduled."*

**And here is the part that is worse than the 30-day jobs, which is why it needs saying.** A 30-day
purge proves itself within a month: rows appear, rows go, somebody notices. **A 12-month purge
deletes nothing for a year.** For twelve months the only difference between a correct job and a job
whose `WHERE` clause never matches is a log line saying `0`. That is precisely EPIC-006d's shape —
machinery that looks like enforcement and is not — and "we scheduled it" is not evidence.

So the plan proposes three separate things, because no one of them is enough:

1. **A clock test** — the roadmap already asks for it. Insert rows with `purgeAfter` in the past and
   in the future, run the sweep, assert exactly the past ones went. This proves the *query*.
2. **A heartbeat on every sweep**, counted in the log line beside the other two, so "the job ran" is
   observable on day one rather than in a year.
3. **A monitored assertion that nothing is older than the window** — a cheap `SELECT count(*) WHERE
   purge_after < now()` logged each sweep, which is `0` when the job works and grows when it does
   not. **This is the one that would have caught EPIC-006d**: it does not ask whether the job is
   scheduled, it asks whether the outcome is true. **Open question Q1** — whether that number should
   page somebody or only be logged.

**`purgeAfter` is written at insert, not derived at read.** If the retention window later changes,
rows written under the old promise keep the promise they were written under. A `now() - interval`
query would retroactively re-date every existing row, which is the wrong direction for a promise.

### 2.3 Cost, and the dated price table

`costCents` is computed, not returned — providers bill on tokens. So: a committed table of prices per
model per million tokens, **with the date it was read and the URL it came from**, and the computation
is `usage × price`. The roadmap's review line asks for exactly this ("price table sourced and dated").

**A model absent from the table is not free.** The plan stores `costCents: null` and marks the run
`cost_unknown` rather than recording zero — a zero would silently spend nothing against a budget that
is supposed to stop spending. **This interacts with the cap**, §3.

---

## 3 · Budget caps — options, not a choice

EPIC-004 built the machinery and this epic is the first to spend real money against it:
`run_budgets` has `capCents` and `spentCents` per owner, `applyBudgetIncrement` is the pure rule, and
`incrementRunBudget` is the atomic conditional `UPDATE` that encodes it.

### 3.1 What is already decided, so the options are about the gap

- The cap is **per owner**, hard, and enforced by a single conditional SQL update — concurrency-safe
  already.
- The roadmap's test is *"cap blocks the 51st"*, so the cap **blocks** something. The question is
  what "blocks" means to the person who hit it.

### 3.2 The real difficulty: cost is known after the call, and the cap must act before

You cannot know what a call costs until it returns. So one of these has to be true:

- **Reserve an estimate, reconcile after.** Estimate from input tokens and max output tokens,
  increment by the estimate before calling, correct it after. Never overspends; over-reserves, so a
  user hits their cap slightly early.
- **Check before, increment actual after.** Simple and honest about cost; the cap can be exceeded by
  one call's worth, and by more if calls run concurrently.

**These are not equivalent and the choice is visible to users.** I have not picked. It also decides
what happens to the `cost_unknown` case in §2.3.

### 3.3 The three options for what happens at the cap

| | **Refuse** | **Queue** | **Degrade** |
|---|---|---|---|
| **What happens** | the run is rejected with a typed reason; nothing is called | the run is held until the budget resets or is raised | the run proceeds against a cheaper model, or on a sample of the inputs |
| **What the user sees** | an immediate, unambiguous "you have hit your cap" | "waiting for budget", possibly for a long time | results that look like results but are not the run they asked for |
| **For** | honest, simple, no surprise spend; matches "cap blocks the 51st" literally | nothing is lost; a raised cap resumes it | the user gets *something* |
| **Against** | work in progress is thrown away mid-run — 50 of 200 inputs done and then a wall | a queue that never drains is an outage that looks like patience; needs expiry, visibility, and a way to cancel | **produces results that silently mean something different.** A pass under a degraded run is not a pass |
| **Fits the product?** | yes | yes, with real UI work in EPIC-032 | poorly — the whole product is about knowing what your prompt does |

**A fourth thing to rule on regardless of which is chosen: what happens to a run already in flight.**
A run is many provider calls. If the cap is hit at input 50 of 200, the options are stop and keep the
50 (a partial run, which EPIC-030's schema can already express honestly — `total` is what ran), or
discard. **My reading is that keeping the 50 is clearly right** and it is the one place here I would
state a preference, because EPIC-030 already built a result shape that can say "50 of 200 ran" without
ambiguity, and throwing away paid-for work to make a cleaner story is worse for the user.

**Open questions Q2 (which of refuse / queue / degrade) and Q3 (reserve-and-reconcile, or
check-then-increment).**

---

## 4 · The rest of the roadmap's task list

| task | plan |
|---|---|
| pg-boss queue | a `run` queue beside the existing purge queues, same `withRequestId` correlation |
| Anthropic adapter via AI SDK | `ai` + `@ai-sdk/anthropic` in `apps/worker` only — a proprietary app, not a public package, so rule 11 is not in play. One-line reason in the PR per the DoD |
| cache by `sha(compiled + input + model + params)` | `cacheKey` column, unique per owner; a hit returns the stored result and **makes no call** |
| retries on 429/5xx | bounded, with backoff; a retry that succeeds is **one** run row and one cost, not two |
| per-key concurrency | a limit per owner so one user cannot saturate the worker |
| provider usage policy confirmed | read and linked in the report, as the roadmap asks |

**Does a cache hit count against the budget?** It costs nothing, so no — but that means re-running is
free and the number in front of the user stops matching what they ran. Stated here because it is the
kind of thing that is obvious until somebody disagrees. **Minor, folded into Q3.**

## 5 · Order of work

1. The `runs` table and its migration, with `purgeAfter` written at insert.
2. The purge sweep, riding the existing schedule, with the clock test and the heartbeat — **before**
   anything writes a payload, so retention is never retrofitted onto rows that predate it.
3. The price table and cost computation.
4. The adapter, behind an interface, with a mocked provider for every test.
5. The cache.
6. Budget enforcement, once Q2 and Q3 are ruled.
7. The privacy page and its tests, in this PR.

## 6 · Open questions

1. **Q1 · The overdue-rows number** — logged only, or monitored so somebody is told? It is the one
   signal that would have caught the EPIC-006d shape.
2. **Q2 · At the cap: refuse, queue, or degrade?** §3.3. I have not picked. I did state one
   preference, on the narrower in-flight question: keep the work already done.
3. **Q3 · Reserve-and-reconcile, or check-then-increment?** §3.2, plus what `cost_unknown` does and
   whether a cache hit counts.
4. **Q4 · "12 months" or "365 days"** on the privacy page, given the constant is days.

## 7 · Not planned

- **No browser drive.** This epic ships a worker, a table and a purge — no route, no component, no
  user-visible string except the privacy page line, which has its own tests. The report will say so
  in the same words EPIC-030's did, because an unexplained missing drive reads like a skipped one.
- No UI for runs; that is EPIC-032.
- No judge; that is EPIC-033.
- No provider other than Anthropic.
