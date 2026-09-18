<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: Apache-2.0
-->

# EPIC-050: the build artifact, frozen, and the compatibility rule
Stage: 5a · Depends on: EPIC-040, EPIC-022 · Size: M

**Written by Claude Code in the advisor's chair**, 2026-09-16, under `docs/PROCESS.md`'s amendment of
2026-09-15 and the precedent EPIC-040 to EPIC-043 set. The Goal, Tasks, Tests and Review lines below
are `docs/roadmap.md`'s, unchanged; everything else is this file's reading of them.

**This is the first row in Stage 5a**, and it is the epic that turns an internal shape into a public
contract. Nothing after it may change that shape without a version bump.

## Goal

Today `Artifact` is a provisional shape in `packages/core` that nothing constructs outside its own
tests, hashed with a 64-bit non-cryptographic digest over `JSON.stringify`. After this epic it is the
**frozen v1 build artifact**: a defined byte encoding, a SHA-256 content address, the provenance that
says what it was proved against, a `LiveMarker` that names one, a JSON Schema document for each, a
rule that says when a change breaks the callers already in the field, and an ADR declaring all of it
public and versioned.

## The roadmap's four lines, verbatim

> **Goal.** The public artifact format, frozen, and the compatibility rule.
> **Tasks.** `BuildArtifact v1` (content-addressed sha, compiled, spans, variables, model, params,
> check suite id); `LivePointer`; `isCompatible()` (added required, removed, type change = breaking);
> JSON Schema for both; ADR-005 declaring the format public and versioned.
> **Tests.** Schema fixtures; compatibility matrix.
> **Review.** Nothing internal leaks through the format.

## Scope

- **A canonical encoding.** `canonicalJson()` in `packages/core`: object keys in sorted order, no
  insignificant whitespace, UTF-8 bytes. The existing header comment on `artifact/schema.ts` names
  this as this epic's first job — "JSON key order is not canonical, so two equal artifacts can hash
  differently" — and every other item here rests on it.
- **SHA-256, in pure TypeScript.** `buildHash` becomes a SHA-256 digest over those bytes. The
  roadmap's own words are "content-addressed **sha**"; today's `hash()` is FNV-1a and its own doc
  comment says it "addresses content, it does not authenticate it". EPIC-052's SDK verifies an
  artifact it fetched from a network against the hash the marker gave it, and a 64-bit
  non-cryptographic digest cannot carry that sentence.
- **`Artifact` v1, frozen**: `schemaVersion`, `compilerVersion`, `promptId`, `text`, `spans`,
  `bloks`, `checks`, `variables`, `model`, `params`, `checkSuiteId`, `buildHash`. The three new ones
  are the roadmap's "model, params, check suite id".
- **`LiveMarker`** — the roadmap's `LivePointer`, renamed; see the rulings below — and `liveMarkerOf()`.
- **`isCompatible(live, next)`**, returning every break rather than a boolean alone, so EPIC-051's
  gate can say *which* variable broke rather than "incompatible".
- **A JSON Schema document for each**, exported from `@41prompts/core`, plus the subset validator
  that makes them checkable rather than decorative.
- **Golden fixtures**: one artifact and one marker committed as JSON, asserted byte-for-byte. A
  frozen format needs a file that fails when the bytes move.
- **ADR-005**, declaring the format public and versioned.
- **`packages/core/src/artifact/schema.ts` stops saying it is unfrozen** and says what it is instead.
  `CLAUDE.md`'s never-touch list makes it untouchable from this epic onward; **this epic file is the
  explicit instruction that rule requires**, and it is the last one that will be given.

## Out of scope

- **Publishing anything.** No `POST /publish`, no R2, no audit log, no gate. EPIC-051.
- **Any route, component or user-visible string.** This is a `packages/core` epic.
- **Validating a caller's arguments against the declaration.** That is the SDK's variable validation
  and it belongs to EPIC-052; `isCompatible` answers a different question — whether a *new build*
  breaks the callers the *old build* already has in the field.
- **Signing, or any answer to artifact integrity beyond the content address.** EPIC-057's threat
  model owns pointer abuse and artifact integrity, and a signature scheme decided here would be
  decided without it.
- **Serving a type system for variables.** `type` stays reserved and absent (EPIC-022 ruling Q1).
  `isCompatible` handles a type change because the rule names it, and no v1 artifact can exhibit one.

## Rulings taken in the advisor's chair

Each of these is logged in `docs/decisions/AUTONOMOUS.md`.

### 1. `LivePointer` is called `LiveMarker`

`CLAUDE.md`'s Vocabulary section forbids **pointer** in "UI strings, schema, or code identifiers" —
without the "(UI only)" qualifier it gives *assertion* and *artifact*. The roadmap's task line says
`LivePointer`. The vocabulary rule is the one ADR-003 decided and the one with a grep behind it, and
this is the same conflict `buildHash` already resolved the same way against the Naming section's
"Build sha".

The replacement is not invented: `41prompts-full-mockup.html` line 1722 already says **"Publish moves
the Live marker"** in the product's own marketing copy. So the word is the product's, not a synonym
chosen to dodge a grep.

### 2. `buildHash` is SHA-256 and not FNV-1a, and core implements it itself

The digest is the thing an SDK checks a downloaded artifact against. `hash()` in `compile/hash.ts`
stays exactly where it is and keeps doing what it is good at — addressing cached span content — and
the artifact stops using it.

`packages/core` is zero-dependency with no DOM and no IO, so neither `node:crypto` nor a package is
available. It is written out, in about seventy lines, and proved against the published NIST vectors
rather than against itself. `version/diff.ts` already set this precedent for UTF-8 byte counting and
the reasoning is quoted there.

### 3. The artifact's content address covers its provenance

Two publishes of a byte-identical blok set, proved by two different check suite runs, are **two
artifacts with two hashes**. That is a consequence of the roadmap putting `model`, `params` and
`check suite id` inside `BuildArtifact` rather than alongside it, and it is the right way round: the
product's claim is "it cannot go live if it breaks your tests", and an artifact that carries the
proof of that claim is a thing a customer can audit on its own. Provenance living only in a mutable
marker would rest the claim on a record that can be rewritten.

Stated here rather than discovered later, and raised in the report as reversible.

### 4. Optional → required is a break, and the roadmap's list of three does not name it

The roadmap says "added required, removed, type change = breaking". A variable that **loses its
default** fails for exactly the callers "added required" fails for — every one that omits it — so
leaving it out would ship a gate that passes a change it exists to stop. Four break kinds, not three.

### 5. What is deliberately **not** in the artifact

The Review line is "nothing internal leaks through the format", and these are the four answers:

- **A span's `hash`.** It is the compiler's cache key and the mechanism behind `drift()`. An artifact
  is immutable, so there is no "now" for it to drift against, and it means nothing to a reader.
- **A blok's `order`.** That number is the caller's own ordering — a database rank in practice. The
  artifact carries `position`, a 0-based ordinal, for the reason `SnapshotBlok` already does.
- **Who published it.** The Deploy page's "Published 2 days ago by Soroush B." is read from the audit
  log server-side. A public marker naming a person is a public marker naming a person.
- **Anything about an account, a project, a key, a cost or a run's output.** Asserted by a test that
  walks every key of a real artifact against a denylist, with a positive control that proves the walk
  can find what it is looking for.

## Acceptance criteria

- [ ] **C1.** `canonicalJson()` produces identical bytes for two values that differ only in key
      insertion order, at every level of nesting. Verified: `canonical.test.ts`.
- [ ] **C2.** `canonicalJson()` refuses what it cannot encode canonically — `undefined`, a function,
      a non-finite number, a cycle — rather than emitting something a reader would misparse.
      Verified: `canonical.test.ts`.
- [ ] **C3.** SHA-256 matches the published NIST vectors, including the empty string and a multi-block
      input, and encodes non-ASCII text as UTF-8. Verified: `sha256.test.ts`.
- [ ] **C4.** `Artifact` carries exactly the twelve v1 fields, and a test fails if a thirteenth
      appears without `ARTIFACT_SCHEMA_VERSION` moving. Verified: `schema.test.ts`.
- [ ] **C5.** `artifactOf()` hashes deterministically, changes when anything in the artifact changes
      — including `model`, `params` and `checkSuiteId` — and is independent of the order variables,
      params or bloks arrived in. Verified: `schema.test.ts`.
- [ ] **C6.** The committed golden fixture round-trips: `artifactOf()` on the fixture's inputs
      produces bytes equal to `fixtures/artifact-v1.json` and a `buildHash` equal to the one recorded
      in it. Verified: `frozen.test.ts`.
- [ ] **C7.** `LiveMarker` names an artifact by `buildHash`, carries its own `schemaVersion`, and
      contains nothing that identifies a person. Verified: `schema.test.ts`, `leak.test.ts`.
- [ ] **C8.** `isCompatible()` answers the full matrix: added optional, added required, removed,
      became required, became optional, type changed, description changed, default changed, renamed,
      and no change at all — each with the break it reports. Verified: `compatibility.test.ts`.
- [ ] **C9.** Both JSON Schema documents validate their golden fixtures, and **reject** a mutated copy
      of each — a missing required field, a wrong type, and an extra property. Verified:
      `json-schema.test.ts`.
- [ ] **C10.** The validator refuses a schema using a keyword it does not implement, rather than
      ignoring it. Verified: `validate.test.ts`.
- [ ] **C11.** No key anywhere in a real artifact or marker matches the internal-field denylist, and
      the denylist walk is proved able to find one. Verified: `leak.test.ts`.
- [ ] **C12.** `docs/decisions/ADR-005-build-artifact.md` exists, declares the format public and
      versioned, and names what a reader must do with a `schemaVersion` it does not recognise.
- [ ] **C13.** `artifact/schema.ts` no longer claims to be unfrozen, and a test asserts the sentence
      that replaced it. Verified: `schema.test.ts`.
- [ ] **C14.** `pnpm test`, `pnpm typecheck`, `pnpm lint` green with every package reporting, and
      `node scripts/gates.mjs ci` green on the commit.

## Verification

```
pnpm --filter @41prompts/core test
node scripts/gate-run.mjs
```

The browser drive: this epic ships no route, no component and no user-visible string, so it is the
EPIC-030 shape — its report says so in a numbered section rather than leaving an unticked box. It
**does** change a signature `apps/web` could import, so the built app is still started and a page
loaded, as a build regression check rather than as a feature drive, and the screenshot says which it
is.

## Notes for the implementer

- **`artifactOf`'s signature changes and it has no callers outside its own tests.** Checked before
  planning: `grep -rn artifactOf apps packages --include=*.ts` finds `src/index.ts`, the file itself
  and `schema.test.ts`. Take an options object; seven positional arguments is the alternative.
- **The golden fixture is the point of the epic, not a nicety.** If a compiler change moves
  `BLOK_SEPARATOR` or `COMPILER_VERSION`, that fixture must fail — and whoever is looking at the
  failure then has to decide whether the artifact's schema version moves with it. A test that
  recomputed the expected value would have nothing to say.
- **`params` is JSON scalars only.** A nested object would need a canonical encoding decision of its
  own for something no provider asks for.
- **Nothing in `packages/core` may import `node:crypto`.** `pnpm boundaries` and `pnpm lint` enforce
  rule 11 and will say so, but the reason is that this package is published and runs in browsers.
