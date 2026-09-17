<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# ADR-005: The build artifact is a public, versioned format

Status: accepted · 2026-09-16 · EPIC-050

**Written by Claude Code in the advisor's chair**, under `docs/PROCESS.md`'s amendment of
2026-09-15. `docs/roadmap.md`'s EPIC-050 task line asks for it in as many words — *"ADR-005
declaring the format public and versioned"* — and that line is the explicit instruction
`CLAUDE.md`'s never-touch list requires for a file in `docs/decisions/`. **Soroush has not read
this yet.** Anything here he disagrees with is reversible today at the cost of one schema version,
and expensive the moment a customer installs an SDK.

## Context

`PROCESS.md` says an ADR is owed for any **irreversible** choice, and names the artifact format as
one of the four. This is why it is irreversible, stated as a sequence rather than as a principle:

1. EPIC-051 writes an artifact to R2 with `immutable` cache headers. An immutable object is never
   rewritten — that is the whole of what the header promises the CDN and every cache between it and
   a customer's process.
2. EPIC-052 publishes `@41prompts/sdk`, which reads one.
3. EPIC-054 publishes `fortyone-prompts`, which reads one from Python.
4. Somebody installs version 1.0 of one of those, pins it, and stops upgrading.

From step 4 onward, **the format cannot be changed; it can only be added to.** A reader that was
written against v1 will still be running against artifacts written years later, and it cannot be
patched, recalled, or told about a change. That is not a risk to be managed — it is the design, and
the only question is whether the format is honest about it.

## Decision

### 1. The format is public

`Artifact` and `LiveMarker` in `packages/core/src/artifact/schema.ts` are a **published contract**,
not an internal shape. They are Apache-2.0, they ship in `@41prompts/core`, and
`ARTIFACT_JSON_SCHEMA` and `LIVE_MARKER_JSON_SCHEMA` are the machine-readable statement of them for
a reader written in any language.

Consequence, and it is the reason the Review line of EPIC-050 is *"nothing internal leaks through
the format"*: **anything in an artifact is public.** Not "public to the customer" — public to
anyone who holds the marker's URL, because an artifact is served from a CDN without a session.
`packages/core/src/artifact/leak.test.ts` is the enforcement, and `additionalProperties: false` at
every level of the JSON Schema is the statement a stranger can run.

### 2. The format is versioned, and each format has its own clock

`schemaVersion` is the first field of both documents. An artifact is `ARTIFACT_SCHEMA_VERSION`; a
marker is `MARKER_SCHEMA_VERSION`. **They are two numbers.** A marker is five fields that will
change for different reasons and on a different schedule from the artifact it names, and one shared
number would force a bump on both whenever either moved — making every old artifact look stale for
a change that never touched it.

Both are **1** as of 2026-09-16.

### 3. What a reader must do with a version it does not recognise

**Refuse it. Do not parse it, do not partially parse it, do not ignore the field.**

A v2 artifact is not "a v1 with extra keys". A version bump is exactly the signal that something a
v1 reader relies on may no longer mean what it meant, and a reader that parses ahead anyway is a
reader that serves a prompt it has misunderstood — to production traffic, silently. The failure has
no symptom at the moment it happens.

For `@41prompts/sdk` this composes with `CLAUDE.md` rule 8 — the SDK never throws — so "refuse"
means: fall back down the resolve order (memory → disk → bundled), report through `onWarning`, and
keep serving the last artifact it *did* understand. **A stale prompt that works is better than a
new one that is not understood**, and the operator finds out through the warning rather than through
their output.

### 4. What may change inside v1, and it is exactly one thing

**`ArtifactVariable.type`.** It is declared in v1, absent from every v1 artifact, and reserved
(EPIC-022 ruling Q1). It may start carrying values **without** `ARTIFACT_SCHEMA_VERSION` moving.
That is the whole reason it was declared rather than added later: a reader that has always seen the
key can begin receiving a value in it; a reader that has never seen the key must be taught about it
by a version bump it may be too old to understand.

The published JSON Schema already permits it, so a reader validating against the schema it shipped
with will not reject an artifact that has one.

**Everything else is a bump.** A new field, a removed field, a renamed field, a changed type, a
changed meaning, a different canonical encoding, a different digest algorithm.

### 5. A bump is not a migration

Artifacts already written stay v1 **for ever**. They are immutable objects behind an immutable
cache header; there is nothing to migrate and nowhere to migrate it to. A bump means new artifacts
are written as v2 and old readers refuse them cleanly, per §3.

This is why the version field has existed since v0, before anything read an artifact at all.

### 6. The content address is SHA-256 over a canonical encoding

`buildHash` is `sha256(utf8(canonicalJson(every other field)))`, written as 64 lower-case hex
characters.

**Canonical, because otherwise it is not a content address.** `JSON.stringify` emits object keys in
insertion order, so the same artifact assembled from a database row and from a form post would hash
two ways, and a format where equal content has two addresses is not content-addressed. The rules are
in `packages/core/src/artifact/canonical.ts`: keys sorted, arrays in order, no insignificant
whitespace, UTF-8 bytes, and a refusal — rather than a substitution — for anything `JSON.stringify`
would silently alter.

**SHA-256, because the digest is a verification and not a cache key.** The previous digest was
`compile/hash.ts`'s 64-bit FNV-1a, whose own comment says it *"addresses content, it does not
authenticate it"*. That is correct for a span cache, where a collision costs a wrong string inside a
process that owns both sides. It is wrong for a document fetched over a network and checked against a
hash from somewhere else: FNV-1a is collidable on a laptop, so *"the bytes I fetched hash to the
value the marker named"* would stop meaning *"these are the bytes that were published"*.

It is implemented in TypeScript inside `packages/core` because that package is zero-dependency with
no DOM and no IO, which rules out both a package and `node:crypto`. It is proved against the
published FIPS 180-4 vectors rather than against itself.

**What it is not.** Not a signature. It answers *"are these the bytes that were named"* and nothing
about *who* named them. An attacker who can move the marker can name their own artifact and it will
verify. That is `EPIC-057`'s threat model — artifact integrity and pointer abuse — and it is
deliberately not pre-empted here, because a signing scheme chosen before that analysis would be
chosen without it.

### 7. The content address covers the provenance

`model`, `params` and `checkSuiteId` are inside the hash. **So two publishes of a byte-identical
blok set, proved by two different check suite runs, are two artifacts with two addresses.**

This follows `docs/roadmap.md`, which puts those three inside `BuildArtifact` rather than alongside
it, and it is the right way round. The product's claim is that a prompt *cannot go live if it breaks
your tests*. An artifact carrying the proof of that claim is a thing a customer can audit on its
own; provenance living only in the marker would rest the claim on a record that can be rewritten.

The cost is stated plainly: an artifact is identified by its content **and its proof**, so
re-publishing unchanged text after a fresh run writes a new R2 object. **This is the one paragraph
of this ADR most likely to be reversed**, and reversing it is a v2.

### 8. `model` is what the checks were proved against, not what a caller must use

Nothing in the format constrains which model a caller sends the prompt to. `CLAUDE.md` rule 9 blocks
publishing when checks fail *on the target model*, so an artifact that did not record which model
that was could not support the sentence the product sells. A caller sending it elsewhere loses that
guarantee, and can only know so because the field is there.

### 9. Compatibility is about the callers already in the field

`isCompatible(live, next)` reads `variables` and nothing else, and answers one question: **if we
publish this, does an app that was written against Live stop working, without redeploying, without
an error, and without anybody noticing?** Four breaks:

| break | what happens to a caller |
|---|---|
| `added_required` | never sent it; the prompt now ships with an unfilled placeholder |
| `removed` | keeps sending a value that is now ignored; their text stops reaching the model |
| `became_required` | omitted it because it had a default; same hole as the first row |
| `type_changed` | sends what the old declaration asked for |

`docs/roadmap.md` names three of these. **`became_required` is the fourth and is not in that list**
— a variable that loses its default fails for exactly the callers `added_required` fails for, so
shipping the roadmap's three literally would have been shipping a gate that passes the change it
exists to stop.

A **rename** is not a fifth kind: it reports as a removal and an addition, which is what it does to a
caller. Changing a **default value** or a **description** is not a break — the first is a change to
the prompt's content, graded by the check suite like any other, and the second is documentation.

None of these throws anywhere, at any point, which is why this is a publish gate rather than a
runtime check. They produce a plausible answer from a model and a wrong one, at a rate nobody
notices for a week.

## Alternatives rejected

**Keep FNV-1a and call the hash an identifier rather than a verification.** Then `resolve()` cannot
verify a fetched artifact against the marker at all, and the SDK's integrity story is "we trust the
CDN". Rejected: the verification is already in EPIC-052's task line, and the cheap moment to have a
real digest is before anything has been published rather than after.

**Take `node:crypto`'s SHA-256 and relax the zero-dependency rule for core.** Rejected. Core runs in
a browser today inside `apps/web`'s decompiler, and the rule is a stack decision (`CLAUDE.md`) rather
than a preference. Seventy lines with published test vectors is a smaller cost than a rule with an
exception in it.

**Put `model`, `params` and `checkSuiteId` in the marker instead of the artifact.** Keeps
content-addressing over the text alone, and was genuinely close. Rejected in §7, and named there as
the reversible one.

**Let `isCompatible` also validate a caller's arguments.** Rejected: that is a per-call question and
belongs to EPIC-052. Folding them together would make a publish gate depend on what somebody
happened to send last Tuesday.

**A `.json` file per schema, committed.** Rejected: the schemas derive their `enum`s from
`BLOK_KINDS` and `CHECK_KINDS`, so they cannot go stale against the code. A committed copy can, and
this repository has already paid for exactly that failure once — `CLAUDE.md` records the check kinds
being written down as a sample of four, read as the whole set, and an epic concluding a phrase did
not exist when it had been in ADR-003 all along.

## Consequences

- `packages/core/src/artifact/schema.ts` is on `CLAUDE.md`'s never-touch list from today. EPIC-050's
  epic file is the last explicit instruction to change it.
- `packages/core/src/artifact/fixtures/artifact-v1.json` and `live-marker-v1.json` are golden files.
  A test compares them byte for byte; `scripts/write-artifact-fixtures.mts` regenerates them **by
  hand, deliberately**, and a diff from that script is a decision under §4, not a chore.
- The artifact fixture's hash — `67fa58281746e54b750529c1ed35182d0dbe9fdeb5a289cb25783c63c9190d55` —
  is a cross-language test vector. `sdks/python` (EPIC-054) must reproduce it.
- **Nobody has reviewed the SHA-256 implementation.** It matches five published vectors and 131
  consecutive message lengths across both padding boundaries; that is evidence, not a review, and
  EPIC-057's hour of external review is the right place for it.

## Open, for Soroush

1. **§7, provenance inside the content address.** The one paragraph most likely to be wrong.
2. **`CLAUDE.md`'s Naming line still says "Build sha".** Its Vocabulary line forbids `sha` in code
   identifiers, so the field is `buildHash` — the second time that conflict has been resolved the
   same way (the first is in `schema.ts`'s own comment, 2026-09-13). The Naming line probably
   predates ADR-003 and could simply be corrected.
3. **`docs/roadmap.md` says `LivePointer`.** The type is `LiveMarker`, because `CLAUDE.md` forbids
   *pointer* in code identifiers and the mockup's own copy says "Publish moves the Live marker". The
   roadmap is his file and is not edited here.
