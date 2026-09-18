<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: Apache-2.0
-->

# Plan — EPIC-057: the delivery path, modelled

`CLAUDE.md`: *plan first, stop and show the plan*. Unattended, "show" means write it down before
writing code (`docs/AUTONOMOUS.md` step 2). This is that.

## The shape of it

Six code changes and one document, and the document is the epic. Every code change is a mitigation
for a finding, so the order is: **probe first, then fix, then write down what was found**. Writing
the document first would produce a threat model whose findings were guesses.

The three findings that already exist before any probing:

| finding | where it came from |
|---|---|
| `urllib` forwards `Authorization` across origins; `fetch` is *believed* not to | EPIC-054 §4.2, handed forward |
| `@41prompts/sdk` reads a response body with no cap; `fortyone` caps at 16 MiB | EPIC-054's handover, point in "Start here" |
| the marker endpoint has no rate limit | `docs/roadmap.md`'s own Tests line |

And the one this epic's own reading found, which is the serious one:

| **a content address is not a signature** | `disk.ts` re-verifies `buildHash` on read, which proves *intact*, not *ours*. The cache is `<tmpdir>/41prompts-sdk/` and on a shared host whoever creates that directory sets its mode. |

## Order of work

### 1. Probe, and record what the probes say (before any fix)

Nothing here is committed as a test yet; this is measurement, so the document quotes numbers rather
than beliefs.

- **`fetch` and the cross-origin redirect.** Two `node:http` servers on two loopback ports. The first
  302s to the second. Read what the second received. Control: a same-origin redirect must still carry
  the header, or the probe proves nothing. This is the mirror of EPIC-054's urllib measurement and it
  becomes `packages/sdk-ts/src/redirect.test.ts` (C10).
- **The unbounded read.** A server that streams a body forever, and `fetchLive` against it. Measure
  that it does not stop. (Becomes C8's control.)
- **The cache directory's real mode.** `mkdirSync(recursive)` under this umask, then `stat`. And the
  case that matters: a pre-existing `0o777` directory, where the `mode` argument does nothing.
- **The marker endpoint's rate.** Loop `GET /v1/marker/:id` with a valid key and count what gets
  through. Expected: everything.

### 2. `apps/web/lib/rate-limit.ts` — the move (ruling 2)

`git mv` semantics by hand: the mechanism (`Limit`, `LimitVerdict`, `checkLimit`, `describeWait`,
`resetLimitsForTest`, `MAX_TRACKED`, `evictIfNeeded`, and the module header explaining why it is
in-memory) moves to `apps/web/lib/rate-limit.ts`. `lib/decompile/rate-limit.ts` keeps its three
constants and re-exports the mechanism so `run.ts`, `share-actions.ts` and `rate-limit.test.ts` do
not move.

The header's caveat — one web container, so in-memory *is* global today — moves with it and gains the
sentence that `/v1` now depends on it too.

### 3. `apps/web/lib/deploy/v1-limits.ts` — the `/v1` limits (rulings 3, C3–C5)

```
V1_KEY_LIMIT       per key,     generous — an SDK refreshes every 30s per prompt
V1_ANON_LIMIT      per address, tight   — nobody legitimate is here without a key
V1_BLOB_LIMIT      per address, middle  — unauthenticated by design, costs a query + a body hash
```

One function, `limitV1(request, key)`, returning the same `LimitVerdict`, plus
`rateLimitedResponse(verdict)` producing `429` with `Retry-After` and a JSON body in
`refusalResponse`'s shape (`{ error: "rate_limited" }`) so an SDK reading `error` sees one vocabulary.

**Where it is called.** In each route, *after* `keyFromRequest` for the three authenticated routes —
so the key bucket is available and a valid key is not charged to the shared anonymous bucket — and
before any database read on `/v1/blob`. The anonymous bucket is charged when `keyFromRequest` refuses.

Numbers are named constants with the reason in a comment, per EPIC-014 decision 5. Starting points,
to be sanity-checked against what an SDK actually emits: a client refreshing one prompt every 30s is
120 marker requests an hour, and a fleet of ten processes with five prompts each is 6,000. So the key
limit must be per **key** and generous: 20,000/hour. The anonymous one is 60/hour — a stranger with
no key has no legitimate reason to be here at all, and 60 is enough for somebody debugging a
mis-pasted key.

**C5's enumeration test** reads the four `route.ts` files under `apps/web/app/v1/` and asserts each
one references the limiter. A fifth route added later fails the test rather than being the quiet
exception. The control: the test must fail when pointed at a file that does not call it.

### 4. `packages/sdk-ts` — three changes

- **`MAX_BODY_BYTES = 16 * 1024 * 1024`** in `network.ts`, refusing rather than truncating (C8,
  ruling 6). `fetch`'s `Response` has `content-length` sometimes and not always, so the check is on
  the header when present **and** on the text length after reading — the header is a claim by the
  server being distrusted. A test pins the number to `fortyone._network.MAX_BODY_BYTES` by reading
  the Python file, so the two cannot drift.
- **`429` handling** (C9, ruling 7). `fetchLive` returns a new outcome kind carrying
  `retryAfterSeconds`; `client.ts` stores a "do not ask before" timestamp and the refresh skips until
  then. No new `WarningCode` — `frozen.test.ts` is the guard and it stays green untouched.
- **`disk.ts` owner-only** (C7, ruling 5): `mkdirSync(dir, { recursive: true, mode: 0o700 })`, and a
  `statSync` check before a read that refuses a directory whose mode has group or other write bits,
  or whose `uid` is not `process.getuid?.()`. Refusal is a `disk` warning, which already exists and
  is already documented as never fatal. Windows has no `getuid`; the check is skipped there and the
  document says so.

### 5. `sdks/python/fortyone` — two changes

- `_disk.py`: `os.makedirs(..., mode=0o700)` and the same `os.stat` check, refusing with a `disk`
  warning. `os.getuid` is absent on Windows — `getattr(os, "getuid", None)`.
- `_network.py` / `__init__.py`: the same `429` back-off, same seconds.

Both keep `mypy --strict` clean. The divergence table in `sdks/python/README.md` gains no rows — no
public name changed — and `test_divergence.py` proves that.

### 6. `apps/web/lib/deploy/artifact-substitution.test.ts` (C6, ruling 4)

Publish a real build through `publishVersion` into the database store, then rewrite the stored
object's body by one byte, then run a real `createClient` against a `fetch` that dispatches to the
route handlers. Assert `hash_mismatch` and that the previously-held artifact is still what
`resolve()` returns. Control: the same path with the object untouched resolves and warns nothing.

### 7. `docs/security/sdk-threat-model.md`

Written last, from what the probes and the fixes actually established. Sections, following
`byo-key-threat-model.md`:

1. What is being protected, and from what · trust boundaries · what is deliberately not defended
   against
2. The design being modelled
3. Findings — the six classes, each with severity, what is built, what is owed, residual
4. Where a key could appear, and what stops it
5. What a green build here does not prove (C11)
6. If an artifact is substituted — the operator's procedure
7. Why there is no signature yet, and what would change it
8. Every high finding has an epic — paste-ready rows (C2)

`apps/web/sdk-threat-model.test.ts` asserts the six classes each have a section (C1) and that every
`high` finding has a row (C2), each with a control proving the assertion can fail. It lives in
`apps/web` because the mirror does not contain it — lesson 28.

### 8. Gates, drive, report

`node scripts/gate-run.mjs` on the commit. `scripts/drive-epic-057.mts` against the built app:
sign in fresh, create project → prompt → bloks by clicking, publish, mint a key on the keys page,
then exercise the three mitigations against the running server (C13). Screenshots into
`docs/epics/reports/screenshots/EPIC-057/`.

## Risks, and what I will do about each

| risk | plan |
|---|---|
| **The limit fires during the drive's own ordinary traffic** and the drive reads it as a defect. | The drive is the only caller of its own key. It asserts the *unlimited* path first, then deliberately exhausts a bucket, then asserts recovery. Ordering is the assertion, not an accident. |
| **`resetLimitsForTest` leaks between suites**, so a test passes on order. | `beforeEach`, and one test that proves the reset works — lesson 8. |
| **The mode check breaks e2e or the drive** on a machine whose `/tmp` is already group-writable. | Refusal is a warning, never an exception, and the SDK falls through to memory and bundled. Measured on this machine during step 1 before anything depends on it. |
| **The 429 back-off makes the stale/refresh tests order-dependent.** | Back-off state is per client instance, and every test constructs its own. |
| **Widening `WarningCode` by reflex.** | `frozen.test.ts` and ruling 7. If I find myself editing `types.ts`, stop. |
| **Three strikes.** | `docs/AUTONOMOUS.md`: same cause three times → `BLOCKER-EPIC-057.md` and stop. |

## What this will not cover, to be said in the report

No penetration test. No external reviewer (ruling 9, its own numbered section). No registered
package name. No signature. No deployed environment carrying any of it — nothing is pushed, so the
image build, Coolify, Traefik and migrations against the real database are untested here.
