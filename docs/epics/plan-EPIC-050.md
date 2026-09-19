<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# Plan — EPIC-050: the build artifact, frozen, and the compatibility rule

Written before any code, per `CLAUDE.md`'s "How to work". Unattended, "show the plan" means write it
down first (`docs/AUTONOMOUS.md` step 2).

## What exists today, read rather than remembered

| fact | where | consequence for this plan |
|---|---|---|
| `Artifact` has 9 fields and a provisional `artifactOf(promptId, compiled, bloks, variables?)` | `packages/core/src/artifact/schema.ts` | the shape and the signature both change |
| `artifactOf` has **no caller** outside core's own tests | `grep -rn artifactOf apps packages` → `index.ts`, `schema.ts`, `schema.test.ts` | the signature change is free; no `apps/*` edit is owed |
| `hash()` is 64-bit FNV-1a and says so: "addresses content, it does not authenticate it" | `compile/hash.ts` | the artifact needs a different digest; `hash()` itself is untouched |
| `buildHash` is over `JSON.stringify(body)` | `artifact/schema.ts` | key order is insertion order; not canonical |
| core is zero-dependency, no DOM, no IO; `version/diff.ts` hand-counts UTF-8 rather than use `TextEncoder` | `CLAUDE.md`, `version/diff.ts:13-22` | SHA-256 and UTF-8 encoding are written out in TS |
| `CompiledSpan` carries `hash` and `state`; `PromptBlok` carries `order` | `compile/types.ts` | the artifact's own span and blok types are narrower — ruling 5 |
| `VariableDeclaration` is `{name, defaultValue, description}`; `type` is reserved on `ArtifactVariable` | `variables/types.ts`, `artifact/schema.ts` | `isCompatible`'s type branch is real code with no v1 instance |
| `MODEL_CATALOGUE` ids are pinned; `suite_runs.model` is "resolved and pinned" | `packages/db/src/constants.ts`, `schema.ts` | `model` in the artifact is a pinned id, unvalidated by core |
| `forbidden-words.mjs` scans `packages/ui/src`, `apps/web/app`, `apps/web/lib` — **not** `packages/core` | `scripts/forbidden-words.mjs` | the `LiveMarker` rename is a `CLAUDE.md` rule, not a gate; no gate would have caught `LivePointer` |

## The shape, decided

```ts
interface Artifact {
  schemaVersion: number;          // 1
  compilerVersion: string;        // "compile@3"
  promptId: string;               // pr_ + 8 hex
  text: string;                   // the compiled prompt, verbatim
  spans: ArtifactSpan[];          // blokId, start, textEnd, end, state
  bloks: ArtifactBlok[];          // id, kind, text, position
  checks: ArtifactCheck[];        // id, blokId, text, kind | null
  variables: ArtifactVariable[];  // name, defaultValue, description, type?
  model: string;                  // the pinned id the checks were proved against
  params: ArtifactParams;         // Record<string, string | number | boolean | null>
  checkSuiteId: string | null;    // the run that proved it; null = nothing did
  buildHash: string;              // sha256(canonicalJson(everything above))
}

interface LiveMarker {
  schemaVersion: number;          // 1, its own
  promptId: string;
  buildHash: string;              // the artifact this names
  version: number;                // the N in "Live vN"
  publishedAt: string;            // ISO 8601 UTC, second precision
}
```

Twelve fields and five. `checks[].kind` is `null` rather than absent, because a JSON Schema for a
public format should not have to say "this key may be missing" for a fact that is always known —
"no kind could be named" is an answer, and `null` is how it is written down.

## Order of work

Each step ends green before the next starts.

1. **`sha256.ts`** — `sha256Hex(bytes)`, `utf8Bytes(text)`. Pure TS, no builtins. Tests first from
   the NIST vectors: `""`, `"abc"`, the 448-bit and 896-bit messages, a million `a`s (skipped from
   the default run if slow — decide by measuring, not by guessing), plus non-ASCII and an emoji so
   the UTF-8 half is proved rather than assumed.
2. **`canonical.ts`** — `canonicalJson(value): string`. Sorted keys by UTF-16 code unit (RFC 8785's
   rule for the ASCII subset every key here lives in), arrays in order, `JSON.stringify`'s own string
   escaping, `undefined`/function/non-finite/cycle **refused** with a named error.
3. **`schema.ts`** — the twelve fields, `artifactOf(input)`, `liveMarkerOf(input)`, the frozen header
   replacing the "NOT FROZEN" one. `buildHash = sha256Hex(utf8Bytes(canonicalJson(body)))`.
4. **`compatibility.ts`** — `isCompatible(live, next)`, four break kinds.
5. **`json-schema.ts` + `validate.ts`** — the two documents, and the subset validator that refuses an
   unimplemented keyword rather than ignoring it.
6. **`fixtures/`** — write the golden artifact and marker out **once**, by running the code, then
   commit them and assert equality forever after. The generator is a test-only helper guarded so it
   cannot rewrite the committed file during an ordinary run (`PROCESS.md`: a test suite never writes
   into the working tree).
7. **`leak.test.ts`** — the denylist walk, with its positive control.
8. **`index.ts`** exports; **ADR-005**; report; session log; backlog cell.

## Traps, named in advance

- **A fixture generator that runs by default rewrites the tree.** `PROCESS.md` has a whole section on
  it. The generator is a script under `scripts/`, not a test.
- **A golden fixture that is regenerated when it fails is not a golden fixture.** The test compares;
  it never writes.
- **`Object.keys` order is insertion order, not sorted** — the canonical encoder must sort, and the
  test must build the two objects with keys inserted in opposite orders or it proves nothing.
- **Asserting an absence needs a positive control** (handover lesson 8). The leak test gets an
  artifact with a planted `ownerEmail` and must fail on it.
- **`sha256` over UTF-16 code units instead of UTF-8 bytes** silently produces a wrong-but-stable
  digest that every test written from the implementation would pass. The NIST vectors are over bytes,
  which is why they are the test rather than a round-trip.
- **`checkSuiteId` in the hash** means re-publishing identical content after a new run is a new
  artifact. Intended (ruling 3), and asserted so nobody "fixes" it.

## What this plan does not do

No route, no component, no string a person reads; no publish path, no R2, no SDK. The built app is
started and a page loaded as a **build regression check** — `artifactOf`'s signature changed and
`apps/web` compiles against core — and the report says that is what the screenshot is.
