<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: Apache-2.0
-->

# Plan — EPIC-052: `@41prompts/sdk`

Branch `epic/052-sdk-ts`. Written before any code, per `CLAUDE.md` "How to work" and
`docs/AUTONOMOUS.md` step 2.

## What exists already, verified against the tree rather than remembered

| thing | state |
|---|---|
| `packages/sdk-ts` | a stub from EPIC-000: `resolve()` returns `{ text: "", status: "unavailable" }`, two tests, `main` naming `src/index.ts` while `files` ships `dist` |
| `packages/core` `buildHashOf`, `artifactBytes`, `canonicalJson`, `sha256Text` | shipped and frozen by EPIC-050 |
| `packages/core` `bindVariables`, `isOptional`, `occurrencesInText` | shipped by EPIC-032/EPIC-022 |
| `GET /v1/prompts`, `GET /v1/marker/:promptId`, `GET /v1/blob/<key>` | shipped by EPIC-051 |
| a route that turns a `buildHash` into a URL | **does not exist** — ruling 1 |
| `.dependency-cruiser.cjs` `sdk-has-no-npm-deps` | forbids every npm dependency type from `sdk-ts/src` |

## The shape

```
packages/sdk-ts/src/
  index.ts        the five frozen exports and nothing else
  types.ts        ClientOptions, ResolveResult, Warning, Client
  client.ts       createClient: the memory map, the in-flight map, the timer
  resolve.ts      the synchronous four-source lookup + variable binding
  verify.ts       parse an unknown document → Artifact | undefined  (buildHashOf, schemaVersion)
  network.ts      marker fetch, build fetch, ETag, one-flight, telemetry header
  disk.ts         node:fs cache: read, write, install id
  bundled.ts      normalising what the caller passed as `bundled`
```

### The frozen surface (ADR-006)

```ts
createClient(options: ClientOptions): Client
resolve(promptId, vars?, options?): ResolveResult      // the default client
configure(options: ClientOptions): void                // sets the default client
type ClientOptions, ResolveResult                      // + Client, Warning, ResolveOptions
```

`Client` is `{ resolve, refresh, close }`. `refresh(promptId?)` returns a promise so an application
can be warm at boot; `close()` clears the timer.

`ResolveResult` is
`{ text, status, source, promptId, version, buildHash, model, missing, usedDefaults }` —
`source` is `"memory" | "disk" | "bundled" | "none"`, never `"network"`, because a value that came
over the network reached the caller through memory (ruling 3).

### The network protocol, end to end

1. `GET {baseUrl}/v1/marker/{promptId}` with `Authorization: Bearer {apiKey}` and, if we have one,
   `If-None-Match`. It 302s; `fetch` follows; the final response is the marker JSON with an `ETag`.
2. Parse, check `schemaVersion === 1`, take `buildHash`.
3. If that `buildHash` is already in memory or on disk, stop — nothing to download.
4. `GET {baseUrl}/v1/build/{buildHash}` with the same header. It 302s to the artifact.
5. Parse, `buildHashOf(document) === document.buildHash`, and `document.buildHash === marker.buildHash`
   (ruling 4). Both, or refuse.
6. Write memory, then disk. Memory first: a disk failure must not lose an artifact we hold.

## Order of work

1. **`packages/sdk-ts` scaffolding** — types, esbuild build script, `publishConfig`, `package.test.ts`
   measuring the bundle and asserting no `dependencies`. Do this first because ruling 2 is the one
   that can fail structurally, and finding that out after writing the client would be expensive.
2. **`verify.ts`** and its tests, with the positive control C6 names.
3. **`bundled.ts`**, **`disk.ts`**, **`resolve.ts`** — everything synchronous, tested without a network.
4. **`network.ts`** and **`client.ts`** — the injected `fetch`, one-flight, ETag, jitter.
5. **`never-throws.test.ts`** — the fuzz, over the whole surface.
6. **`GET /v1/build/:buildHash`** in `apps/web`, plus its e2e assertions.
7. **`publishConfig` for `packages/core`**, and the EPIC-013 note updated where it is parked.
8. **README**, **ADR-006**, the decisions log.
9. **Gates**, then the drive, then the report.

## Risks, and what each one would look like

- **dependency-cruiser's `sdk-has-no-npm-deps` may classify the workspace import of
  `@41prompts/core` as an npm dependency.** If it does, the rule is narrowed to exclude
  `@41prompts/*` with its comment rewritten to say what it is actually protecting — *ships* zero npm
  dependencies. This is EPIC-051 §6c's shape: a gate stricter than the rule it enforces. It is a fix
  to the gate, logged, not an exemption.
- **The bundle budget.** 15,360 bytes minified. `bindVariables` pulls `occurrencesInText`;
  `buildHashOf` pulls `canonicalJson` and `sha256Text`. All pure, all small. If it does not fit, the
  answer is to measure what got in — not to relax the number, which is a Review line.
- **`fetch` following a cross-origin redirect drops `Authorization`.** That is correct and wanted:
  the CDN is public. It is asserted rather than assumed.
- **Jitter and timers in tests.** The clock is injected (`now`, `setTimer`) so nothing in the suite
  waits on wall time. A test that sleeps is the "wait on a condition, not a duration" rule broken.

## What this plan deliberately does not do

No Connect page, no `41p pull`, no npm publish, no browser build, no signing, no client ping. Each
is named in the epic file's Out of scope with the epic that owns it.
