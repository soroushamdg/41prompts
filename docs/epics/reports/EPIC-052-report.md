<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# EPIC-052 — report

`@41prompts/sdk`: `resolve()`, three caches, a background refresh, and a frozen public API.
Built 2026-09-17 on `epic/052-sdk-ts`. Epic file: `docs/epics/EPIC-052-sdk-ts.md`. Plan:
`docs/epics/plan-EPIC-052.md`.

---

## 1. What is true now that was not true before

**A program outside this repository can hold a 41Prompts prompt.** EPIC-050 froze the artifact
format; EPIC-051 published one; until today nothing had ever read one.

`npm install @41prompts/sdk`, `createClient({ apiKey })`, `resolve("pr_…", vars)` — and the compiled
prompt comes back with the variables bound, from memory, or from a disk cache that survived the last
restart, or from what the deploy bundled. **Never from a network call the caller had to wait for.**
When a new version is published, a process that has been running for a week picks it up in about
thirty seconds without a redeploy. When the service is unreachable, the same call keeps answering.

The Stage 5a demo, run end to end in the drive: *stop the service; the app still answers. Start it;
publish v2; the app changes.*

---

## 2. Acceptance criteria, each with its evidence

| | criterion | evidence |
|---|---|---|
| C1 | resolve order: memory → disk → bundled | `resolve.test.ts` "prefers memory to bundled once something has been fetched", `disk.test.ts` "round-trips" |
| C2 | offline returns bundled | `resolve.test.ts` "offline returns the bundled artifact" + "returns nothing when there is no cache, nothing bundled and no network" |
| C3 | stale serves old then refreshes, first call proved not to wait | `refresh.test.ts` "answers from what it holds while the new version is still in flight" — every response held open, the call still returns v1 |
| C4 | 1,000 concurrent → one fetch | `refresh.test.ts`, both cases: 1,000 resolves and 1,000 concurrent `refresh()` calls each produce **1** marker request and **1** artifact request |
| C5 | never-throw fuzz | `never-throws.test.ts`, 6 cases, 32 generated values in every position of every exported function — 1,024 `resolve()` calls alone |
| C6 | hash mismatch rejected, with a positive control | `verify.test.ts`, 3 cases; the control is the **first** test in the file |
| C7 | every network answer is a warning, never an exception | `network.test.ts`, 10 cases: 401, 403, 404, 500, 502, socket error, non-JSON body, a body that fails halfway, a marker naming another prompt, a wrong hash |
| C8 | variable validation | `resolve.test.ts` "variable validation", 5 cases, including `{{other}}` as a *value* and a non-primitive being skipped |
| C9 | disk cache round-trips and degrades | `disk.test.ts`, 9 cases, including a path-traversal id, an unwritable directory and a corrupt file |
| C10 | telemetry off by default; on, one header and no extra request | `telemetry.test.ts`, 4 cases — the request **count** is asserted, not only the header |
| C11 | zero runtime dependencies, proved on the built output | `package.test.ts` "zero dependencies", 3 cases |
| C12 | bundle under 15 KB | `package.test.ts` prints `28,320 B shipped (readable) · 15,121 B minified · 6,187 B minified+gzip · budget 15,360 B` |
| C13 | the public API is exactly the frozen list | `frozen.test.ts`, 4 cases |
| C14 | `GET /v1/build/:buildHash` | `publish.spec.ts` "redirects a published build to its bytes, and 404s one nothing published" |
| C15 | the end-to-end path works against the built app with the built SDK | the drive, §5 — 17 of 17 |
| C16 | source in the monorepo, dist when published | `packages/sdk-ts/src/package.test.ts` "what npm would publish" (reads `npm pack --dry-run`), `packages/core/src/package.test.ts` |
| C17 | `pnpm forbidden-words` passes | §9; the gate's scope now **includes** `packages/sdk-ts/src` — see §6c |
| C18 | test, typecheck, lint green; `gates.mjs ci` green on the commit | §9 — 16 of 16 steps, 9m12s |
| C19 | built app, fresh user, built by clicking, screenshotted | §5 |

**All nineteen are ticked.** Two carry a qualification and both are in their own section: C12's
headroom is 239 bytes (§7), and C17's grep does not read Markdown (§6c).

---

## 3. The eight rulings, and what each cost

Full text in the epic file; each is one line in `docs/decisions/AUTONOMOUS.md`.

1. **`GET /v1/build/:buildHash` is added.** The alternative was the SDK carrying a copy of the
   store's key layout into every customer's `node_modules`.
2. **The SDK imports core and bundles it.** Zero dependencies is about the tarball. Proved by
   reading the built output, not the manifest.
3. **`resolve()` is synchronous; the network is a background loop.** The reconciliation of rule 8's
   two sentences, and the source of the one surprise in the API.
4. **The hash is checked against the marker as well as against itself.** The second check is the one
   that catches a correct artifact from last week.
5. **Telemetry is a header on a request already being made.** The roadmap names a client ping as the
   wrong answer; this is built so as not to be one.
6. **v1 is Node**, and says so in `engines`, the README's first line, and ADR-006 §5.
7. **`publishConfig` settles EPIC-013's parked question.** Source in the monorepo, dist when
   published. The Turbopack alias stays, and the reason is that it was never about publication.
8. **ADR-006 freezes three functions** and says what a major version means, in five items.

---

## 4. What is deliberately not in this epic

1. **Publishing to npm.** EPIC-056 owns the split, the trusted publishing and the IP assignment, and
   the `prepublishOnly` guard still refuses until `github.com/41prompts/41prompts` exists. This epic
   makes the package publishable. **Nothing was published and nothing can be.**
2. **`41p pull`, codegen and the file `bundled` is read from.** EPIC-053. This epic accepts the
   documents; producing them is the CLI's job. The drive fetches one over HTTP to stand in.
3. **The Connect page, the API-keys tab.** EPIC-055's task line, verbatim. **The API key is still
   the one thing in a drive that cannot be created by clicking**, so this drive mints it directly,
   as EPIC-051's did.
4. **A browser or edge build.** ADR-006 §5.
5. **"Apps resolving."** Unchanged from EPIC-051 §4.1 — it needs CDN access logs, which need a CDN,
   which is Soroush's step. **Human-blocked**, and this epic adds no client ping because the roadmap
   names one as the wrong answer. GATE 5's demand measure still cannot be read.
6. **Signing, rate limiting, dependency confusion.** EPIC-057.

---

## 5. The browser drive

`npx tsx scripts/drive-epic-052.mts` against `next start` on port 3112, from a real
`turbo run build`. **17 of 17.** Screenshots and output in
`docs/epics/reports/screenshots/EPIC-052/`.

**The server was proved to be the build just made** before anything was driven — `HANDOVER` lesson
17, which cost EPIC-051 an hour. `/healthz` cannot say so locally (`commit` is `unknown` with no
`COMMIT_SHA`), so the proof is the build id: `apps/web/.next/BUILD_ID` is `ULZwP3Y0rpsFoRn9M2Y4j` and
that exact string is in the HTML the server returned.

**This epic ships one route and no page**, so the *visual* half is the EPIC-030 shape: the landing
page is loaded and probed for real computed styles as a build-regression check, with a control that
the probe can fail (`--no-such-token` reads empty). That is what those first three checks are, and
they are not a claim that a feature was looked at.

**The half that is not the EPIC-030 shape is the library.** A real Node process imports
`packages/sdk-ts/dist/index.js` — the file `publishConfig` names, not `src/` — and resolves a prompt
this drive published a moment earlier, over HTTP, with a real key:

```
PASS  the first call on a cold process returns without waiting for the network — status unavailable, source none
PASS  after one refresh it resolves the Live prompt with the variable bound — status ok, source memory, v1, 107 chars
PASS  a missing required variable is refused rather than shipped with a hole in it — status unavailable, missing [customer_name]
PASS  a second version publishes to a different address — d40ca9305de9… vs 807e712f9e69…
PASS  the running process serves the old version while the new one is unfetched — still 807e712f9e69…, v1
PASS  and picks the new one up without a restart or a redeploy — now d40ca9305de9…, v2
PASS  a new process with no network resolves from the disk cache — status ok, source disk
PASS  with no network and no cache, it resolves what the deploy bundled — status ok, source bundled
```

The prompt, the project and the variable were all created by clicking, per `docs/AUTONOMOUS.md`.
`resolved.txt` holds the text the SDK produced.

**What the local drive does not cover**, so no line above reads as more than it is: the image build,
the Coolify environment, Traefik, migrations against the real database, and R2 or a CDN in front of
it. Those wait for Soroush's next push. **Staging is not evidence about any of this** — nothing since
EPIC-050 has been pushed, so staging is serving an older commit.

---

## 6. Four defects, and where each came from

### 6a. `/v1/blob`'s ETag could never change, and no SDK would ever have seen a publish again

**The worst of the four, and it was in EPIC-051's code.** The route derived the `ETag` from the
object's **key**. For an artifact that is the same thing — the key *is* the content hash — and for a
**marker** it was silently wrong: a marker's key is its prompt id, which never changes.

Nothing had noticed because the route did not implement `If-None-Match` at all, so no conditional
request had ever been answered. `@41prompts/sdk` sends one on every background refresh. With a
constant tag **the first 304 would have been permanent**: a published version would never again reach
a running application, and the symptom would have looked like the SDK ignoring publishes rather than
like a cache header. R2 computes its tag from content and would have been right, so the two store
drivers would also have disagreed — one of them silently.

The tag is now `sha256` of the body, and the route answers 304. `publish.spec.ts` asserts both
directions: a conditional request must 304, **and must not once Live moves**. That second assertion
is the one the defect was hiding.

**How it was found:** by writing a client for the route rather than by reading it. `HANDOVER` lesson
18 — a defect can live in the seam between two features, where no test written from either feature's
spec will look.

### 6b. Three never-throw defects in `createClient`, all found by the fuzz on its first run

`createClient(null)` threw on property access. `bundled` given anything not iterable threw inside
`for…of`. A proxy whose traps throw took the constructor with it.

None is reachable from TypeScript, and **that is the point**: `CLAUDE.md` rule 8's promise is about
every caller, and the typed ones were never the risk. Every option is now read through one `option()`
helper that handles null, undefined and a throwing trap; `bundled` requires an array and says so.

### 6c. The forbidden-word gate did not look at the SDK, and then eleven strings failed it

`scripts/forbidden-words.mjs` scanned `packages/ui/src`, `apps/web/app` and `apps/web/lib` —
everything a browser renders, and nothing else. **A warning an SDK writes into a customer's log is
about as close to a string a customer reads as a non-rendered one gets**, which is the argument
`lib/deploy/store.ts` already made in EPIC-051 when it named its keys `builds/` rather than
`artifacts/`.

`packages/sdk-ts/src` joined the gate's roots and eleven strings failed immediately. All eleven now
say **build**. No type name changed: `Artifact`, `artifactOf` and `buildHashOf` are a frozen public
contract (ADR-005) and ADR-003 marks *artifact* "(UI only)".

**`README.md` is not in the gate's scope**, and this is the qualification on C17. The gate reads
`.ts` and `.tsx`; teaching it Markdown — headings, fenced code, link text, a word inside an
identifier in an example — is a different gate from the one that exists. The README was brought into
line **by hand** instead: it contains the word *artifact* zero times.

### 6d. A literal NUL byte in a source file, caught before it was staged

`never-throws.test.ts` fuzzes with `"\u0000"`, and the file as written to disk contained the **byte**
rather than the escape. Git would have treated the file as binary and shown no diff for it — which is
precisely the mechanism `pnpm binary-files` and `.gitattributes` exist for (EPIC-031, CI #202).

Found by reading the bytes with `od -c` rather than by trusting the rendering, and fixed before the
first `git add`. `pnpm binary-files` confirms: *"No source file under packages, apps is binary (681
checked, including staged and untracked)."* Worth noting that **`grep -P` is not available on macOS**,
so the obvious probe silently found nothing; `od` is what answered.

---

## 7. The bundle budget has 239 bytes of headroom, and that is thin

`docs/roadmap.md`'s Review line says *"Bundle under 15 KB"*. Measured on every test run:

```
28,320 B shipped (readable) · 15,121 B minified · 6,187 B minified+gzip · budget 15,360 B
```

The assertion is on the **minified** number against 15 × 1024, which is the strictest honest reading.
239 bytes is roughly six lines of code. **The next feature in this package very likely breaks this
gate**, and the correct response is to measure what got in rather than to widen the number — a Review
line is not a thing to relax because it became inconvenient.

Where the bytes are: about 4.4 KB is `@41prompts/core` (SHA-256, the canonical encoder, and the
variable binder), and the rest is this package. There is no obvious fat; the long warning strings are
a few hundred bytes and they are the difference between a debuggable SDK and a silent one.

**ADR-006 §"Open, for Soroush" item 1 asks the question this raises**: is the budget about the
minified bytes or the gzipped ones? Both numbers are printed on every run either way.

---

## 8. What this epic inherits and does not fix

**A bundled artifact has no version number.** `LiveMarker.version` is on the marker, not on the
artifact — `artifact/schema.ts` puts it there deliberately, because an artifact is immutable and the
same bytes can be Live twice with different numbers in front of them. So a `resolve()` answered from
`bundled` returns `version: null`.

That is honest rather than unfortunate: whoever ran `41p pull` knows which version they bundled, and
the artifact does not. **It becomes EPIC-053's question**, because the bundled file it writes is the
natural place for the marker facts to travel alongside the artifact.

**Variables are still not versioned** (EPIC-051 §8), unchanged here. The SDK reads the variable
declarations *frozen into the artifact*, so a resolve is always consistent with the build it came
from; what remains untrue is that re-publishing an old version reproduces its artifact.

---

## 9. Verify commands, with the output

```
$ pnpm test
  @41prompts/cli   PASS · @41prompts/core PASS · @41prompts/db  PASS · @41prompts/logger PASS
  @41prompts/sdk   PASS · @41prompts/ui   PASS · @41prompts/web PASS · @41prompts/worker PASS
  database: throwaway container
  8 checked, 8 passed

$ pnpm typecheck
  8 checked, 8 passed

$ pnpm lint
  11 checked, 11 passed
  Forbidden-word grep clean (packages/ui/src, apps/web/app, apps/web/lib, packages/sdk-ts/src).

$ pnpm --filter @41prompts/sdk test
  Test Files  9 passed (9)
       Tests  66 passed (66)

$ pnpm e2e
  235 passed, 4 skipped (6.1m)
  4 of 239 tests did not run on darwin. A skip is not a pass. — the Linux-only visual baselines

$ node scripts/gate-run.mjs        # resolves to gates.mjs ci
  gate: scripts/gates.mjs advertises ci, which reproduces CI, so it runs alone
  16 step(s), all passed, 9m12s      (on e42de30)

$ npx tsx scripts/drive-epic-052.mts
  17 of 17 passed
```

**The first CI-parity run was red**, on `80922309`, and it is worth recording because nothing else
could have caught it: `pnpm install --frozen-lockfile` failed and took eight steps down with it.
`@types/node` had been added to `packages/sdk-ts/package.json` after the install that wrote the
lockfile, and **every local gate kept resolving it from the workspace root**, where it has lived all
along. A fresh clone has no such root to borrow from. That is `docs/PROCESS.md`'s "Local green is not
CI green" class — a sixth mechanism, and a structural one. Fixed in its own commit rather than by an
amend, per the local-pipeline rule.

### What the green does not cover, from the gate's own closing block

1. **The runner is Linux and this is darwin.** The four visual-regression baselines are `-linux.png`
   and their specs skip here. A layout change can pass this run and fail on Linux (CI #206).
2. **The runner is slower.** A test that only fails under load passes here for the same reason it
   passed before (CI #209).

And the three this project's own process adds, since nothing is pushed: no second machine builds the
code, no image is built, and nothing is deployed — so the `Dockerfile`, the Coolify environment,
Traefik and the real database are all untested by everything above.

---

## 10. Dependencies

**No new runtime dependency anywhere.** `@41prompts/sdk` ships with no `dependencies`,
`peerDependencies` or `optionalDependencies` key at all, and `package.test.ts` proves it from the
built output.

Two new **devDependencies**, both in `packages/sdk-ts`, neither shipped:

| | why |
|---|---|
| `esbuild` ^0.25.12 (MIT) | bundles `@41prompts/core`'s reachable modules into `dist`, which is what makes "zero dependencies" and "one implementation of the hash" hold at the same time. Already in the tree transitively through `tsx` and Vitest. |
| `@types/node` ^22.20.1 (MIT) | the disk cache is `node:fs`; `tsconfig.base.json` sets `types: []`, so a package that touches a builtin has to ask for them. |

`@41prompts/core` is also declared as a devDependency (`workspace:*`). It is a sibling public package
that rule 11 permits importing, and it is inlined at build time rather than installed alongside.

`license-gate` is unchanged: *"0 public-package dependencies, 564 total in the workspace, 17
private-only warning(s)"*.

---

## 11. Open, and who owns it

| what | owner |
|---|---|
| **The bundle budget's 239 bytes of headroom.** Minified or gzipped — which does "15 KB" mean? ADR-006 open question 1. | Soroush |
| **`configure()` and a module-level `resolve()` are a singleton.** Kept because the roadmap writes the API as `resolve()`. ADR-006 open question 2. | Soroush |
| **The default `console.warn`, once per code.** Silence was the alternative. ADR-006 open question 3. | Soroush |
| **`41p-client` as the telemetry header name** — a public wire format the moment anyone opts in, and not in ADR-003 either way. ADR-006 open question 4. | Soroush |
| **An R2 bucket and a CDN**, `R2_BUCKET_ARTIFACTS` and `R2_PUBLIC_BASE_ARTIFACTS`. Unchanged from EPIC-051. Without them there are no access logs and **"apps resolving" cannot exist**, which is part of GATE 5's demand measure. | Soroush |
| **Nobody has reviewed the hand-written SHA-256**, and as of today it is what a customer's SDK verifies every artifact with. EPIC-057's external review hour. | EPIC-057 |
| **A bundled artifact has no version** (§8). The natural fix is in the file `41p pull` writes. | EPIC-053 |
| **Where the two JSON Schema documents are served from.** Unchanged: EPIC-072, once. | Soroush |
| **`▣ GATE 3`'s backlog status cell is still `—`** while `docs/decisions/GATE-3.md` records it as decided. `pick-next-epic.mjs` reads the cell. One word; `docs/backlog.md` is his file. | Soroush |
| **A release is overdue.** Seven epics have merged since the last one — 040, 041, 043, 042, 050, 051, 052 — against `docs/AUTONOMOUS.md`'s three. `node scripts/release-due.mjs` regenerates the stale file. | Soroush |

---

## 12. Merge

`git merge --no-ff` into local `main`. **Nothing pushed, no pull request, no tag.**

Commits on the branch:

| | |
|---|---|
| `690b96f` | the SDK: `resolve()`, the three caches, the frozen surface |
| `ec937d6` | `GET /v1/build`, the ETag that could never change |
| `8092230` | the epic file, the plan, ADR-006 |
| `e42de30` | the lockfile fix the CI gate found |
| `c3e3a96` | the drive, and the assertion it got wrong about itself |

---

## 13. A release is still overdue, and it is not this epic's to cut

`docs/AUTONOMOUS.md` stops the loop after every third completed epic. This is the **seventh** since
the last release. Every one of them is on local `main` and on no remote, so the gap grows against
both staging and production and nothing in the loop closes it.

Cutting it starts with a `git push` only Soroush can make. `RELEASE-DUE.md` was generated at `f3fa8a2`
and is stale; `node scripts/release-due.mjs` regenerates it.
