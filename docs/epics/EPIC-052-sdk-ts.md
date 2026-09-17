<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# EPIC-052: `@41prompts/sdk` — the runtime library, three rules, telemetry off
Stage: 5a · Depends on: EPIC-050, EPIC-051 · Size: M

**Written by Claude Code in the advisor's chair**, 2026-09-17, under `docs/PROCESS.md`'s amendment of
2026-09-15 and the precedent EPIC-040 to EPIC-043, EPIC-050 and EPIC-051 set. The Goal, Tasks, Tests
and Review lines below are `docs/roadmap.md`'s, unchanged; everything else is this file's reading of
them.

**This is the epic where the prompt leaves the building.** EPIC-050 froze the artifact, EPIC-051
published one. Nothing outside this repository has ever read one.

## Goal

A Node application installs one package, calls `resolve("pr_…", vars)`, and gets the Live prompt —
from memory, or from disk, or from what was bundled with the deploy, **never from a network call it
had to wait for**. When the service is down the app still answers. When a version is published the
app picks it up within a minute without a redeploy. The call never throws, whatever is wrong.

## The roadmap's four lines, verbatim

> **Goal.** The runtime library, three rules, telemetry off.
> **Tasks.** `resolve()` memory → disk → bundled → background network; never throws, `onWarning`;
> variable validation; jittered refresh with ETag; artifact sha verified against pointer; zero
> dependencies; telemetry off by default with a documented opt-in; README documents exactly what
> opt-in sends.
> **Tests.** Offline returns bundled; stale serves old then refreshes; 1,000 concurrent → one fetch;
> never-throw fuzz; sha mismatch rejected.
> **Review.** Bundle under 15 KB. Public API frozen (ADR-006).

And the paragraph carried forward from EPIC-013, which is easy to miss and is scope:

> **`packages/core` is resolved two ways in this repo.** `apps/web` reads its **built** `dist`
> through a Turbopack alias, while `tsc` and Vitest read its **source** through the unchanged `main`.
> […] this epic has to settle core's `main`/`exports` for publication anyway, and should decide then
> whether the alias goes away.

## Scope

- **`resolve()`, synchronous, four sources in order.** Memory, then the disk cache, then what the
  application bundled, then a refusal in words. **The network is never in the call path** — it is a
  background refresh that fills memory and disk, which is the only reading of `CLAUDE.md` rule 8's
  "never blocks a call on the network" that survives contact with a process that has just started.
- **Never throws.** Every failure is a `ResolveResult` a caller can read plus an `onWarning` call.
  Proved by a fuzz test that calls the whole surface with values no typed caller could pass.
- **Variable validation per call**, which is the question `artifact/compatibility.ts` says in as many
  words is *"the SDK's own variable validation […] and it belongs to EPIC-052"*. Missing required
  names are reported, defaults are applied and named, and the binding is `bindVariables()` from
  `packages/core` — not a second substituter.
- **`buildHash` verified against the marker**, through `buildHashOf()` from `packages/core` and no
  second implementation. A mismatch is refused, warned about, and falls back down the order.
- **A refusal for a `schemaVersion` the reader does not recognise**, per ADR-005 §3 — which for this
  package means fall back and warn, because rule 8 says it never throws.
- **Jittered background refresh with `If-None-Match`.** One in-flight request per prompt however many
  callers are waiting on it; a timer that does not hold the process open.
- **Zero runtime dependencies in the published package.** `@41prompts/core` is imported at source and
  **bundled into `dist`** at build time, so there is one implementation of hashing and binding and no
  `dependencies` key. See ruling 2.
- **Telemetry off by default**, with an opt-in that adds a header to a request the SDK was already
  making and **never makes a request of its own**. The README prints the exact bytes.
- **`GET /v1/build/:buildHash`** in `apps/web` — the one server addition, because without it the SDK
  cannot fetch an artifact without hard-coding the store's key layout. See ruling 1.
- **`docs/decisions/ADR-006-sdk-public-api.md`**, which the Review line names.
- **Core's `main`/`exports` settled for publication**, and the Turbopack alias decided rather than
  left parked. See ruling 7.

## Out of scope

- **The Connect page, the generated-file preview, the API-keys tab.** EPIC-055's task line, verbatim.
- **`41p pull`, codegen, the lockfile, bundled-artifact generation.** EPIC-053. This epic accepts
  bundled artifacts as documents the application already has; producing them is the CLI's job.
- **The Python SDK.** EPIC-054, and its Review line is a divergence table against this one.
- **Publishing to npm.** EPIC-056 owns the split, the trusted publishing and the IP assignment, and
  `prepublishOnly` already refuses until the public repository exists. This epic makes the package
  publishable; it does not publish it.
- **Signing, artifact integrity beyond the content address, rate limiting, dependency confusion.**
  EPIC-057's threat model. ADR-005 §6 defers it and a scheme chosen here would be chosen without it.
- **"Apps resolving."** Still needs CDN access logs, still needs a CDN, still Soroush's step.
  EPIC-051 §4.1 is unchanged by this epic and this epic adds no client ping — the roadmap names a
  ping as the wrong answer and the telemetry design in ruling 5 is built around not being one.
- **A browser or edge build.** v1 is Node. See ruling 6.

## Rulings taken in the advisor's chair

Each of these is logged in `docs/decisions/AUTONOMOUS.md`.

### 1. `GET /v1/build/:buildHash` is added, because the alternative is the SDK hard-coding a key layout

EPIC-051 shipped `GET /v1/marker/:promptId`, which redirects to the marker document. The marker
carries a `buildHash` and, deliberately, **no URL** — `artifact/schema.ts` says why: *"where an
artifact is served from is an operational fact that changes with a bucket, a CDN or a region, and a
marker that embedded one would be a frozen copy of a decision somebody will make again"*.

So a reader holding a marker has an identity and no address. The two ways to close that:

1. The SDK derives the address — `…/markers/<id>.json` → `…/builds/<hash>.json`. That is a copy of
   `lib/deploy/store.ts`'s key layout inside a package that ships to customers and is never upgraded,
   and it would break the first time the store's prefix changes. EPIC-051's handover names this
   exactly: *"The SDK must not hard-code either."*
2. The server answers the question, the way it already answers it for markers.

It is (2). `GET /v1/build/:buildHash` is key-authenticated like every other `/v1` route and redirects
to `store.publicUrl(buildKey(buildHash))`, exactly as the marker route does. It is eleven lines and
it is the difference between the store's layout being ours to change and being a published contract.

### 2. The SDK imports `@41prompts/core` at source and **bundles** it; the published package has no `dependencies`

Three constraints that look like they cannot all hold, and do:

- `CLAUDE.md` rule 8 and the roadmap: **zero dependencies.**
- `artifact/schema.ts`: `buildHashOf` is *"here rather than in the SDK so that the two cannot
  disagree about what is hashed — the failure mode of a second copy being that verification quietly
  always passes"*. So the SDK may not reimplement it.
- `CLAUDE.md` rule 11 and `.dependency-cruiser.cjs`'s `public-only-imports-public`: the public
  packages **may import each other.**

The resolution is that *importing* and *depending* are different things once there is a build step.
`packages/sdk-ts/src` imports `@41prompts/core` by name; `pnpm build` bundles the reachable modules
into `dist/index.js` with esbuild; `package.json` has no `dependencies` key and never will. What a
customer installs is one package with no tree behind it, and the bytes that do the hashing were
compiled from core's source in this repository.

The alternative — `"dependencies": { "@41prompts/core": "0.0.1" }` — was rejected on two grounds and
the second is the one that decides it. It would put 1.6 MB of segmenter, clustering, detectors and
compiler into the `node_modules` of an application that wants a string; and it would make the
Review line's *"bundle under 15 KB"* a measurement of somebody else's bundler rather than of this
package.

`esbuild` is a new **devDependency** of `packages/sdk-ts`. It is not shipped, and it is already in
the tree transitively through `tsx` and Vitest.

### 3. `resolve()` is synchronous and the network is a background loop

`CLAUDE.md` rule 8 orders the sources memory → disk → bundled → network, and says the call never
blocks on the network. Read literally as a four-step fallback those two sentences contradict each
other: a call that falls through to the network has blocked on it.

They are reconciled the way the roadmap's own task line writes it — *"memory → disk → bundled →
**background** network"*. The network is not the fourth place a call looks; it is what fills the
first two. A `resolve()` that finds nothing returns `status: "unavailable"` with an empty string and
schedules a fetch, and the next call a second later gets the prompt.

The consequence, stated plainly because it will surprise somebody: **the very first `resolve()` in a
fresh process with no disk cache and no bundled artifact returns nothing.** That is what "never
blocks" costs, and it is why `bundled` exists and why `client.refresh()` is part of the frozen
surface — an application that wants to be ready at boot awaits it once, in its own start-up, where
waiting is allowed.

### 4. The hash is verified against the **marker**, and a mismatch is a fallback rather than an error

The roadmap says *"artifact sha verified against pointer"*. Both halves are checked: the document's
own `buildHash` field must re-derive from its own body (`buildHashOf`), **and** it must equal the one
the marker named. The first catches a corrupted or tampered artifact; the second catches a correct
artifact that is not the one that is Live — a stale CDN edge, a cache poisoned with a real object, a
misconfigured bucket prefix serving another environment's builds.

A failure is refused, warned about, and the resolve order continues. Not thrown: rule 8. Not served
with a flag: an artifact that fails verification is not a degraded answer, it is an answer about
something else.

### 5. Telemetry opt-in adds a header to a request already being made. It never makes one of its own

Off by default (`CLAUDE.md` rule 8). When `telemetry: true`, the SDK adds exactly one request header
to the background marker fetch it was going to send anyway:

```
41p-client: ts/<sdk version>/node<major>/<install id>
```

and nothing else, ever. The README prints that line and names each of the four parts.

Why a header and not a ping: `docs/roadmap.md`'s EPIC-051 line says "apps resolving" is *"derived
from CDN access logs, **no client ping**"*. A telemetry design that posts an event would be the
thing the roadmap names as the wrong answer, arriving through a different epic. A header rides the
log line that already exists.

The install id is a random UUID written next to the disk cache, so a customer can delete it and it
is not derived from anything about them — not a hostname, not a MAC address, not an environment
variable. Nothing about a prompt, a variable, a value or an account is in it.

### 6. v1 is Node, and says so

The disk cache is `node:fs`. A browser build would have to answer what "disk" means there, and the
Stage 5a exit state is *"the prompt […] lives in a Node app"*. `engines` says `>=20`, the README says
it in the first paragraph, and ADR-006 records it as the thing a v2 would revisit. Building a
runtime-detected storage layer for a browser nobody has asked about would be the larger mistake.

### 7. Core's entry points are settled with `publishConfig`, and the Turbopack alias stays

EPIC-013's parked question, answered. Core's `main` and `exports` continue to point at **source**, so
`tsc`, Vitest and every test in the monorepo keep resolving it without a build; `publishConfig`
overrides `main`, `types` and `exports` to `dist` at publish time, which is what npm applies when the
tarball is made. One package, two resolutions, neither of them a lie.

**The alias stays**, and the parked question's real content is answered by that: the alias exists
because Turbopack cannot map core's NodeNext `./x.js` specifiers onto `./x.ts` files, and nothing
about publication changes that. What publication needed was an entry point that names `dist`, and
`publishConfig` is that entry point without forcing every test in the repository through a build.

The same treatment is applied to `packages/sdk-ts`, whose `main` today names `src/index.ts` while
`files` ships `dist` — a package that, published as it stands, would resolve to a file that is not
in the tarball.

### 8. `ADR-006` freezes the public API, and the frozen surface is five names

`createClient`, `resolve`, `configure`, and the types `ClientOptions`, `ResolveResult` (plus
`Client`, `Warning` and `ResolveOptions` as their transitive shapes). Everything else in the package
is internal and may change. The test that enforces it is the same shape as `artifact/frozen.test.ts`:
a list of the exported names, which fails when a sixth appears.

## Acceptance criteria

- [ ] **C1.** `resolve()` returns from memory, then disk, then bundled, in that order, and says which
      in `source`. Verified: `packages/sdk-ts/src/resolve.test.ts`.
- [ ] **C2.** **Offline returns bundled.** With every network call failing, a client with a bundled
      artifact resolves it, and one without returns `status: "unavailable"` and an empty string.
      Verified: `resolve.test.ts`.
- [ ] **C3.** **Stale serves old then refreshes.** A client holding version 1 returns version 1
      immediately when version 2 is Live, and returns version 2 after the background refresh
      completes. The first call is proved not to have awaited the network. Verified:
      `refresh.test.ts`.
- [ ] **C4.** **1,000 concurrent resolves produce one fetch** of the marker and one of the artifact.
      Counted on the injected `fetch`. Verified: `refresh.test.ts`.
- [ ] **C5.** **Never-throw fuzz.** Every exported function called with several hundred generated
      values — wrong types, cyclic objects, huge strings, getters that throw, frozen objects,
      prototype-polluted maps — throws nothing and returns a well-formed result every time. Verified:
      `never-throws.test.ts`.
- [ ] **C6.** **A hash mismatch is rejected.** An artifact whose body does not re-derive its own
      `buildHash`, and a correct artifact whose `buildHash` is not the one the marker named, are both
      refused, warned about, and fall back. **With a positive control**: the same test proves the
      path accepts a good artifact, so the refusal is not a test that can never fail. Verified:
      `verify.test.ts`.
- [ ] **C7.** An artifact with an unrecognised `schemaVersion`, a marker with one, malformed JSON, a
      404, a 401, a 500 and a redirect loop are each handled by a warning and a fallback — never an
      exception, never a partial write to the disk cache. Verified: `network.test.ts`.
- [ ] **C8.** **Variable validation.** A missing required name is reported in `missing` and the result
      is `unavailable` rather than a prompt with an unfilled placeholder in it; a declared default is
      applied and named in `usedDefaults`; a supplied value containing `{{other}}` is inserted
      verbatim and never rescanned. Verified: `variables.test.ts`, which asserts the SDK calls core's
      `bindVariables` rather than restating its rules.
- [ ] **C9.** **The disk cache round-trips.** A client writes what it fetched; a second client with a
      dead network and no bundled artifact resolves it from that directory. A corrupt file, an
      unreadable directory and a read-only filesystem each degrade to a warning. Verified:
      `disk.test.ts`.
- [ ] **C10.** **Telemetry is off by default**: with `telemetry` unset, no request carries the
      `41p-client` header and no request is made that would not have been made anyway. With it on,
      exactly one header is added and its value matches the documented grammar. Verified:
      `telemetry.test.ts`.
- [ ] **C11.** **Zero runtime dependencies.** `packages/sdk-ts/package.json` has no `dependencies`,
      `peerDependencies` or `optionalDependencies` key, and the built `dist/index.js` imports nothing
      but `node:` builtins. Verified: `package.test.ts`, reading the built output.
- [ ] **C12.** **Bundle under 15 KB.** The built `dist/index.js`, minified, is under 15,360 bytes, and
      the test prints the measured number so a report can quote it rather than the adjective.
      Verified: `package.test.ts`.
- [ ] **C13.** **The public API is exactly the five names ADR-006 freezes**, and a sixth export fails
      the test. Verified: `frozen.test.ts`.
- [ ] **C14.** `GET /v1/build/:buildHash` redirects to the artifact's public URL for a key whose
      project owns the prompt that build belongs to, 404s for a hash nothing published, and 401s
      without a key. Verified: `apps/web/e2e/publish.spec.ts`.
- [ ] **C15.** **The end-to-end path works against the built app**: a real `@41prompts/sdk` client,
      built from `dist`, with a real API key, against a real published prompt, returns the compiled
      text with variables bound — and returns it again with the server stopped. Verified: the drive.
- [ ] **C16.** Core and the SDK both resolve to `dist` when published and to source in the monorepo,
      proved by reading what `npm pack` would publish rather than by asserting about a field.
      Verified: `package.test.ts` in each package.
- [ ] **C17.** `pnpm forbidden-words` passes; no user-visible string or code identifier added by this
      epic uses **block** (the noun), **pointer**, **promote**, **override**, **sha**, **reconcile**
      or **drifted**. The README is a published document and is checked with everything else.
- [ ] **C18.** `pnpm test`, `pnpm typecheck`, `pnpm lint` green with every package reporting, and
      `node scripts/gates.mjs ci` green on the commit.
- [ ] **C19.** The built app is started, a fresh throwaway user signs in, creates a project, a prompt
      and its bloks **through the product's own UI**, publishes it, and a separate Node process using
      the built SDK resolves it. Screenshots in `docs/epics/reports/screenshots/EPIC-052/`.

## Verification

```
pnpm --filter @41prompts/sdk test
pnpm --filter @41prompts/core test
pnpm --filter @41prompts/web test
node scripts/gate-run.mjs
npx tsx scripts/drive-epic-052.mts     # against the BUILT app, see its header
```

The browser drive: this epic ships one route and no page, so the **visual** half is the EPIC-030
shape and the report says so. What it does ship is a library, and a library's drive is a real process
importing the real built package — which is what the second half of `drive-epic-052.mts` is, and it
is the only part of this epic that can fail the way a customer's install fails.

## Notes for the implementer

- **`packages/core/src/artifact/schema.ts` is on the never-touch list.** Everything here is a reader
  of it. `buildHashOf` and `artifactBytes` are the two functions that exist for this epic; use them.
- **`bindVariables` already exists** in `packages/core/src/inputs/bind.ts` and already handles the
  three traps (right-to-left substitution, a value that looks like a placeholder, empty string as a
  real value). Do not write a second one.
- **Every absence assertion needs a positive control.** This is the fourth epic in a row to say so
  and the third to have needed it. "No header was sent", "no request was made", "nothing was written
  to disk" are all assertions that pass when the instrument is broken.
- **Do not seed the drive's data.** Create the project, the prompt and the bloks by clicking, per
  `docs/AUTONOMOUS.md`. The API key is still the one thing with no UI — EPIC-055 owns that tab — so
  the drive mints one directly and the report says which step was not driven through the product.
- **`apps/web/e2e/env.mjs` holds the placeholders `next start` needs.** Do not write a fifth copy.
- **A test that calls the real network is a test that fails on a plane.** `fetch` is injected through
  `ClientOptions`; nothing in the suite may reach outside the process.
