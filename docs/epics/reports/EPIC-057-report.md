<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# EPIC-057 — report

**Built 2026-09-17 by Claude Code, in the advisor's chair for the epic file as well** (no advisor was
relaying; `docs/PROCESS.md`'s amendment of 2026-09-15, and the precedent EPIC-040 to EPIC-055 set).
Twelve rulings, all in `docs/decisions/AUTONOMOUS.md`.

**In one paragraph.** The published-prompt delivery path now has a written threat model with six
triaged findings, and the three weaknesses that modelling it found are closed in code with tests
that fail against the old behaviour. `/v1` is rate limited — all four routes, per key and per hashed
address, `429` with `Retry-After` — where it had no limit at all. `fortyone` refuses a cache
directory other users can write, which is the mitigation for the finding this epic exists to have
found: **a content address is not a signature**, so anyone who can write where an SDK reads can write
any prompt text and compute the matching `buildHash` themselves. A mismatched build is now proved
refused *at the seam* rather than in a unit test. **Two things did not go as planned and both are in
here rather than smoothed over**: ADR-006's 15 KB bundle budget refuses all three of
`@41prompts/sdk`'s mitigations by a measured margin, so they are owed rather than shipped (§4.2); and
my own first version of the rate limiter was a way for a stranger to lock a customer's whole fleet
out of the API, which the browser drive found before the drive was written (§4.3).

---

## 1. What was built

| | |
|---|---|
| `docs/security/sdk-threat-model.md` | The document. Six threat classes, trust boundaries, what is deliberately not defended against, six findings with severities, an operator's procedure, why there is no signature, and five paste-ready backlog rows with an owner each. |
| `apps/web/lib/rate-limit.ts` | The fixed-window limiter, **moved** out of `lib/decompile/` rather than copied. |
| `apps/web/lib/deploy/v1-limits.ts` | `/v1`'s two buckets, three named limits, and the `429`. |
| the four `/v1` route handlers | Each one calls the limiter. |
| `sdks/python/fortyone/_disk.py` | The cache directory is created `0o700` and checked before it is read. |
| `sdks/python/fortyone/_network.py`, `__init__.py` | A `429` is honoured, process-wide, with `Retry-After`. |
| `apps/web/lib/deploy/artifact-substitution.test.ts` | The mismatched build, refused through the real publisher, store, routes and SDK. |
| `packages/sdk-ts/src/redirect.test.ts` | `fetch` really does drop `Authorization` across an origin — measured for the first time. |
| `apps/web/sdk-threat-model.test.ts` | The document keeps its shape: six classes, every finding triaged, every `high` finding owned. |
| `scripts/drive-epic-057.mts` | The drive. 17/17 against the built app. |

**No new third-party dependency.** One workspace devDependency: `@41prompts/sdk` in `apps/web`, for
the seam test, with the reason in §4.4.

---

## 2. Acceptance criteria

| | criterion | evidence |
|---|---|---|
| ✅ | **C1** six threat classes covered | `apps/web/sdk-threat-model.test.ts` → "the six threat classes the roadmap names", 7 tests including the control that removes finding 6 and asserts the walk notices |
| ✅ | **C2** every finding triaged; every `high` finding has a paste-ready row | same file → "every finding is triaged" and "every high finding has an owner and an epic", 9 tests, with controls for an untriaged finding, an orphaned `high` finding and an empty owner cell |
| ✅ | **C3** the marker endpoint is rate limited | `lib/deploy/v1-limits.test.ts` → "an authenticated caller, on the key bucket", 4 tests. Driven: `429` after 61 requests, `Retry-After: 3600` |
| ✅ | **C4** an unauthenticated caller is limited on a tighter bucket; `/v1/blob` by address; **a stranger cannot lock out a customer** | same file → "a caller with no usable key" (3) and "a stranger filling the address bucket" (2). Driven: same address answers `302` with a key after being refused without one |
| ✅ | **C5** all four routes are limited | same file → "every /v1 route calls the limiter", 7 tests: the walk finds four, the pattern can be false, the ordering is asserted, and the removed function is named |
| ✅ | **C6** a mismatched build is refused at the seam | `lib/deploy/artifact-substitution.test.ts`, 5 tests. Driven: one byte changed, `hash_mismatch`, restoring it restores the resolve |
| ⚠️ | **C7** the disk cache is owner-only | **`fortyone` only.** `sdks/python/tests/test_disk.py`, 8 new tests. **`@41prompts/sdk`'s half is owed** — §4.2, ruling 11, and `docs/security/sdk-threat-model.md` §8 row 057a |
| ✅ | **C8** the 15 KB budget measured against each mitigation, numbers in the report | §4.2's table, four variants. `pnpm --filter @41prompts/sdk test` prints all three figures every run |
| ⚠️ | **C9** a `429` is honoured | **`fortyone` only.** `sdks/python/tests/test_rate_limited.py`, 8 tests. **`@41prompts/sdk` does not** — §4.2; its behaviour under a limit is stated in §4.2 and in the document's finding 5. There is also no `rate_limited` warning code, and §4.5 says why that is *not* a freeze |
| ✅ | **C10** `fetch` drops `Authorization` across an origin | `packages/sdk-ts/src/redirect.test.ts`, 4 tests, with the same-origin control |
| ✅ | **C11** the document says what a green build does not prove | `sdk-threat-model.test.ts` → "the document says what it does not prove", 6 tests |
| ✅ | **C12** `pnpm test`, `typecheck`, `lint` green with every package reporting; `gates.mjs ci` green | §3 |
| ✅ | **C13** the drive | 17/17, §5, screenshots in `docs/epics/reports/screenshots/EPIC-057/` |
| ⛔ | the roadmap's **external review hour** | **Not done, and not ticked.** §8. It needs a person who is not this run |

**C7 and C9 are narrowings, not omissions**, and both were decided rather than discovered late:
ruling 11 measured the budget four ways before reverting working code. Nothing is ticked on the
intention.

---

## 3. Gates

```
pnpm test        9 checked, 9 passed         database: throwaway container
pnpm typecheck   9 checked, 9 passed
pnpm lint       12 checked, 12 passed        (incl. dependency-cruiser, turbo boundaries,
                                              forbidden-word grep)
pnpm binary-files   1051 files checked in full, exit 0
```

Package-by-package, which is what `docs/PROCESS.md` asks be pasted rather than the word "clean":

| package | test | typecheck | lint |
|---|---|---|---|
| `41p` | PASS | PASS | PASS |
| `@41prompts/cli` | PASS | PASS | PASS |
| `@41prompts/core` | PASS | PASS | PASS |
| `@41prompts/db` | PASS | PASS | PASS |
| `@41prompts/logger` | PASS | PASS | PASS |
| `@41prompts/sdk` | PASS | PASS | PASS |
| `@41prompts/ui` | PASS | PASS | PASS |
| `@41prompts/web` | PASS | PASS | PASS |
| `@41prompts/worker` | PASS | PASS | PASS |

No `PARTIAL`. `apps/web`: 642 tests. `packages/sdk-ts`: 76. `sdks/python`: 289, plus
`mypy --strict` clean over `fortyone` and its suite.

**`node scripts/gate-run.mjs`** — it resolved to `gates.mjs ci`, which reproduces CI: fresh
`git clone` of the commit, `pnpm install --frozen-lockfile`, cold turbo cache, no inherited
environment, its own throwaway Postgres, every gate both workflows run in the order they run them.

### 3.1 The CI-parity run — green, on the commit, all sixteen steps

Run **twice**, because `PROCESS.md` says the gate's answer is about a specific commit and no other.
The first was on `8a0ad293` (the drive); the report, the session log and the ruling-7 correction
landed after it, so it was re-run on `7766ae22` and that is the one this epic merges on. Both green,
16/16, 10m46s and 10m49s. The table below is the second run.

```
CI mode — every gate CI runs, every result
--------------------------------------------------------------------
  checkout
    git clone + checkout 7766ae22       PASS        0m02s
  ci.yml
    pnpm install --frozen-lockfile      PASS        0m07s
    pnpm lint                           PASS        0m25s
    pnpm typecheck                      PASS        1m02s
    pnpm db:migrate                     PASS        0m02s
    pnpm test                           PASS        0m57s
    playwright install chromium         PASS        0m01s
    pnpm e2e                            PASS        6m27s    4 test(s) skipped on darwin
    uv run pytest -q (sdks/python)      PASS        0m27s
  compliance.yml
    reuse lint                          PASS        0m04s
    pnpm boundaries                     PASS        0m06s
    turbo boundaries                    PASS        0m01s
    pnpm forbidden-words                PASS        0m01s
    pnpm binary-files                   PASS        0m01s
    license-gate --sbom                 PASS        0m02s
    pnpm mirror-dry-run                 PASS        1m06s
--------------------------------------------------------------------
  16 step(s), all passed, 10m49s wall
```

**And one commit landed after that run: `1a642fd`, which is this paragraph.** It changes exactly one
file, `docs/epics/reports/EPIC-057-report.md`. Rather than a third eleven-minute run, `PROCESS.md`'s
own test was applied — *ask what the gate would have checked* — and the gates that actually read a
markdown file under `docs/` were run on the head instead:

| gate | reads `docs/*.md`? | result on the head |
|---|---|---|
| `pnpm binary-files` | **yes**, and it is the gate that found two NULs in committed documents | exit **0**, 1055 files in full |
| `reuse lint` | **yes** — every file needs copyright and licence | exit **0**, 1226 / 1226 |
| `pnpm test` | only through `sdk-threat-model.test.ts`, which reads `docs/security/…` and not this file — run anyway, because EPIC-050's lesson 15 is a docs-only commit going red in another package's tests | exit **0**, 9/9 |
| `pnpm forbidden-words` | **no** — its roots are five source trees and `sdks/python/fortyone`, and its extensions are `.ts`, `.tsx`, `.py` | not applicable |
| `pnpm lint`, `typecheck`, `e2e`, `mirror-dry-run`, `license-gate`, `boundaries` | **no** — no source, no manifest, no lockfile, and the mirror does not contain `docs/` | not applicable |

Stated rather than assumed, because *"the question is whether the gate would have told you something,
not whether it ran"* cuts both ways: it is only an argument if the answer is written down. **The merge
is on `7766ae22`'s green plus this table.** Anything touching code after a green gate gets a fresh
run, not a table.

**Two of the sixteen are worth naming rather than scanning past.**

`pnpm mirror-dry-run` **passed**, which is the gate that would have caught this epic's most likely
structural mistake: `PROCESS.md`'s *"Local green is not CI green"* failure #1 is a test in a public
package reading a path the mirror filters away, and lesson 28 is the same thing again. Both new
repo-level tests — `sdk-threat-model.test.ts` reading `docs/`, and `artifact-substitution.test.ts`
importing `packages/db` — are in `apps/web`, which the mirror does not contain, and the dry run
confirms the filtered tree still installs and passes 289 Python tests standalone.

`pnpm e2e` took **6m27s** against the 2m40s `PROCESS.md` records — the suite is 264 tests now, not
178 — and the run is longer overall (10m49s against the measured 5m39s–6m31s). The added suites account for it; nothing was investigated
because nothing failed, and it is recorded here so the next person reading that table is not
surprised.

### 3.2 What a green here still does not cover

`gates.mjs ci` prints this block every time and `PROCESS.md` says it is part of the result, not a
footer. For this epic:

1. **The runner is slower.** Nothing here is timing-sensitive, but the same caveat applies.
2. **The runner is Linux, and this epic has a Linux-specific finding.** The four visual baselines
   skip on darwin, as always — **and more importantly, finding 3's exposure *is* the Linux case*.*
   `tempfile.gettempdir()` is `/tmp` at mode `1777` on Linux and a private `/var/folders/…/T` at
   `700` on macOS, so the platform where the cache is actually exposed is the one neither the gate
   nor the drive ran on. The mitigation's tests `chmod` a real directory and are platform-independent
   — they pass on macOS and would pass identically on Linux — but the *threat* was reproduced by
   reading `/tmp`'s mode in a Linux container, not by being attacked there.
3. **A `pull_request` run tests the merge, not the branch tip.** Nothing is pushed, so there is no
   such run at all.

And the things no local gate covers, stated so no reader infers otherwise: no image build, no
Coolify environment, no Traefik, no migrations against the real database, no CDN, no second machine.

---

## 4. What went differently, and what it cost

### 4.1 The finding the epic exists to have found: a content address is not a signature

`disk.ts` has said since EPIC-052 that *"a file on disk is not ours in any sense that matters"*, and
re-verifies `buildHash` on every read. **The sentence is right and the conclusion drawn from it was
too weak.** Re-deriving a content address proves a document is *intact*. It proves nothing about
whose it is: `buildHash` is a SHA-256 of the document's own canonical encoding, so anyone who can
place bytes where an SDK reads them can write any prompt text they like, compute the matching hash
themselves, choose the `promptId` too, and hand over a document that passes **every check either SDK
makes**. A prompt is instructions to a model, so that is arbitrary instruction injection with our
name on the delivery mechanism — and no warning anywhere.

Measured on both platforms rather than reasoned about:

| | `tmpdir()` | mode | consequence |
|---|---|---|---|
| Linux, and every container | `/tmp` | `1777` | world-writable and sticky. The sticky bit stops another user **deleting** our directory once it exists; it does nothing to stop them **creating it first**, and whoever creates it sets its mode |
| macOS | `/var/folders/…/T` | `700` | already private per user, so the exposure is a Linux one — which is where this ships |

And the fix that does not work alone: **`mkdir(mode=0o700)` does nothing to a directory that already
exists.** An attacker-created `0777` stays `0777`; measured. So the mode is not the control and the
`stat` afterwards is — which is why the mitigation is two things and not one.

### 4.2 ADR-006's 15 KB budget refuses all three TypeScript mitigations, and ADR-006 said what to do

The three mitigations were **written, working and tested** before this was discovered, which is why
the numbers below are measurements rather than estimates. `esbuild --minify` over `dist/index.js`,
budget 15,360:

| variant | minified | against budget |
|---|---|---|
| baseline, as EPIC-054 left it | 15,121 | **239 spare** |
| + the cache-directory check, written as tightly as it honestly can be | 15,411 | **51 over** |
| + a 429 back-off and a post-read body-size refusal as well | 16,304 | 944 over |
| + a streaming body reader, the only version that bounds the allocation | 16,590 | 1,230 over |

**The cheapest single mitigation is 290 bytes and there are 239.** Not close, and not a coding
problem: a module-level breakdown shows `client.ts` 3,450 B, `verify.ts` 1,756 B, core's `sha256.ts`
2,178 B and `canonical.ts` 1,416 B, all load-bearing, with tree-shaking already dropping everything
else.

**ADR-006 predicted this and wrote the answer**, in Consequences:

> The bundle budget is measured on every test run and currently has **206 bytes of headroom**. The
> next feature in this package very likely breaks it, and **the correct response is to measure what
> got in — not to widen the number, which is a Review line.**

And §6 settles the reading: *"The Review line's 15 KB budget is measured on the minified bytes,
because that is what their bundler emits."* So the gzipped figure — 6,187 B, well under half the
budget — is not an escape, and neither is editing the test's constant.

**So the code was reverted and the finding shipped instead.** What ADR-006 did not anticipate is
*which* feature would hit the wall first: it expected a feature, and the first casualty is a **fix**,
the most serious one this epic found. A Review line correctly refusing to be widened for a
convenience is a different question from one refusing to be widened for a security control, and that
question is yours. §8 row 057a names the three options.

**The consequence, stated rather than glossed: the two SDKs now have different security postures**,
and the more exposed one is the majority. A Python process refuses a cache directory other users can
write and honours a `429`; a Node process does neither — under a limit it warns on the `network`
code with the status in the message, keeps serving from memory, and asks again next interval, so no
customer loses a prompt. `sdks/python/README.md`'s divergence table carries both rows in a section of
their own rather than among the naming rows. Withholding a working fix from Python to keep the two
symmetrical would have helped nobody.

### 4.3 My own rate limiter was a way to lock a customer out, and the drive found it before it existed

`v1-limits.ts`'s first version — written, tested and committed in `bca55ab` — refused an address that
had spent its sixty unauthenticated requests **before** `keyFromRequest` ran, so that somebody trying
keys did not buy an indexed database lookup per attempt. Ruling 3 argued for it. It is a worse defect
than the one it prevented:

- **A pre-auth gate sees an address and nothing else.** A customer's fleet shares its egress address
  with everything else behind that NAT — so **anyone could have deliberately spent a target's sixty
  requests and had that customer's entire fleet refused before it was even authenticated.** A
  targeted denial of service against the asset finding 5 is about, introduced by the mitigation for
  it.
- **And it bounded almost nothing**, checked rather than assumed: `keyFromRequest` answers
  `missing_key` with **no query** when there is no header, and `apiKeyForPlaintext` refuses a
  malformed token through `environmentOfPlaintext` **before** it reaches one. Only a well-formed
  `41p_live_…` token costs a lookup, and a key is 128 bits of `randomBytes`, so guessing is not the
  threat. Volume is, and counting failed authentications against the address bounds volume.

**How it was found is the part worth keeping.** Not by a test — every test of the pre-auth version
passed, because each was written from the same mistaken premise, which is `PROCESS.md`'s *"a test
written from the implementation asserts the implementation"* in its purest form. It was found by
asking **how the browser drive would demonstrate the limit**, and noticing the demonstration would
have to show a customer being locked out by a stranger. That is the browser-drive rule earning its
place before the drive was written.

The regression test names the removed function so a later edit cannot reintroduce the shape by
copying an old diff, and the drive asserts it against the running server.

### 4.5 A ruling whose stated reason was wrong about an ADR, corrected before it landed

Ruling 7 originally said a `429` keeps the `network` warning code because `WarningCode` is frozen by
ADR-006 §1 and widening an output union breaks callers. **ADR-006 §7 says the opposite, in as many
words:**

> Not a major version: … adding a `WarningCode` … **Adding a `WarningCode` is explicitly minor** — a
> caller who switches exhaustively on it will get a type error, and that is the right trade against
> never being able to name a new failure.

So a new code is permitted and, by the ADR's own preference, encouraged — and it costs **zero bundle
bytes**, because `WarningCode` is a type and is erased.

**The real reason is ruling 11, and it is a better one.** `@41prompts/sdk` ships no `429` handling at
all, and `test_divergence.py` holds both languages' unions identical — so adding `rate_limited` now
would declare a warning code in the TypeScript surface that nothing there can ever raise, in the SDK
most customers use. Somebody would write a `case` for it in Node and wait for ever. The code arrives
**with** the behaviour, in row 057a.

Recorded here because the wrong version was a claim about an ADR that a future reader would have
acted on. It is corrected in the epic file, the decision ledger row, `_network.py`'s comment and the
threat model's finding 5.

### 4.4 Three smaller things

**The NUL byte, for the third time, in the line that warns about NUL bytes.**
`apps/web/lib/rate-limit.ts` carried real NUL bytes at offsets 4298 and 6074 — both in the
bucket-key expression whose own comment explains why the source must carry the escape rather than the
byte. `\u0000` in a template literal and a raw NUL produce the identical string at runtime, so all 29
rate-limit tests passed either way and both `tsc` and `eslint` were happy. `.gitattributes` is why
the diff was legible this time.

**And I nearly shipped it, for a reason that generalises.** The gate was run as
`pnpm binary-files 2>&1 | tail -3 && git commit`, and a pipeline's exit status is the *last*
command's — `tail` succeeded, `&&` proceeded, and a commit went through while the gate was red.
Lesson 24 is "run the local gate again after writing the last file"; the companion is **read its
exit code, not its last three lines.**

**`pnpm forbidden-words` caught a real one.** The `/v1/blob` limit's name is interpolated into the
message a caller reads, and it said "artifact", which ADR-003 forbids in a UI string. It says
"build".

**A new workspace devDependency, with its reason.** `@41prompts/sdk` in `apps/web`'s
`devDependencies` — a workspace package, not third-party, deliberately not in `dependencies` because
nothing this app serves imports it. A repo-level test crossing two packages has to live in
`apps/web`: `packages/sdk-ts` may not import `packages/db` under `CLAUDE.md` rule 11, and a test in a
public package may only read the public tree (lesson 28).

---

## 5. The drive

`npx tsx scripts/drive-epic-057.mts` against `next start` on a real build — BUILD_ID
`eoYkF2AFZ3qriiwNEJvk8` found verbatim in the served HTML (lesson 17). A fresh throwaway user;
project, prompt, two bloks, publish and API key all created **by clicking**. **17 of 17.**

```
PASS  the server answering is the build just made — BUILD_ID eoYkF2AFZ3qriiwNEJvk8 is in the HTML
PASS  a project and a prompt were built by clicking — proj_a00f / pr_3b21f532
PASS  the prompt is Live — Deploy says Live v1
PASS  a key was minted through the keys page — 41p_live_…da12 — minted by clicking
PASS  an unauthenticated request is 401 while the budget lasts, not 429
PASS  the marker endpoint answers 429 once the unauthenticated budget is gone
        — 429 after 61 requests, Retry-After: 3600 seconds
PASS  an authenticated caller from that same address is still served — ruling 12
        — with the key, the same address answered 302
PASS  a well-formed wrong key is 401, on a fresh address
PASS  a real @41prompts/sdk client resolves the prompt the browser just published
PASS  one byte of the stored build was changed, and only one — length 872 → 872
PASS  the same client refuses the substituted build with hash_mismatch
PASS  and it does not hand the substituted text to the caller
PASS  restoring the byte restores the resolve — the control for the refusal
PASS  fortyone creates its cache directory owner-only — mode 0o700
PASS  a second process reads that cache from disk — the control
PASS  and the same cache is refused once other users can write it
PASS  the refusal is a warning and never an exception — rule 8 — python3 exited 0
```

**The order is the assertion, twice.** The unlimited path is asserted before the bucket is
deliberately exhausted, and the untampered build before the row is changed. Lesson 12: a fixture
where everything fails cannot show a difference any more than one where everything passes can.

**The screenshots were looked at, not just captured.** `01-deploy-live-1440.png` — Live v1 beside
Draft v1, the gate's four rows each carrying a shape (✓ / △) **and** a word (Passed / For
information), Publish and Undo, the apps-calling-this-prompt paragraph that says why there is no
table, and the publish history. `02-settings-keys-1440.png` — the key as `41p_live_…da12` after its
one-time reveal, with Rotate and Revoke. `03-deploy-390.png` — the same page at phone width, no
horizontal overflow. `terminal-transcript.txt` has the real HTTP statuses, the two `psql` statements
and both SDKs' output.

**What the drive does not cover**, in its own words as well as here: the image build, the Coolify
environment, Traefik, migrations against the real database, and the CDN — there is no R2 bucket, so
the bytes come from `/v1/blob` and the redirect followed is same-origin. **Nothing is pushed**
(`CLAUDE.md`), so nothing deploys and **no staging URL is evidence about any of this.** The key rate
limit is also not driven: 20,000 an hour is not a thing to send over a loopback socket for a
screenshot, and it is the same `checkLimit` with a different constant.

---

## 6. Open questions, all yours

1. **The 15 KB budget, and whether a security fix may move it.** §4.2 has four measurements. Three
   options: move the budget, pay for the mitigations out of `client.ts`, or ship `@41prompts/sdk`
   without them. Until you decide, the two SDKs have different security postures and the Node one is
   weaker. **Row 057a.**
2. **Registering the five package names.** The only mitigation for finding 6, and the one finding
   here that **expires** — a name someone else takes first cannot be recovered, and the damage lands
   on somebody trying to install our software. Needs an npm account, a PyPI account and an
   organisation on each; EPIC-006 is `deferred`. **Row 057b**, and it is the one line to read if you
   read only one.
3. **Signing the build.** §7 of the document has the four decisions it needs, including a new one:
   Python's standard library has no signature verification at all, so this is also the first thing
   that asks whether `fortyone`'s zero dependencies or authenticity matters more. **Row 057c.**
4. **Rate limits that survive a second web container.** The window store is in process memory. True
   today, wrong the day there are two. **Row 057d.**
5. **The external review hour.** §8. **Row 057e.**
6. **`▣ GATE 3`'s status cell still reads `—`** while `docs/decisions/GATE-3.md` records the decision.
   `scripts/pick-next-epic.mjs` reads the cell, so it stopped on that row again on this epic's first
   command. One word unsticks it and `docs/backlog.md` is yours. Unchanged from EPIC-054's report.

---

## 7. Verify commands

```
pnpm --filter @41prompts/web test            # 642, incl. v1-limits, artifact-substitution, sdk-threat-model
pnpm --filter @41prompts/sdk test            # 76, incl. redirect.test.ts; prints the three bundle figures
cd sdks/python && uv run pytest -q           # 289
cd sdks/python && uv run --with mypy mypy --strict fortyone tests
pnpm forbidden-words
pnpm binary-files                            # read the exit code, not the tail
node scripts/gate-run.mjs                    # resolves to gates.mjs ci
npx tsx scripts/drive-epic-057.mts           # against the BUILT app — the header has the commands
```

---

## 8. The external review hour did not happen, and is not ticked

`docs/roadmap.md`'s Tasks line for this epic includes *"one external review hour"*. **It has not
happened.** It needs somebody who did not write the thing being reviewed; there is no such person in
an unattended run, and you have declined the comparable lawyer hour (EPIC-071, `deferred`).

`docs/AUTONOMOUS.md`: a row whose dependency is a person is **skipped, said out loud in its own
numbered section, and never ticked.** This is that section. It is not a `BLOCKER` — a blocker is an
epic that cannot proceed, and everything else here did.

**What the hour should cover, in this order**, so it is not spent deciding what to look at:

1. **`packages/core/src/artifact/sha256.ts`** — a hand-written SHA-256, in production, addressing
   every build, now read by two SDKs in two languages. `HANDOVER.md` has carried "nobody has reviewed
   the hand-written SHA-256" as an open item since EPIC-051.
2. **`canonical.ts` and `_canonical.py`** — two implementations of one encoding that must agree byte
   for byte. Pinned by a 331-case golden from Node and by core's frozen fixture, which is a strong
   test and is not a review.
3. **Finding 3.** Is a private cache directory plus a content address an adequate stand-in for a
   signature until 057c, or is 057c urgent?
4. **`packages/db/src/sealed-box.ts`** if there is time — `byo-key-threat-model.md` §7 asks for the
   same hour and the two should be bought together.

**Also not done, and also not a defect of this epic:** PyPI and npm name registration (§6.2), and
anything that needs a deploy.
