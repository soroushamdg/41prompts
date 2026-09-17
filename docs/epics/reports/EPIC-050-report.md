<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# EPIC-050 — report

**The build artifact, frozen at v1, and the compatibility rule.** Stage 5a's first row.
Built 2026-09-16 by Claude Code, working from `docs/epics/EPIC-050-build-artifact.md`, which the
same session wrote in the advisor's chair under `docs/PROCESS.md`'s 2026-09-15 amendment.

Merge commit: see §12. Nothing is pushed (`CLAUDE.md`, "Nothing is pushed", 2026-09-15).

---

## 1. What is true now that was not true before

`packages/core`'s `Artifact` was a provisional shape that **nothing outside its own tests ever
constructed**, hashed with a 64-bit FNV-1a digest over `JSON.stringify`, and whose own header listed
four things EPIC-050 still had to decide. All four are decided and the file says it is frozen.

Concretely:

- an artifact has **one sequence of bytes**, defined in `canonical.ts`;
- it has a **SHA-256 content address** over those bytes, which is a digest an SDK can verify a
  download against rather than a cache key that cannot;
- it carries **what it was proved against** — `model`, `params`, `checkSuiteId`;
- there is a **`LiveMarker`** saying which artifact is Live for a prompt;
- there is **`isCompatible()`**, answering whether publishing a new build breaks the callers the
  current Live build already has in the field;
- there are **two JSON Schema documents** and a validator that makes them checkable;
- there are **golden fixtures** that fail when the bytes move;
- and there is **ADR-005**, declaring the format public and versioned, with the rule for what a
  reader must do with a `schemaVersion` it does not recognise.

## 2. Acceptance criteria, each with its evidence

Every one is ticked and every one names how. Commands in §10.

| # | criterion | evidence |
|---|---|---|
| C1 | canonical bytes are independent of key insertion order, at every depth | `canonical.test.ts` — "gives identical bytes whatever order the keys were inserted in", which builds the two objects with keys inserted in opposite orders and **asserts `JSON.stringify` differs** first, as the control; plus "sorts at every level of nesting" |
| C2 | it refuses what it cannot encode canonically | `canonical.test.ts` — nine cases (`undefined` in a property and in an array, `NaN`, `Infinity`, function, symbol, bigint, `Date`, `Map`), each asserting the **path**, plus a cycle and a root-value case |
| C3 | SHA-256 matches the published NIST vectors and encodes UTF-8 | `sha256.test.ts` — the four FIPS 180-4 worked vectors, the million-character vector, 131 consecutive message lengths across both padding boundaries, and six UTF-8 cases including an astral code point and a lone surrogate |
| C4 | exactly twelve v1 fields; a thirteenth fails | `schema.test.ts` — "carries exactly the twelve v1 fields and no others" |
| C5 | the hash is deterministic, order-independent, and moves when anything moves | `schema.test.ts` — "does not depend on the order variables, params or bloks arrived in" and "changes when the prompt id, a blok's text, the model, the params or the check suite changes" |
| C6 | the golden fixture round-trips byte for byte | `frozen.test.ts` — "is byte-for-byte what artifactOf produces today", "re-derives its own hash from the committed bytes", "is stored in canonical form" |
| C7 | the marker names an artifact by hash, has its own version, and carries no person | `schema.test.ts` `describe("liveMarkerOf")`, `leak.test.ts` — "carries no actor on the marker" |
| C8 | the compatibility matrix | `compatibility.test.ts` — **17 rows**, listed in §5 |
| C9 | both schemas validate their fixtures and reject mutations | `json-schema.test.ts` — 4 extra blok sets validated, and 14 negative controls |
| C10 | the validator refuses an unimplemented keyword | `validate.test.ts` — "refuses a keyword it does not implement", including nested inside `properties` and `items`, and "refuses before looking at the value" |
| C11 | no internal field leaks, and the search is proved able to find one | `leak.test.ts` — the denylist walk, a planted `ownerEmail` two levels down, a `ownerId`/`api_key`/`cost-cents` case, and the false-positive case |
| C12 | ADR-005 exists and says what a reader does with an unknown version | `docs/decisions/ADR-005-build-artifact.md` §3 |
| C13 | the file no longer claims to be unfrozen | `schema.test.ts` — "says in the file that it is frozen, where it used to say it was not", asserting both the new sentence and the absence of the old one |
| C14 | gates green | §10: `pnpm test` 8/8, `typecheck` 8/8, `lint` 11/11, and `gates.mjs ci` 16/16 on `8d6aa9a` |

## 3. The five rulings, and what each cost

All five are in `docs/decisions/AUTONOMOUS.md` and in the epic file. Two deserve more than a line.

### 3.1 The digest changed, and that is the largest single decision here

`docs/roadmap.md`'s task line says *"content-addressed **sha**"*. The shape being frozen used
`compile/hash.ts`'s `hash()` — 64-bit FNV-1a, whose own doc comment says it *"addresses content, it
does not authenticate it"*.

That is correct for the span cache it was written for. It is wrong for a document fetched over a
network and checked against a hash from a different document, which is EPIC-052's `resolve()`. FNV-1a
is collidable on a laptop, so *"the bytes I fetched hash to the value the marker named"* would have
stopped meaning *"these are the bytes that were published"* — while looking exactly like a working
integrity check.

**It is implemented in TypeScript inside `packages/core`**, because that package is zero-dependency
with no DOM and no IO, which rules out both a package and `node:crypto`. `version/diff.ts` set the
precedent for hand-writing a primitive in this package, for the same reason, and says so.

**Nobody has reviewed it.** It matches five published FIPS 180-4 vectors and 131 consecutive message
lengths, which is evidence and not a review. EPIC-057's external review hour is where it should go.

### 3.2 The content address covers the provenance — the reversible one

`model`, `params` and `checkSuiteId` are inside the hash, so **two publishes of a byte-identical blok
set proved by two different check suite runs are two artifacts with two addresses.**

This follows the roadmap, which puts those three inside `BuildArtifact` rather than alongside it, and
the argument for it is that the product's claim is "it cannot go live if it breaks your tests" — an
artifact carrying the proof of that claim is auditable on its own, where provenance in a mutable
marker would rest the claim on a record that can be rewritten.

**It is the one paragraph of ADR-005 most likely to be wrong**, it is named as such there and in §11,
and reversing it is a v2 rather than a patch.

### 3.3 The other three, briefly

- **`LivePointer` is `LiveMarker`.** `CLAUDE.md` forbids *pointer* in code identifiers without the
  "(UI only)" qualifier it gives *assertion* and *artifact*. Same conflict, same resolution, as
  `buildHash` over the Naming section's "Build sha". The word is the mockup's own: *"Publish moves
  the Live marker"*.
- **`became_required` is a fourth break kind** the roadmap's three do not name. A variable that loses
  its default fails for exactly the callers `added_required` fails for.
- **Four things are deliberately out of the format** — a span's `hash`, a blok's `order`, the actor,
  and anything about an account, a key, a cost or a run. §6 is the Review line's evidence.

## 4. What the built-app check found, and what it is

**This epic ships no route, no component and no user-visible string.** It is the EPIC-030 shape, and
this section is the numbered one `docs/AUTONOMOUS.md` asks for rather than an unticked box that reads
like an omission. **There was no feature to drive by hand, and none is claimed.**

What was still owed is that the epic changes `packages/core`'s public surface and `apps/web` both
compiles against that package and **runs it in the browser**. So the built app was built, started and
loaded: `scripts/drive-epic-050.mts`, six assertions, all passing, screenshots in
`docs/epics/reports/screenshots/EPIC-050/`.

| assertion | result |
|---|---|
| the landing page responds | HTTP 200 |
| it is styled, not bare HTML | `--color-ink = "#111"`, body background `rgb(239, 237, 230)` |
| **the token probe can fail** | `--no-such-token` reads `""` |
| the linked stylesheet is real CSS | 200, 68,695 bytes |
| `@41prompts/core` segments and clusters **in the production bundle** | 4 blok cards; the page reports 32 words, 4 bloks, 4 spans, 2 findings |
| the source map renders | Bloks heading visible |

**It found two things about itself**, both worth recording because both are instrument defects rather
than product defects, and an instrument defect is the kind that gets filed as evidence:

1. **The first run reported a styled page as unstyled.** The probe asked for `--ink`; the token is
   `--color-ink`. A false negative, on the exact assertion the 2026-09-13 outage made a rule. The fix
   is the third row above — a deliberately absent token must read empty, so the read is proved able
   to distinguish. `docs/epics/HANDOVER.md` lesson 8, arriving from the other direction.
2. **The 390px screenshot was 2.7 KB of blank page.** The viewport was resized without scrolling
   back to the top, and at 390 the layout is taller, so the inherited scroll position was past the
   end of the content. A blank screenshot filed as evidence is worse than no screenshot.

**What this does not cover, stated so no reader takes it for more than it is:** the image build, the
Coolify environment, Traefik, and migrations against a real database. Nothing is pushed, so nothing
deploys; staging is serving a commit from before EPIC-040 and **no staging URL is evidence about any
of this**.

## 5. The compatibility matrix, in full

Seventeen rows in `compatibility.test.ts`. The four break kinds and the cases that are deliberately
**not** breaks:

| change | breaks? |
|---|---|
| no change at all · nothing declared either side | no |
| added optional | no |
| **added required** | `added_required` — roadmap rule 1 |
| **removed** | `removed` — roadmap rule 2 |
| **became required** (lost its default) | `became_required` — **not in the roadmap's three** |
| became optional (gained a default) | no |
| default value changed | no — a content change, graded by the check suite |
| description changed | no — documentation |
| **type changed**, and type first appearing | `type_changed` — roadmap rule 3; unreachable in v1 |
| renamed | both `removed` and `added_required`, which is what it does to a caller |
| one variable broken two ways | two breaks for one name |
| several at once | in name order |
| declared in a different order | no |
| an empty-string default, kept | no |
| an empty-string default removed | `became_required` — **the case a truthiness test gets wrong** |

The last row is the one to keep: `""` is a default, so a variable with one is optional. A check
written as `if (!defaultValue)` would call it required and miss the break.

## 6. The Review line — "nothing internal leaks through the format"

Three independent mechanisms, because a denylist alone would be worth very little:

1. **The twelve-field freeze** (`schema.test.ts`). Catches *any* new field, named or not, and makes
   somebody decide in public whether it is a v2.
2. **`additionalProperties: false` at every level of the published JSON Schema**, asserted by four
   negative controls including one nested inside a blok. This is the form of the Review line a
   stranger can run.
3. **The denylist walk** (`leak.test.ts`) over every key at every depth, with a planted `ownerEmail`
   as its positive control.

**The denylist deliberately does not police the keys inside `params`.** They are the provider's
parameter names, not ours — `maxOutputTokens` contains two denylisted words and is exactly what a
person meant to publish. What guards `params` is the schema's scalars-only rule, so run telemetry
cannot be smuggled in as a nested object under a harmless key.

## 7. Defects found on the way, and where each was fixed

1. **`canonicalJson` encoded a populated `Map` as `{}`.** `typeof value === "object"` is true of a
   `Map`, a `Set`, a `RegExp` and every class instance, and `Object.keys` of all four is `[]` — so the
   silent-substitution failure the module exists to prevent had one door left open. Found by its own
   test, fixed by testing the **prototype** rather than `typeof`.
2. **`compile/types.ts` said something about this epic that EPIC-040 had already made false.** Its
   `keep` comment claimed EPIC-050's artifact builder wants a fresh compile *without* hand edits. A
   run sends the version's `compiledText`, which `snapshot()` compiles **with** them, so an artifact
   that dropped them would publish text nobody ran — on the epic whose whole point is a publish gate.
   Corrected in place, dated, with the reason.
3. **The two instrument defects in §4.**

## 8. One defect found and deliberately **not** fixed

**`snapshot()` and `compile()` break an `order` tie differently.** `compile/compile.ts` sorts
`a.order - b.order || (a.id < b.id ? -1 : 1)` and its comment says why code-unit and not locale:
*"a locale-aware comparison depends on the machine's environment, and determinism is rule 2"*.
`version/snapshot.ts` uses `left.id.localeCompare(right.id)` for the same tie.

Two bloks sharing an `order` is a state the canvas can reach — `compile()`'s own comment says "the
moment someone drags a card" — and for ids where the two comparisons disagree, a snapshot's
`position` would order the bloks differently from the spans of the text compiled from them.

**Not fixed here**, for a stated reason: changing `snapshot()`'s ordering changes stored
`snapshotHash` values, which are EPIC-041's dedupe key, on an epic that is about a different file.
`artifactOf` follows `compile()`'s rule, so nothing in this epic is exposed to it, and the duplication
is commented at the point it happens. **It is a real latent defect and it is in §11 as an open item**,
not closed quietly.

## 9. No new dependency

Nothing added to any `package.json`. SHA-256, the canonical encoder and the JSON Schema validator are
all written in `packages/core`, which is the package that may not have one.

## 10. Verify commands, with the output

```
pnpm --filter @41prompts/core exec vitest run src/artifact/
  8 files, 152 tests, all passed

pnpm test
  test — every package, every result
  @41prompts/cli PASS · @41prompts/core PASS (47 files, 891 tests) · @41prompts/db PASS
  @41prompts/logger PASS · @41prompts/sdk PASS · @41prompts/ui PASS · @41prompts/web PASS
  @41prompts/worker PASS
  database: throwaway container · 8 checked, 8 passed

pnpm typecheck     8 checked, 8 passed
pnpm lint          11 checked, 11 passed   (incl. dependency-cruiser, turbo boundaries, forbidden words)
```

`node scripts/gate-run.mjs` chose `gates.mjs ci` and ran it on commit `8d6aa9a`:

```
  checkout   git clone + checkout 8d6aa9ab       PASS  0m02s
  ci.yml     pnpm install --frozen-lockfile      PASS  0m07s
             pnpm lint                           PASS  0m22s
             pnpm typecheck                      PASS  0m52s
             pnpm db:migrate                     PASS  0m03s
             pnpm test                           PASS  0m36s
             playwright install chromium         PASS  0m01s
             pnpm e2e                            PASS  5m38s   4 test(s) skipped on darwin
             uv run pytest -q (sdks/python)      PASS  0m04s
  compliance reuse lint                          PASS  0m08s
             pnpm boundaries                     PASS  0m04s
             turbo boundaries                    PASS  0m01s
             pnpm forbidden-words                PASS  0m01s
             pnpm binary-files                   PASS  0m01s
             license-gate --sbom                 PASS  0m02s
             pnpm mirror-dry-run                 PASS  0m32s
  16 step(s), all passed, 8m35s wall
```

**Its closing block, which is part of the result:**

> · The runner is Linux and this is darwin: the four visual-regression baselines are `-linux.png`
> and their specs skip here. A layout change can pass this run and fail CI (2026-09-14, CI #206).
> · The runner is slower than this machine. A test that only fails under load — the 2026-09-14
> `expect.poll` case, CI #209 — passes here for the same reason it passed before.

Neither reaches this epic's changes: it touches no CSS, no component and no timing-sensitive path.
Four e2e tests skipped, all four the visual baselines.

The built-app check:

```
npx turbo run build --filter=@41prompts/web
pnpm --filter @41prompts/web start --port 3000     # apps/web/e2e/env.mjs's placeholders
npx tsx scripts/drive-epic-050.mts
  6 of 6 passed
```

Regenerating the golden fixtures — **by hand, deliberately, reading the diff**:

```
pnpm exec tsx scripts/write-artifact-fixtures.mts
```

## 11. Open, and who owns it

1. **§3.2, provenance inside the content address.** Soroush's, and the one most likely to be
   reversed. Reversing it is a v2 of the format, which is why it is worth answering before EPIC-051
   publishes anything.
2. **Nobody has reviewed the SHA-256.** Five published vectors and 131 message lengths is evidence,
   not a review. EPIC-057's external review hour is the right home.
3. **`CLAUDE.md`'s Naming line still says "Build sha"** while its Vocabulary line forbids `sha` in
   code identifiers. Second time this has been resolved the same way; the Naming line probably
   predates ADR-003 and could simply be corrected. Not edited here — it is a convention change and
   the convention did not change, the conflict was already there.
4. **`docs/roadmap.md` says `LivePointer`.** The type is `LiveMarker`. The roadmap is Soroush's file
   and is not edited from a run.
5. **The `snapshot()`/`compile()` tie-break disagreement** in §8. A one-line fix in
   `version/snapshot.ts`, but it moves stored `snapshotHash` values, so it wants its own small epic
   or a deliberate decision that the existing rows keep their keys.
6. **`ArtifactVariable.type` is reserved and nothing populates it.** ADR-005 §4 makes it the one
   field that may start carrying values inside v1. Whoever designs the type system inherits that
   permission — and the constraint that it is the *only* such permission.
7. **EPIC-051 has to decide where the JSON Schema documents are served from.** They are values in
   `@41prompts/core`, not files; `JSON.stringify(ARTIFACT_JSON_SCHEMA, null, 2)` is the file, and
   the `$id`s currently name `https://41prompts.ai/schema/…`, which nothing serves yet.

## 12. Merge

`git merge --no-ff` into local `main`. The merge commit's message carries what a PR description
carried. Nothing pushed, no PR, no tag.

Commits on the branch:

- `fd84c72` — `docs(epic-050)`: the epic file and the plan
- `8d6aa9a` — `feat(050)`: the implementation, the tests, the fixtures and ADR-005
- the report, the session log, the decisions and the backlog row

## 13. A release is overdue, and it is not this epic's to cut

`docs/AUTONOMOUS.md` stops the loop after every third completed epic. **Five have merged since the
last release** — 040, 041, 043, 042 and now 050 — `origin/main` is behind local `main`, and
`docs/epics/RELEASE-DUE.md` was generated at `f3fa8a2` and is stale. `node scripts/release-due.mjs`
regenerates it. **Cutting it starts with a push only Soroush can make**, so it is reported here
rather than attempted.
