# Plan — EPIC-014: Capture and abuse control

Branch `epic/014-capture`. Written after reading the epic, `CLAUDE.md`, EPIC-013's report, the
existing `packages/db` schema, `apps/worker`'s job and summariser, and after **reproducing the carried
perf defect** rather than reasoning about it.

## The perf gate, decided first and with evidence

The epic says decide it deliberately, make it robust or demote it, and do not widen the bar. I could
not reproduce the failure on a quiet machine (12 trials, exponent 1.16–1.30 against a 1.6 bar), so I
reproduced CI's actual condition instead — a small number of cores oversubscribed by parallel suites —
by saturating all 8 cores with busy loops and re-measuring.

**Under 2× oversubscription (16 busy loops):**

| runs per side | min | median | max | trials ≥ 1.6 |
|---|---|---|---|---|
| **5 (today)** | 0.432 | 1.355 | **1.968** | **4 / 15** |
| 15 | 0.308 | 1.298 | 1.703 | 2 / 15 |
| 30 | 1.149 | 1.205 | 1.371 | 0 / 15 |

**Under 4× oversubscription (32 busy loops), worse than CI is likely to be:**

| runs per side | min | median | max | trials ≥ 1.6 |
|---|---|---|---|---|
| 30 | 1.104 | 1.178 | 1.492 | 0 / 12 |
| 50 | 1.109 | 1.164 | 1.410 | 0 / 12 |

That is the CI failure reproduced — 1.968 against a 1.6 bar, where CI saw 1.74 — and it shows the
estimator, not the code, is what moved.

**Decision: make the measurement robust. Keep the gate, raise the sample count to 30, change no bar.**

The reasoning the numbers confirm: the estimator is already minimum-based, and **contention can only
ever make a measurement slower, never faster**, so the minimum of many runs converges on the true
time from above. Today's five runs are simply too few for the *large* input — which does four times
the work and is therefore four times more likely to be descheduled mid-run — to get a single clean
measurement. More samples raise that probability monotonically, which is why the spread collapses from
0.432–1.968 to 1.104–1.492 rather than merely shifting.

**Why not demote it to a reported number.** The gate guards quadratic tag matching, which this
codebase actually had: `segment/README.md` records that the forward-scan implementation sits at
exponent 2.0. The absolute timing gates would not catch its return — quadratic at 100 KB is roughly
57 ms, comfortably inside the 100 ms bar — so demoting this gate would let a real, previously-made
regression ship silently. A flaky gate guarding nothing should be demoted; a flaky gate guarding
something real should be measured properly.

**Applied to all four ratio gates, not just the one that flaked.** `segment.perf.test.ts` has two
(growth exponent, and the tag-matching excess, which is a *difference of two exponents* and so
compounds the same noise twice), and `cluster.perf.test.ts` and `detect.perf.test.ts` have one each.
They share the estimator and therefore the defect; fixing one and leaving three to flake later is the
same mistake in slow motion. One shared helper, one constant.

## The rest of the epic

### Data

`packages/db` gains two tables and a migration:

- `decompiles` — `id` (`dc_` + 12 hex), `source`, `created_at`, `ip_hash`, `user_agent_hash`.
- `waitlist` — `id`, `email` (unique), `created_at`, `unsubscribed_at`.

**IP is hashed with a per-deployment salt, never stored raw** (epic Scope). The salt is an env
variable, so the same address hashes differently per deployment and a leaked table is not a list of
who visited. A grep over the schema and the logs is an acceptance criterion, so it gets a test rather
than a promise.

**`source` is stored exactly as received — CRLF and all.** EPIC-013 measured that the browser
normalises a textarea to CRLF on submit, and the offsets in a recomputed decompile index the string
the server received. Normalising on the way in would shift every range in every stored link.

### The permalink

`/d/<id>` is server-rendered and **recomputes** the decompile from the stored source rather than
storing rendered HTML (decision 1), so a core fix improves every existing link. `noindex, nofollow`
in the meta tag **and** an `X-Robots-Tag` header — both, because a crawler that never renders the page
only sees the header.

### Limits, Turnstile, abuse

- **Rate limits** per IP and per session, on decompiling and on permalink creation, as named
  constants, returning a calm message naming the limit. The existing magic-link limiter is Better
  Auth's and is not reusable here; this is a small shared in-memory limiter, which is honest for a
  single-instance deployment and is where EPIC-070 would swap in something durable.
- **Turnstile on permalink creation only** (decision 6). Decompiling stays free of it: proving you
  are human before you have seen any value is how the funnel dies.
- **The abuse check runs before the summariser** and is *not* a content filter (epic notes). It
  exists to stop us paying for someone else's inference: a size cap, a cheap check for the shape of a
  free-inference attempt, and a per-IP budget. On failure the heuristic summary is used and **no
  provider call is made** — asserted with a client that fails the test if it is called at all.

### Waitlist

Email only, one field, on the result page. A duplicate is accepted calmly rather than erroring —
somebody who signs up twice has not done anything wrong. An unsubscribe path exists; double opt-in
does not, per decision 8.

### EPIC-017, the paper dependency

It does not exist. The retention sentence is written to **stand alone** — it states the window and
the removal option in plain words without pointing at a privacy policy that has not been written —
and the gap goes in the report. Not a blocker (epic notes say so explicitly).

## Build order

1. **The perf gate**, first and on its own commit, so its diff is readable and CI can be watched
   across three runs independently of everything else.
2. Schema + migration + id helper, with the no-raw-IP test.
3. The purge job (clock-injected, idempotent) and its two boundary tests.
4. Rate limiter, then the create/share path, then Turnstile on it.
5. `/d/<id>`, the headers, and the four text-shape fixtures proving ranges survive a round trip.
6. Removal endpoint and its confirm.
7. Abuse check in front of the summariser.
8. Waitlist and unsubscribe.
9. Copy pass over the retention sentence and the removal affordance.
10. e2e, axe, keyboard, 44px — **with headroom, not on the boundary**, per EPIC-013's 43.99998 lesson.
11. `infra/README.md` checklist, report, session log, backlog, staging.

## One batched checklist, asked once

Turnstile keys and the IP salt are human-only steps. They go into `infra/README.md` as a single
numbered block and are surfaced **once**, at the end, rather than interrupting mid-flight — the epic
asks for one batched checklist and that is a promise about not being pestered. Everything is built and
tested so that it works without them: Turnstile verification is behind a seam that is a no-op when
unconfigured (and says so loudly in a non-production environment), and the IP salt falls back to a
per-process random value so a missing salt degrades to "hashes are useless across restarts" rather
than to "IPs are stored raw".

## Where I would stop

If the abuse check could not be built without becoming a content filter, or if permalink recomputation
could not reproduce identical ranges for the four text shapes, that is `BLOCKER-EPIC-014.md`. Neither
looks likely: the first is a budget question and the second is EPIC-013's mapping, already proven, with
the source stored verbatim.
