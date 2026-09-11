# EPIC-014 report: Capture and abuse control

Branch `epic/014-capture`. 2026-09-10.

**Status: done.** Permalinks with a 30-day purge, rate limits, an abuse check before any provider
call, a waitlist, and the carried perf defect decided with evidence. `pnpm test`, `pnpm typecheck`,
`pnpm lint`, `pnpm e2e`, `pnpm compliance` and `pnpm binary-files` clean.

Three things in here are decisions rather than implementations, and they are the first three sections.

---

## 1. The perf gate: measurement fixed, not a bar moved

The epic said decide it deliberately, make it robust or demote it, and **do not widen the bar**.

**I could not make it fail on a quiet machine** — 12 trials, exponent 1.16–1.30 against a 1.6 bar. So
rather than guess, I reproduced CI's *condition* instead of its workload: saturating all 8 cores with
busy loops and re-measuring the estimator.

**Under 2× oversubscription (16 busy loops):**

| runs per side | min | median | max | trials ≥ 1.6 |
|---|---|---|---|---|
| **5 (before)** | 0.432 | 1.355 | **1.968** | **4 / 15** |
| 15 | 0.308 | 1.298 | 1.703 | 2 / 15 |
| 30 | 1.149 | 1.205 | 1.371 | 0 / 15 |

**Under 4× oversubscription (32 busy loops), worse than CI is likely to be:**

| runs per side | min | median | max | trials ≥ 1.6 |
|---|---|---|---|---|
| 30 | 1.104 | 1.178 | 1.492 | 0 / 12 |
| 50 | 1.109 | 1.164 | 1.410 | 0 / 12 |

That is the CI failure reproduced — 1.968 where CI saw 1.74 — and it shows the **estimator** moved,
not the code.

### The decision, and why

**Make the measurement robust. Thirty samples. No bar changed.**

The estimator is already minimum-based, and **contention can only ever make a measurement slower,
never faster** — so the minimum converges on the true time from above, and a real regression, being
slow in every run, survives it. Five runs was too few, and specifically too few for the **large**
input: it does four times the work and is therefore about four times likelier to be descheduled
mid-run, so on a busy runner it can fail to get one clean measurement while the small input gets
several. More samples raise that probability monotonically, which is why the spread *collapses*
(0.432–1.968 → 1.104–1.492) rather than merely shifting.

**Why not demote it to a reported number.** The gate guards quadratic tag matching, which this
codebase actually had — `segment/README.md` records the forward-scan implementation sitting at
exponent 2.0. The absolute timing gates cannot see its return: quadratic at 100 KB is roughly 57 ms,
comfortably inside the 100 ms bar. A flaky gate guarding nothing should be demoted; a flaky gate
guarding something real should be measured properly.

### Applied to all four ratio gates, and the next flake caught

`segment.perf.test.ts` has two, `cluster.perf.test.ts` and `detect.perf.test.ts` one each. They share
the estimator and therefore the defect, and leaving three to flake later is the same mistake in slow
motion.

**The tag-matching gate was already failing intermittently and nobody had noticed**, because it had
not yet crossed its bar. It subtracts one growth exponent from another — four measurements, roughly
twice the noise — and measuring the two halves in separate windows let contention inside either
survive into the difference:

| | swing across three full-suite runs | bar |
|---|---|---|
| two exponents, separate windows | **−0.26 → +0.31** (range 0.57) | 0.5 |
| all four measurements round-robin | −0.08 → +0.13 (range 0.21) | 0.5 |

### Two things the work turned up

- **Run count should scale with how long one run takes.** Robustness is not about samples in the
  abstract, it is about how big a stolen scheduling slice is *relative to one run*. `segment`'s small
  input is 3.6 ms, where a 10 ms steal is a 280% error; `detect`'s is ~30 ms, where it is 33%. Thirty
  runs made `detect` take 7.8 s and blow vitest's 5 s default, so the coarse gates take ten. **Timeouts
  were raised explicitly — a timeout is harness plumbing, not a bar.**
- `perf/measure.ts` is not a test file, so `pattern-shape.test.ts` audits it, and it read
  `Math.log(a / b) / Math.log(c)` as a regex literal between two slashes. Split across two statements.

**Evidence: three consecutive green CI runs** — §8.

---

## 2. A limit the tests proved wrong, where the fix was the product

Two consecutive local runs of the web suite failed after the limiter was wired in: **31 decompiles
from one bucket against a 30/hour limit**, which also means CI would have failed.

The tempting move is to special-case the tests. The honest question is who actually pastes more than
thirty prompts in an hour, and the answer is **an evaluator paying real attention — exactly the ICP**.

What a decompile costs decides this. It is local CPU bounded by the 100 KB cap: no provider call, no
row written, nothing that costs money. What costs money is the *model* summariser, which has its own
per-caller budget in the worker; what costs storage is a permalink, limited separately at 20/hour.
Refusing the ICP to protect CPU we are not short of would be the funnel dying for nothing — and the
funnel is half of M1's kill criterion.

**Raised to 120 an hour**: two a minute sustained, past any human, still bounding a script.

---

## 3. EPIC-017 does not exist, and the copy stands alone

The epic lists EPIC-017 as a dependency; it has not been built, so there is no privacy policy to point
at. Per the epic's own note I did not block. The retention sentence says the whole thing in plain
words instead:

> A shared link works for 30 days, then it is deleted for good. Anyone with the link can delete it
> sooner — including you, from the page itself. No account, and we do not store who you are.

**EPIC-017 can later add a link. It must not need to add a *fact*** — the sentence has to have been
true on the day it shipped, and every clause in it is enforced by something in this branch: the window
by `DECOMPILE_RETENTION_DAYS` and the purge job, the removal by a button with no auth, the last clause
by `no-raw-ip.test.ts`.

**The gap to close in EPIC-017:** a privacy policy naming the sub-processors, and a link from this
sentence. Nothing here needs rewriting when it lands.

---

## 4. Design decisions worth arguing with

- **The permalink recomputes from the stored source** rather than caching HTML, so a core fix improves
  every link ever shared. A stored rendering would freeze whichever bugs existed on the day somebody
  pressed Share.
- **`source` is stored exactly as received, CRLF and all** — EPIC-013's carried finding. The offsets
  index the string the server got, so "tidying" line endings would move every range in every link.
- **Removal takes no account.** This is the path somebody uses on realising they pasted something they
  should not have; a sign-in between them and the delete button makes it useless exactly when it
  matters. The id is the capability — twelve hex digits, and the only way to reach it is to have it.
- **Unsubscribe has no confirmation step**, and the consequence is stated rather than hidden: anyone
  who knows an address can unsubscribe it. For a list whose only purpose is one email about an editor
  shipping, wrongful removal costs a notification and an un-leavable list costs patience. That trade
  holds only while the list does nothing else.
- **Turnstile fails open** when Cloudflare is unreachable. It is a dependency we do not control on a
  path whose failure mode is "a person cannot share a link", and the rate limit already bounds an
  unchecked caller. A hard failure would turn their outage into ours.
- **The abuse check is not a content filter**, and there is a test saying so: prompts that are rude,
  political, commercial, fictional or about self-harm all pass. That rule dies quietly — somebody adds
  a word to a list because one paste looked bad — so it is pinned.
- **The check runs before the provider call, not around it.** A guard that lets the request go and
  discards the answer has already paid for it. The test asserts it by making the provider **throw if
  reached**, since a spy checked afterwards would still have let a real call happen in production.
- **A missing IP salt degrades rather than fails**: a per-process random value with a warning on every
  start. Throwing would be an outage on a public page because an env variable is unset; hashing
  unsalted would be quietly enumerable (IPv4 is 2^32 — an unsalted digest is an inconvenience, not an
  anonymisation). This loses cross-restart accounting and leaks nothing.

---

## 5. The raw-IP criterion, answered precisely

The criterion is "a grep over the database schema and the logs finds no raw IP". **Run literally, that
grep finds one: `sessions.ip_address`.**

It is Better Auth's, created in EPIC-002, written only for a signed-in session, and unreachable from
this route — `/decompile` has no accounts (decision 9). It is real personal data with a real
justification: an authenticated person can see and delete their own sessions.

Saying where it is beats pretending it is not there, so `no-raw-ip.test.ts` states the precise claim
and enforces it structurally: the capture tables have no column that could hold an address, the only
value reaching `ip_hash` comes from `hashIdentity`, and no log line mentions the address.

---

## 6. Acceptance criteria

- [x] **Sharing produces `/d/<id>`; opening it in a clean browser renders the same bloks and findings.**
      `produces /d/<id> and opening it in a clean context shows the same bloks and findings` — a new
      browser context, no cookies or storage, comparing spans, blok count, finding count and the
      closing line.
- [x] **`noindex, nofollow` in both the meta tag and the `X-Robots-Tag` header.**
      `carries noindex in both the meta tag and the X-Robots-Tag header`.
- [x] **The purge job deletes at >30 days and not at 29, with an injected clock.**
      `deletes a decompile older than 30 days`, `keeps a decompile one day younger than 30 days`, plus
      `does not delete a row sitting exactly on the boundary` (`lt`, not `lte`) and an idempotence test.
- [x] **The removal endpoint deletes the row and later loads 404.**
      `removing a link deletes it and later loads 404`, and `asks for confirmation before deleting, and
      Keep it backs out`.
- [x] **Retention and removal stated before the share control.**
      `states the retention window and the removal option before the share control` — asserting DOM
      order, not just the text. Screenshot §8.
- [x] **Rate limits fire, name the limit, and reset.** Seven unit tests in `rate-limit.test.ts`
      (including that an unidentified caller shares one bucket rather than getting a free pass, and that
      the store stays bounded), plus `refuses past the waitlist limit with a message naming it` through
      a real server action.
- [x] **Turnstile guards permalink creation and nothing else.** Verification is skipped when
      unconfigured and the widget is not rendered; decompiling never touches it. See §4 on failing open.
- [x] **The abuse check runs before the summariser; on failure no provider call and the heuristic
      summary.** `makes no provider call and returns the heuristic summary when a blok is too long`,
      `… for text that is a question for a model`, `… once one caller is over budget` — each with a
      provider that throws if reached.
- [x] **Waitlist stores, rejects a duplicate calmly, and offers unsubscribe.** `stores an email and says
      so`, `accepts a duplicate calmly rather than erroring`, `offers an unsubscribe path`.
- [x] **IPs stored hashed; grep finds no raw IP.** §5 and `no-raw-ip.test.ts`.
- [x] **A permalinked source with CRLF, tabs, emoji and RTL renders with identical ranges.** Four tests,
      `identical ranges for …`, asserting identical offsets **and** identical characters.
- [x] **The perf decision implemented and explained; CI green three times.** §1 and §8.
- [x] **Axe clean, keyboard, 44px, no green/red/amber on the route.** Both themes on the shared page,
      the colour check reading *computed* colours, and the new controls measured with headroom rather
      than on the boundary — EPIC-013's 43.99998 lesson.
- [x] **`pnpm test`, `typecheck`, `lint`, `e2e`, `compliance`, `binary-files` clean.**
- [ ] **Staging: share, open, remove and waitlist by hand with screenshots.** §8, after merge.
- [x] **Report and session log written; backlog updated.**

---

## 7. The batched checklist

One block in `infra/README.md` — `IP_HASH_SALT`, `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
— each with **what happens if it is skipped**, because "required" and "nice to have" are different
kinds of task and a list that does not say which is which gets done in the wrong order. Everything is
built and tested so that it works without all three; nothing else in this epic needs a human.

Two things worth knowing from it: the salt is the one to do first (it is a privacy property, not a
feature), and the site key is `NEXT_PUBLIC_`, so it is baked in at **build** time and needs a redeploy
rather than a restart.

---

## 8. CI runs and staging

### Three consecutive green CI runs

Every gate, every run, on real CI hardware. **The gate that prompted this work read 1.74 on the run
that failed; it reads 1.11–1.19 now**, and no bar moved.

| gate | run 1 | run 2 | run 3 | bar |
|---|---|---|---|---|
| segment growth exponent | 1.11 | 1.19 | 1.17 | < 1.6 |
| cluster growth exponent | 1.11 | 1.36 | 1.12 | < 1.6 |
| detect growth exponent | 1.32 | 1.30 | 1.34 | < 1.6 |
| tag-matching excess | −0.11 | 0.02 | −0.11 | < 0.5 |

Worst reading across the three is **1.36** against a 1.6 bar — 0.24 of headroom, on the gate with the
shortest per-run duration, which is exactly where the model predicts the most residual noise.

**The one to watch is `cluster`.** It swung most (1.11 → 1.36 → 1.12) and has the least headroom,
because its inputs are 1,000 and 4,000 segments and so each run is short — the same property that made
`segment`'s gate the first to flake. If it ever crosses, the answer is more samples, not a wider bar;
`RATIO_RUNS` carries the measurement table to argue from.

All six checks passed on all three runs.

### Staging

_Filled in by a follow-up commit once the branch has merged and staging has redeployed._

---

## 9. Open questions

1. **The rate limiter is in-memory and per process.** Honest for a single web container, and the seam
   is one function wide — but the moment there are two containers these become per-instance and the
   real limits double. Worth a durable store before EPIC-015 announces anything, or is the soft launch
   small enough to leave it?
2. **`x-forwarded-for` is client-controllable**, so a determined caller can rotate their apparent
   address and get more than their share of a per-IP limit. The per-session limit and the global budget
   bound the damage. Accept, or take the address from the proxy's own trusted header on the box?
3. **The abuse check's shape list will need evidence to grow.** It currently has four whole-phrase
   patterns and deliberately catches only the obvious case. EPIC-084's live read is the first chance to
   see what actually arrives — should it report refusal counts by reason so that list can be tuned from
   data rather than from imagination?

---

## 10. Verify

```
pnpm test && pnpm typecheck && pnpm lint && pnpm compliance
E2E_PORT=3100 npx playwright test apps/web/e2e/capture-share.spec.ts
```

A local Postgres is required (`docker start 41p-dev-postgres`, then `pnpm db:migrate`) and `.env`
must be sourced; without it the db-backed suites fail with `DATABASE_URL is required`.
