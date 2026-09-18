<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# EPIC-057: The delivery path, modelled — and the three places it is weaker than it reads
Stage: 5b · Depends on: EPIC-052 · Size: S

**Written by Claude Code in the advisor's chair**, 2026-09-17, under `docs/PROCESS.md`'s amendment of
2026-09-15 and the precedent EPIC-040 to EPIC-043, EPIC-050 to EPIC-055 set. The Tasks, Tests and
Review lines below are `docs/roadmap.md`'s, unchanged; the Goal and everything else is this file's
reading of them. `docs/roadmap.md` gives EPIC-057 no Goal line, so one is written here.

**Where it starts.** EPIC-043 modelled **one asset** — a provider key — before a single key was
stored, and `docs/security/byo-key-threat-model.md` is the shape this epic follows. Nothing has yet
modelled the other half: the path a **published prompt** takes from `publish_events` to a model call
inside somebody else's process. That path is now four HTTP routes, two SDKs in two languages, a disk
cache, five package names on two registries, and a content address that a great deal of code treats
as though it were a signature.

**This epic is not only a document.** The roadmap's Tests line asks for two things that do not exist —
a rate limit on the marker endpoint, and a system-level proof that a mismatched artifact is refused —
and writing a threat model against a system you did not probe is how a finding becomes a paragraph
nobody can act on. Everything built here is a mitigation for a finding the document names, and every
finding names whether it is built or owed.

## Goal

The published-prompt delivery path has a written threat model with triaged findings; the three
weaknesses that modelling it found are closed in code with tests that fail against the old behaviour;
and every remaining `high` finding has an owner and a backlog row written ready to paste.

## The roadmap's three lines, verbatim

> **Tasks.** Key theft, pointer tampering, artifact substitution, replay, DoS on pointer endpoint,
> dependency confusion; mitigations mapped; one external review hour; findings triaged.
> **Tests.** Rejected mismatched artifact; rate-limited pointer endpoint.
> **Review.** Every high finding has an owner and an epic.

## Scope

- **`docs/security/sdk-threat-model.md`** — the document. The six threat classes the Tasks line
  names, each mapped to what is built and what is owed; trust boundaries; what is deliberately not
  defended against; findings with severities; and a final section of paste-ready `docs/backlog.md`
  rows, exactly the `byo-key-threat-model.md` §8 shape.
- **A rate limit on `/v1`** — the Tests line's "rate-limited pointer endpoint". Two buckets, per key
  and per address, `429` with `Retry-After`, applied to all four `/v1` routes rather than to the one
  the roadmap names. Ruling 3.
- **The in-memory limiter moves out of `lib/decompile/`** to `apps/web/lib/rate-limit.ts`, unchanged,
  with the decompile constants left where they are. Ruling 2.
- **The disk cache is created and checked as owner-only** — the mitigation for finding "artifact
  substitution", which is the most serious thing modelling this found. Ruling 5. **`fortyone` only**:
  ruling 11 has the four measurements that took it out of `@41prompts/sdk`.
- **`fortyone` honours a `429`** by not asking again until `Retry-After` has passed. Ruling 7, and
  ruling 11 for why its TypeScript half is owed rather than built.
- **A system-level test that a mismatched artifact is refused** — through the real route and the real
  store, not only through `verify.ts` with a hand-made string. Ruling 4.

## Out of scope

- **The external review hour.** It needs a person who is not Soroush and is not this run. Skipped,
  named in its own numbered section of the report, never ticked and never faked. Ruling 9.
- **Signing artifacts.** The right answer to finding 3 in the long run, and it is a key, a
  distribution mechanism, a rotation story and a format version — an epic, written as a row in §8,
  not a thing to start inside a threat model.
- **Registering any package name.** Dependency confusion's only real mitigation is holding the names,
  which needs accounts on npm and PyPI. EPIC-006 is `deferred`. Finding, row, no build. Ruling 8.
- **`SECURITY.md`, `TRADEMARKS.md`, the DCO and the public mirror.** All EPIC-056's, listed there.
- **Changing `/v1`'s shape, the artifact format, ADR-005 or ADR-006.** This epic reads all four. Where
  a mitigation would have needed a frozen type widened, it did not widen it — ruling 7 says what that
  costs.
- **Rate limiting the app's own session routes.** `auth.ts` already limits sign-in; the subject here
  is the key-authenticated delivery path.
- **Anything about provider keys.** EPIC-043 has that asset and this document says so rather than
  restating it.

## Rulings taken in the advisor's chair

Each of these is logged in `docs/decisions/AUTONOMOUS.md`.

### 1. It is the **marker** endpoint, and the roadmap's "pointer" is quoted once and then dropped

`docs/roadmap.md` says *"DoS on pointer endpoint"* and *"rate-limited pointer endpoint"*.
`CLAUDE.md`'s Vocabulary section forbids **pointer** in UI strings, schema and code identifiers with
no carve-out, and EPIC-051 already resolved the identical conflict when it named the route: the path
is `/v1/marker/:promptId` and the type is `LiveMarker`.

So the roadmap's line is quoted verbatim once, above, and every other sentence in this epic and in
the document says marker. A threat model that invents a second name for the thing it is modelling is
a threat model whose findings cannot be grepped for.

### 2. The limiter moves rather than being copied

`apps/web/lib/decompile/rate-limit.ts` already holds a general fixed-window store — `checkLimit`,
`Limit`, `LimitVerdict`, the `MAX_TRACKED` eviction, and the reason the whole thing is in-memory. Only
the three constants above it are about decompiling.

**A second copy in `lib/deploy/` is the defect this repository has refused under five names** — the
env placeholders, `buildHashOf`, the publish gate, the bindings generator, and the `.pyi` EPIC-054
declined. Here it would be worse than usual: two window stores mean two eviction caps and two
`resetLimitsForTest`s, and a test that clears one while the other keeps counting is a limiter that
passes its own suite and leaks across tests.

The mechanism moves to `apps/web/lib/rate-limit.ts`. `lib/decompile/rate-limit.ts` keeps
`DECOMPILE_LIMIT`, `SHARE_LIMIT` and `WAITLIST_LIMIT` and re-exports the mechanism, so the three
existing call sites do not move and the diff stays readable.

### 3. Two buckets, and the limit is on all four `/v1` routes

**Per key, not per address.** A customer's fleet sits behind one egress address; an address bucket
would give a company of forty processes the budget of one, and the first thing they would meet is a
`429` caused by their own success. The key is the identity the route already authenticates and the
one whose traffic we actually mean to bound.

**And per address as well, for the requests that have no key.** A `401` is answered before any key
exists, so a key bucket cannot see a stranger at all — and every attempt costs `apiKeyForPlaintext`
a SHA-256 **and an indexed database query**, at whatever rate the caller chooses, with no ceiling on
it today. The unauthenticated bucket is tighter than the authenticated one, and both exist: limiting
only one of them is the gate pointed at one tree again.

**All four routes, not only `/v1/marker/:promptId`.** The roadmap names the marker because it is the
one called on a timer. But `/v1/build/:buildHash` and `/v1/prompts` cost a database round trip each,
and `/v1/blob` is **unauthenticated by design** and reads an object out of Postgres and hashes its
body on every request. Limiting the cheapest of the four and leaving the one with no key on it would
be a mitigation written for the sentence rather than for the system.

`/v1/blob` gets the address bucket only — it has no key to bucket by, which is itself a finding.

### 4. The mismatched-artifact test is built at the seam, because that is where nothing has looked

`packages/sdk-ts/src/verify.test.ts` already proves `checkArtifact` refuses a document whose hash is
wrong and one that is intact but is not what the marker named. That is a unit test of a pure
function, and it is not what the Tests line is asking for.

**Nothing has ever proved the refusal survives the seam**: a real published artifact, served by the
real route, out of the real store, fetched by the real client, with one byte changed in the store.
EPIC-054's finding 4.2 is the argument — the Python transport was injected in every test, so a defect
that lived in the transport was invisible to the whole suite, and it took a real interpreter against
a real server to find it. The same is true here: every existing verification test hands `readArtifact`
a string it wrote itself.

So the test tampers with the stored object and asserts the client warns `hash_mismatch` and keeps
serving what it already held — with the control that the **untampered** object resolves through the
identical path, because an assertion that a thing is refused is worthless beside a path that refuses
everything.

### 5. The disk cache is owner-only, and the reason is that a content address is not a signature

This is the finding this epic exists to have found.

`buildHash` is a SHA-256 of the artifact's own canonical encoding. `disk.ts` re-verifies it on every
read, with a comment saying *"a file on disk is not ours in any sense that matters"* — and that
re-verification proves the file is **intact**, not that it is **ours**. Anyone who can write into the
cache directory can write any text they like, compute its `buildHash` themselves, and produce a
document that passes every check both SDKs make. The `promptId` is theirs to choose too.

The cache is `<tmpdir>/41prompts-sdk/`. On a shared host `/tmp` is world-writable and sticky, and
**whoever creates the directory first owns it and sets its mode** — so an unprivileged local process
can pre-create it world-writable and then choose what prompt text our SDK hands to a model. That is
prompt injection with no model involved, delivered through a file.

**What is built:** the directory is created `0o700`; before a read the SDK stats it and refuses to
use it — with a `disk` warning, never an exception — when it is not owned by this user or is group-
or world-writable. Memory and bundled are unaffected, which is what makes this safe to fail closed.
On Windows there is no uid and the check is skipped; the document says so rather than implying a
guarantee.

**What is not built, and is §8's row:** signing. Only a signature makes an artifact ours rather than
merely intact, and it needs a key, a distribution mechanism and a format version.

### 6. `@41prompts/sdk` reads to a limit, and the number is `fortyone`'s

`fortyone._network` caps a body at 16 MiB and says why: *"an unbounded read is a memory exhaustion
somebody else controls"*. `@41prompts/sdk` calls `response.text()` with no cap at all, which is the
same defect in the package that ships to more people.

Same constant, same refusal — the body is refused rather than truncated, because a truncated document
fails its content address and would report as `hash_mismatch`, which means *somebody served you the
wrong document*. EPIC-054 made that exact argument about a different failure and it holds here.

### 7. A `429` backs the refresh off, and **no new `WarningCode` is added**

A rate limit nothing respects is a rate limit that makes the problem worse: every limited client
keeps its 30-second timer, so the endpoint pays for the refusal at the same rate it paid for the
answer. Both SDKs now skip refreshing until `Retry-After` has elapsed.

**The warning stays `network`.** `WarningCode` is frozen by ADR-006 §1 and `frozen.test.ts` fails when
a value appears. Widening an output union is a breaking change for any customer with an exhaustive
`switch`, and the existing fallback already produces *"the Live marker request answered 429"*, which
names the status in the message.

**What that costs, stated rather than glossed:** a customer can read it but cannot branch on it.
That is a real narrowing and it is finding 6's residual, with a row in §8 for whoever opens ADR-006
next — which EPIC-056 will, to publish.

### 8. Dependency confusion is modelled and not mitigated, because the mitigation is an account

Five names ship from this repository: `@41prompts/core`, `@41prompts/sdk`, `@41prompts/cli` on npm
under a scope nobody holds; `41p` unscoped on npm; `fortyone-prompts` and `41prompts` on PyPI. **None
is registered.** Anyone may take any of them today, and the two unscoped ones plus the PyPI pair are
the ones that matter: a scope is at least a namespace somebody has to own.

Three things this repository already does are real and are written down as such — `prepublishOnly`
refusing to publish outside `41prompts/41prompts`, `provenance: true` in every `publishConfig`, and
`sdks/python`'s zero dependencies meaning there is no resolver to confuse on the install side. None
of them registers a name, which is the only mitigation that exists.

`docs/AUTONOMOUS.md`: a dependency on a person is skipped and said out loud. EPIC-006 is `deferred`
and holds the accounts. This is a finding with a row, and the row's owner is Soroush.

### 9. The external review hour is skipped, in its own numbered section

*"One external review hour"* means somebody who did not write this reads it. There is no such person
in an unattended run, and Soroush has declined the lawyer hour (EPIC-071, `deferred`) which is the
nearest precedent for how he wants outside time spent.

It is not a `BLOCKER` — a blocker is an epic that cannot proceed, and everything else here can. It is
a criterion left unticked with a name against it, the EPIC-030 §11 shape, and the document's own
"what a green here does not prove" section says in as many words that nobody has attacked this.

### 10. Severity is about consequence, and the same scale as EPIC-043's

`high` means the consequence is somebody else's money, somebody else's credential, or a model call
made on text we did not publish. `medium` means degraded service or an unanswerable question after
the fact. `low` means it is worth writing down. Written here so the two documents can be read
together.

### 11. The 15 KB bundle budget refuses all three TypeScript SDK mitigations, and ADR-006 says what to do about that

**Found by building them and measuring, after they were written and working.** The numbers, all on
this machine, `esbuild --minify` over `dist/index.js`, budget 15,360:

| variant | minified | against budget |
|---|---|---|
| baseline, as EPIC-054 left it | 15,121 | **239 spare** |
| + the disk-cache owner check, written as tightly as it honestly can be | 15,411 | **51 over** |
| + 429 back-off + a post-hoc body-size refusal + the disk check | 16,304 | 944 over |
| + a streaming body reader, which is the only version that bounds the allocation | 16,590 | 1,230 over |

**The cheapest single mitigation is 290 bytes and there are 239.** It is not close, and it is not a
coding problem: `client.ts` (3,450 B), `verify.ts` (1,756 B), core's `sha256.ts` (2,178 B) and
`canonical.ts` (1,416 B) are all load-bearing, tree-shaking already drops everything else, and there
is no slack to reclaim.

**ADR-006 predicted this and wrote down the answer**, in Consequences:

> The bundle budget is measured on every test run and currently has **206 bytes of headroom**. The
> next feature in this package very likely breaks it, and **the correct response is to measure what
> got in — not to widen the number, which is a Review line.**

It also settles the reading, in §6: *"The Review line's 15 KB budget is measured on the minified
bytes, because that is what their bundler emits."* So the gzipped figure — 6,764 B, less than half
the budget — is not available as an escape, and neither is editing the constant.

**So the three do not ship in `@41prompts/sdk`.** The budget stays exactly where it is, nothing is
merged past a red gate, and the mitigations become the loudest **owed** finding in the document with
the table above and a row in §8.

**What ADR-006 did not anticipate is which feature would be first to hit the wall.** It expected a
*feature*; the first casualty is a *fix* — and the most serious one this epic found. A Review line
correctly refusing to be widened for a convenience is a different question from one refusing to be
widened for a security control, and that question is Soroush's. The row names his three options:
move the budget, pay for the mitigations out of `client.ts`, or ship `@41prompts/sdk` without them.

**`fortyone` has no such budget and its mitigations do ship.** That leaves the two SDKs with
**different security postures**, which is bad and is therefore stated rather than smoothed over: a
Python process refuses a cache directory other users can write and a Node process does not, and the
Node one is the majority. Withholding a real fix from Python to keep the two symmetrical would help
nobody; the divergence table and finding 5 both carry it.

### 12. The rate limit counts **after** authentication, and the first version of this epic got it backwards

**Written, tested, committed, then removed.** `v1-limits.ts` originally refused an address that had
spent its sixty unauthenticated requests *before* `keyFromRequest` ran, so that somebody trying keys
did not buy an indexed database lookup per attempt. Ruling 3 argued for it and it was wrong.

**A pre-auth gate sees an address and nothing else.** A customer's fleet shares its egress address
with everything else behind that NAT — so **anybody could have deliberately spent a target's sixty
requests and had that customer's whole fleet refused before it was even authenticated.** That is a
targeted denial of service against the asset the finding is about, introduced by the mitigation for
it.

**And it bounded almost nothing.** Checked rather than assumed: `keyFromRequest` answers
`missing_key` with **no query** when there is no header, and `apiKeyForPlaintext` refuses a malformed
token through `environmentOfPlaintext` **before** it reaches a query. The only request that touches
the database carries a well-formed `41p_live_…`/`41p_test_…` token, and a key is 128 bits of
`randomBytes` — guessing is not the threat. Volume is, and the address bucket bounds volume by
counting failures.

So a failed authentication is **counted** against the address and an authenticated caller is never
gated by a bucket a stranger can fill. `peekLimit` stays, gating nothing, because a test that wants
to prove *which* bucket a request was charged to has to read one without spending it.

**How it was found matters.** Not by a test — every test of the pre-auth version passed, because
each was written from the same mistaken premise, which is `PROCESS.md`'s *"a test written from the
implementation asserts the implementation"* in its purest form. It was found by asking **how the
browser drive would demonstrate the limit**, and noticing that the demonstration would have to show
a customer being locked out by a stranger. That is the browser drive earning its place before it was
even written.

## Acceptance criteria

- [ ] **C1.** `docs/security/sdk-threat-model.md` exists and covers **all six** classes the Tasks
      line names — key theft, marker tampering, artifact substitution, replay, denial of service on
      the marker endpoint, dependency confusion — each with what is built, what is owed, and a
      residual. Verified: a test asserts each of the six has a section, so a class cannot be dropped
      in an edit.
- [ ] **C2.** Every finding carries a severity, and **every `high` finding has a paste-ready
      `docs/backlog.md` row** in the final section with an owner named. Verified: `apps/web`'s
      `sdk-threat-model.test.ts`, with a positive control that the assertion fails when a `high`
      finding has no row.
- [ ] **C3.** **The marker endpoint is rate limited.** A key past its budget gets `429` with
      `Retry-After` and a body naming the limit; a key inside it is unaffected; two different keys do
      not share a bucket. Verified: `apps/web/lib/deploy/v1-limits.test.ts`.
- [ ] **C4.** **An unauthenticated caller is limited too, on a tighter bucket**, and `/v1/blob` —
      which has no key — is limited by address. Verified: same file, with a control proving the
      authenticated bucket is the one being consumed when a key is present. **And a stranger who
      fills an address bucket cannot refuse an authenticated caller from that same address** —
      ruling 12, with the removed function named so the shape cannot come back.
- [ ] **C5.** All four `/v1` routes are limited. Verified: a test that enumerates the route files and
      fails when one of them does not call the limiter — so a fifth route added later cannot quietly
      be the unlimited one.
- [ ] **C6.** **A mismatched artifact is refused at the seam.** With a real published build in the
      store, one byte changed, the client warns `hash_mismatch` and keeps serving what it held; the
      untampered object resolves through the identical path. Verified:
      `apps/web/lib/deploy/artifact-substitution.test.ts`.
- [ ] **C7.** **`fortyone`'s disk cache is owner-only.** Created `0o700`; a directory that is group-
      or world-writable, or owned by another user, is refused with a `disk` warning and no exception.
      Verified: `sdks/python/tests/test_disk.py`, chmodding a real directory, with the control that a
      correct directory is used. **`@41prompts/sdk`'s half is owed** — ruling 11, and it is §8's row.
- [ ] **C8.** **The 15 KB budget is measured against each of the three mitigations and the numbers
      are in the report**, rather than the budget being widened or the finding being asserted without
      one. Verified: ruling 11's table, reproducible with
      `pnpm --filter @41prompts/sdk test -- package.test.ts`, which prints all three figures on every
      run. `fortyone`'s own 16 MiB cap is unchanged and still tested.
- [ ] **C9.** **`fortyone` honours a `429`**: after one it issues no request until `Retry-After` has
      elapsed, and resumes afterwards. Verified: `tests/test_stale.py`, counting requests, with the
      control that a client which was never refused keeps asking. **`@41prompts/sdk` does not**, by
      ruling 11; its behaviour under a limit — warn on `network`, keep serving from memory, ask again
      next interval — is named in the report and in the document rather than left to be discovered.
- [ ] **C10.** **`fetch` really does drop `Authorization` across an origin**, which
      `packages/sdk-ts/src/network.ts` asserts in a comment and nothing has measured. Proved against
      two loopback servers on different origins, with the control that a same-origin redirect still
      carries it — the mirror of EPIC-054's Python measurement. Verified:
      `packages/sdk-ts/src/redirect.test.ts`.
- [ ] **C11.** The document names, in its own section, **what a green here does not prove**: no
      penetration test, no external reviewer, no registered package name, no signature, and no
      deployed environment carrying any of it.
- [ ] **C12.** `pnpm test`, `pnpm typecheck`, `pnpm lint` green with every package reporting, and
      `node scripts/gates.mjs ci` green on the commit. `pnpm forbidden-words` passes over the new
      document's UI-adjacent strings and over every file this epic adds.
- [ ] **C13.** **The drive**: against the built app, a fresh throwaway user, a project and a prompt
      created **through the product's own UI**, published, a key minted through the keys page, and
      then the three mitigations exercised against the running server — the marker endpoint driven
      past its limit until it answers `429` and then recovering, a tampered stored artifact refused
      by a real `@41prompts/sdk` client while the untampered one resolves, and a world-writable cache
      directory refused. Screenshotted into `docs/epics/reports/screenshots/EPIC-057/`.

## Verification

```
pnpm --filter @41prompts/web test
pnpm --filter @41prompts/sdk test
uv run --project sdks/python pytest -q
pnpm forbidden-words
node scripts/gate-run.mjs
npx tsx scripts/drive-epic-057.mts      # against the BUILT app, see its header
```

## Notes for the implementer

- **Read `docs/security/byo-key-threat-model.md` first and follow its shape.** It is the only other
  document of this kind in the repository and the two will be read together. Its §8 is the exact
  pattern C2 asks for.
- **The limiter is in-memory and there is one web container.** That is already written down in
  `lib/decompile/rate-limit.ts`'s header and it stays true here; do not add Redis, and do not
  silently let the header's caveat go stale when the module moves.
- **Every absence assertion needs a positive control.** C2, C4, C5, C7, C8, C9 and C10 are all
  absence assertions. This is the eighth epic in a row to have to say so, and EPIC-043 wrote three
  that could never fail.
- **`mkdirSync`'s `mode` does nothing when the directory already exists**, and is masked by the
  umask when it does not. The check after the fact is the load-bearing half, not the mode argument.
- **Do not widen `WarningCode`.** `frozen.test.ts` will say so, and ruling 7 is why it should.
- **`apps/web/e2e/env.mjs` holds the placeholders `next start` needs.** Do not write a fifth copy.
- **After rebuilding, prove the server is the build you just made** — `apps/web/.next/BUILD_ID`
  appears verbatim in the HTML. Lesson 17.
- **No named inner function inside a `page.evaluate`** in a `.mts` drive. Lesson 9.
- **Do not seed the drive's data.** Create the project, the prompt and the bloks by clicking.
- **A rate-limit test that runs after another rate-limit test shares the window store.** Call
  `resetLimitsForTest()` in `beforeEach`, and make one test prove the reset works, or the suite's
  order becomes an input.
- **EPIC-056 is next and is not reachable** — `docs/decisions/GATE-5.md` says why, and a run that
  reaches it writes a `BLOCKER`.
