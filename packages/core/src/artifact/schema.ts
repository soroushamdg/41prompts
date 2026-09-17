// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/**
 * **Version 1. FROZEN as of EPIC-050, 2026-09-16. This file is a public contract.**
 *
 * `CLAUDE.md` puts this file on the do-not-touch list *once Stage 5a begins*, and Stage 5a began
 * with the epic that wrote this paragraph. From here an artifact is written to R2 with immutable
 * headers, fetched over a network by `@41prompts/sdk` and `fortyone-prompts`, and read by versions
 * of those packages that will still be installed years from now. **Nothing in the shapes below may
 * change without `ARTIFACT_SCHEMA_VERSION` moving**, and moving it is an ADR, not a commit.
 *
 * `docs/decisions/ADR-005-build-artifact.md` is the declaration: what is promised, what a reader
 * must do with a version it does not recognise, and what may still be added without a bump.
 *
 * ## What "frozen" allows, precisely
 *
 * - **Adding an optional field is still a v1 change** *only* where the field was reserved in v1 and
 *   said so. There is exactly one: `ArtifactVariable.type` (EPIC-022 ruling Q1). A reader that has
 *   always seen the key can start receiving values in it; a reader that has never seen it cannot.
 * - **Everything else is a bump.** A new required field, a removed field, a renamed field, a changed
 *   type, a changed meaning, a different canonical encoding, a different digest.
 * - **A bump is not a migration.** Old artifacts are immutable and stay v1 for ever. A bump means
 *   new artifacts are written as v2 and old readers must refuse them cleanly — which is the whole
 *   reason `schemaVersion` is the first field and has been since v0.
 *
 * ## The three mechanisms, and why each is here rather than somewhere convenient
 *
 * 1. **`canonicalJson`** (`canonical.ts`) — one value, one sequence of bytes. v0 hashed
 *    `JSON.stringify`, whose key order is insertion order, so two equal artifacts could hash
 *    differently. A content-addressed format where equal content has two addresses is not one.
 * 2. **`sha256`** (`sha256.ts`) — the digest an SDK verifies a downloaded artifact against. v0 used
 *    `compile/hash.ts`'s 64-bit FNV-1a, whose own comment says it "addresses content, it does not
 *    authenticate it". That is right for a span cache and wrong for a public object.
 * 3. **The content address covers the provenance.** `model`, `params` and `checkSuiteId` are inside
 *    the hash, so two publishes of a byte-identical blok set proved by two different check suite
 *    runs are two artifacts. Deliberate: the product's claim is that a prompt *cannot go live if it
 *    breaks your tests*, and an artifact carrying the proof of that claim is auditable on its own.
 *    Provenance living only in the marker would rest the claim on a record that can be rewritten.
 *
 * ## What is deliberately not in the format
 *
 * The epic's Review line is "nothing internal leaks through the format", and `leak.test.ts` is the
 * enforcement. Four things were in scope and are out:
 *
 * - **A span's `hash`.** The compiler's cache key and the mechanism behind `drift()`. An artifact is
 *   immutable, so there is no "now" for it to drift against.
 * - **A blok's `order`.** The caller's own ordering — a database rank in practice. `position` is a
 *   0-based ordinal instead, for the reason `SnapshotBlok.position` already exists.
 * - **Who published it.** The Deploy page reads that from the audit log, server-side. A public
 *   marker naming a person is a public marker naming a person.
 * - **Anything about an account, a project, a key, a cost, or a run's output.**
 */

import { COMPILER_VERSION } from "../compile/hash.js";
import type { BlokKind } from "../classify/types.js";
import type { CheckKind, Compiled, PromptBlok, SpanState } from "../compile/types.js";
import type { VariableDeclaration } from "../variables/types.js";
import { canonicalJson, type JsonValue } from "./canonical.js";
import { sha256Text } from "./sha256.js";

/**
 * The artifact format's version, in the payload of every artifact.
 *
 * v0 → v1 on 2026-09-13 (EPIC-022 added `variables`). **Frozen at 1 by EPIC-050 on 2026-09-16**;
 * the next move is a v2 and an ADR.
 */
export const ARTIFACT_SCHEMA_VERSION = 1;

/**
 * The Live marker's version, counted separately from the artifact's.
 *
 * Two formats, two clocks. A marker is five small fields that will change for different reasons and
 * on a different schedule from the artifact it names, and one shared number would force a bump on
 * both whenever either moved — which would make every old artifact look stale for a change that
 * never touched it.
 */
export const MARKER_SCHEMA_VERSION = 1;

/** A blok's contribution to `Artifact.text`, and who wrote it. */
export interface ArtifactSpan {
  readonly blokId: string;
  /** Inclusive start of this span's whole contribution, in UTF-16 code units into `Artifact.text`. */
  readonly start: number;
  /** End of the blok's own text; `[textEnd, end)` is the separator. */
  readonly textEnd: number;
  /** Exclusive end of this span's whole contribution. */
  readonly end: number;
  /**
   * `compiled` or `edited by hand` (ADR-003's two words).
   *
   * Kept, where the span's `hash` was dropped, because it is the one fact about a span a *reader* of
   * a published prompt can act on: it says a person wrote these bytes rather than the compiler, so
   * attribution back to the blok is an attribution to an exception somebody made.
   */
  readonly state: SpanState;
}

/**
 * One blok, as it stood when this artifact was built.
 *
 * The blok set travels with the compiled text on purpose: an artifact carrying only the text could
 * be served but not attributed, and failure attribution back to the owning blok is the product
 * (`CLAUDE.md`'s opening paragraph). An artifact you cannot explain is a string.
 */
export interface ArtifactBlok {
  readonly id: string;
  readonly kind: BlokKind;
  /** Verbatim. The compiler emits it unchanged and never paraphrases it (`CLAUDE.md` rule 3). */
  readonly text: string;
  /**
   * Zero-based position in compile order — **not** the `order` the caller passed in.
   *
   * `PromptBlok.order` is whatever ordering the caller had: a fractional database rank in practice,
   * whose only meaning is its comparison against its own siblings. Publishing it would put an
   * internal key into a public format and tell a reader nothing, and `SnapshotBlok.position` already
   * made this exact trade for the same reason.
   */
  readonly position: number;
}

/**
 * One check this prompt's expected bloks became.
 *
 * `kind` is `null` rather than absent when no kind could honestly be named. A public format should
 * not make a reader ask whether a missing key means "no kind" or "an older writer" — *"nobody could
 * name one"* is an answer, and `null` is how an answer is written down.
 */
export interface ArtifactCheck {
  readonly id: string;
  readonly blokId: string;
  /** The expected blok's verbatim text — what the check is about, never a paraphrase of it. */
  readonly text: string;
  readonly kind: CheckKind | null;
}

/**
 * A declared variable, as it travels in an artifact.
 *
 * ## `type` is reserved and always absent in v1
 *
 * EPIC-022 ruling Q1: a value type is a **compatibility surface** — the thing `isCompatible`
 * compares — and this format is frozen. Shipping a type system nobody had thought hard about would
 * freeze that too, so v1 ships the field and not the feature.
 *
 * It is declared rather than added later on purpose, and this is the one field the freeze above
 * permits to start carrying values. A reader that has always seen the key can begin receiving one
 * without anything breaking; a reader that has never seen it must be taught by a version bump it may
 * be too old to understand. **Do not move `ARTIFACT_SCHEMA_VERSION` when this starts carrying
 * values** — that is the whole reason for reserving it.
 */
export interface ArtifactVariable extends VariableDeclaration {
  readonly type?: string;
}

/**
 * The provider parameters the checks were proved under.
 *
 * **Scalars only.** A nested object would need a canonical encoding decision of its own — how deep,
 * what about arrays of objects, what does a reader in another language do with it — for something no
 * provider in `MODEL_CATALOGUE` asks for. `temperature`, `top_p`, `max_tokens` and their siblings
 * are numbers, strings and booleans.
 */
export type ArtifactParams = Readonly<Record<string, string | number | boolean | null>>;

/**
 * One compiled prompt, everything needed to serve it, and everything needed to explain it.
 *
 * **Twelve fields, frozen.** `schema.test.ts` fails if a thirteenth appears without
 * `ARTIFACT_SCHEMA_VERSION` moving with it.
 */
export interface Artifact {
  /** `ARTIFACT_SCHEMA_VERSION` as of when this was written. Read it before anything else. */
  readonly schemaVersion: number;
  /** Which compiler produced `text`. A different one may produce different bytes from the same bloks. */
  readonly compilerVersion: string;
  /** `pr_` plus eight hex (`CLAUDE.md` naming). Not validated here; EPIC-021a owns id minting. */
  readonly promptId: string;
  /** The compiled prompt, verbatim — the bytes a provider is sent, before variables are bound. */
  readonly text: string;
  /** The spans that tile `text` exactly: no gaps, no overlaps. */
  readonly spans: readonly ArtifactSpan[];
  /** The blok set, in compile order. */
  readonly bloks: readonly ArtifactBlok[];
  /** What the expected bloks became. Empty is normal; a prompt need not check anything. */
  readonly checks: readonly ArtifactCheck[];
  /**
   * What a caller must supply, and what they may leave out.
   *
   * **In name order**, so two artifacts declaring the same variables serialise identically whatever
   * order the rows arrived in. `isCompatible` reads this and nothing else.
   */
  readonly variables: readonly ArtifactVariable[];
  /**
   * The pinned model id the checks were **proved against**, not a model a caller must use.
   *
   * `CLAUDE.md` rule 9 blocks publishing when checks fail *on the target model*, so an artifact that
   * did not say which model that was could not support the sentence the product sells. A caller is
   * free to send this prompt to a different model; what they lose by doing so is this guarantee, and
   * they can only know that because the field is here.
   */
  readonly model: string;
  /** The parameters used for that proof. */
  readonly params: ArtifactParams;
  /**
   * The run of checks that proved it, or `null` when nothing did.
   *
   * `null` is a real and common answer: a prompt with no expected bloks has nothing to prove, and
   * publishing it is not an exception. It is deliberately **not** an optional key — "no suite stands
   * behind this build" is a fact a reader should have to look at, and an absent key is a fact a
   * reader can miss.
   */
  readonly checkSuiteId: string | null;
  /**
   * `sha256` of the canonical JSON of every field above, in UTF-8 bytes.
   *
   * **Named `buildHash`, not `buildSha`.** `CLAUDE.md`'s Naming section calls this "Build sha"; its
   * Vocabulary section forbids `sha` in UI strings, schema *and* code identifiers. The vocabulary
   * rule is the one ADR-003 decided and the one with a grep behind it, so it wins — as it did for
   * `LiveMarker` over the roadmap's `LivePointer`.
   */
  readonly buildHash: string;
}

/**
 * What is Live: one prompt, one artifact, one moment.
 *
 * ## It is called a marker
 *
 * `docs/roadmap.md` says `LivePointer`. `CLAUDE.md`'s Vocabulary section forbids **pointer** in "UI
 * strings, schema, or code identifiers", without the "(UI only)" qualifier it gives *assertion* and
 * *artifact*. The word is not invented to dodge a grep: `41prompts-full-mockup.html` already says
 * *"Publish moves the **Live marker**"* in the product's own copy.
 *
 * ## It carries a hash, not a URL
 *
 * Where an artifact is served from is an operational fact that changes with a bucket, a CDN or a
 * region, and a marker that embedded one would be a frozen copy of a decision somebody will make
 * again. The hash is the artifact's identity anywhere it is stored; EPIC-051 owns the URL layout and
 * EPIC-052 owns fetching.
 *
 * ## It carries no actor
 *
 * A marker is served publicly. The Deploy page's "Published 2 days ago by Soroush B." comes from the
 * audit log, read server-side by somebody who is signed in.
 */
export interface LiveMarker {
  /** `MARKER_SCHEMA_VERSION`. Its own clock; see the constant. */
  readonly schemaVersion: number;
  readonly promptId: string;
  /** The `buildHash` of the artifact that is Live. */
  readonly buildHash: string;
  /** The N a person reads as "Live vN". 1-based, like `prompt_versions.n`. */
  readonly version: number;
  /**
   * ISO 8601, UTC, **second precision** — `2026-09-16T14:03:07Z`.
   *
   * Truncated rather than milliseconds because what this answers is "published 2 days ago", and a
   * millisecond in a public format is three digits of noise that two writers could disagree about.
   * Formatted here rather than by the caller so that two callers cannot format it two ways.
   */
  readonly publishedAt: string;
}

/** What `artifactOf` needs. An object rather than eight positional arguments. */
export interface ArtifactInput {
  readonly promptId: string;
  /** From `compile(bloks)`. A fresh compile, so an artifact publishes what the bloks say. */
  readonly compiled: Compiled;
  readonly bloks: readonly PromptBlok[];
  /** The pinned model id the checks were proved against. */
  readonly model: string;
  readonly params?: ArtifactParams;
  readonly variables?: readonly ArtifactVariable[];
  readonly checkSuiteId?: string | null;
}

/** What `liveMarkerOf` needs. */
export interface LiveMarkerInput {
  readonly promptId: string;
  readonly buildHash: string;
  readonly version: number;
  readonly publishedAt: Date;
}

/**
 * Sort by `order`, then by `id` — **exactly `compile()`'s rule**, not `snapshot()`'s.
 *
 * The two differ: `compile()` breaks ties by code unit and says why (a locale-aware comparison
 * depends on the machine's environment, and determinism is rule 2), while `snapshot()` uses
 * `localeCompare`. The artifact's `position` has to agree with its own `spans`, which come from
 * `compile()`, so this follows `compile()`. Duplicated rather than imported because `compile`'s
 * `ordered` is private and exporting it would widen that module's surface for one caller.
 */
function inCompileOrder(bloks: readonly PromptBlok[]): PromptBlok[] {
  return [...bloks].sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

const byName = (a: ArtifactVariable, b: ArtifactVariable): number =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : 0;

/**
 * Assemble an artifact from a compiled prompt and the bloks it came from.
 *
 * Everything that can be derived is derived here rather than accepted from the caller — span
 * offsets, blok positions, variable order, the digest — because a caller passing a value the
 * assembler could have computed will eventually pass a stale one, and an artifact is immutable, so
 * nothing later re-checks it. `snapshot()` made the same call for the same reason.
 *
 * @throws {CanonicalJsonError} if `params` holds anything that has no canonical JSON form.
 */
export function artifactOf(input: ArtifactInput): Artifact {
  const positions = new Map(inCompileOrder(input.bloks).map((blok, position) => [blok.id, position]));

  const body = {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    compilerVersion: COMPILER_VERSION,
    promptId: input.promptId,
    text: input.compiled.text,
    // `hash` is dropped here, and that is the one place it happens. See the header.
    spans: input.compiled.spans.map((span) => ({
      blokId: span.blokId,
      start: span.start,
      textEnd: span.textEnd,
      end: span.end,
      state: span.state,
    })),
    bloks: inCompileOrder(input.bloks).map((blok) => ({
      id: blok.id,
      kind: blok.kind,
      text: blok.text,
      position: positions.get(blok.id) ?? 0,
    })),
    checks: input.compiled.checks.map((check) => ({
      id: check.id,
      blokId: check.blokId,
      text: check.text,
      kind: check.kind ?? null,
    })),
    // Sorted here rather than trusted from the caller: the ordering is part of what the hash means,
    // and a caller passing rows in database order would make an equal artifact hash differently.
    variables: [...(input.variables ?? [])].sort(byName),
    model: input.model,
    params: input.params ?? {},
    checkSuiteId: input.checkSuiteId ?? null,
  } as const;

  return { ...body, buildHash: sha256Text(canonicalJson(body as unknown as JsonValue)) };
}

/**
 * Assemble the Live marker for an artifact.
 *
 * Refuses a version that is not a positive integer and a date that is not a date, rather than
 * emitting a marker saying `"v0"` or `"Invalid Date"`. A marker is published and immutable; the
 * cheapest moment to find out it is wrong is this one.
 */
export function liveMarkerOf(input: LiveMarkerInput): LiveMarker {
  if (!Number.isInteger(input.version) || input.version < 1) {
    throw new RangeError(`liveMarkerOf: version must be a positive integer, got ${String(input.version)}`);
  }
  const time = input.publishedAt.getTime();
  if (!Number.isFinite(time)) {
    throw new RangeError("liveMarkerOf: publishedAt is not a valid date");
  }
  return {
    schemaVersion: MARKER_SCHEMA_VERSION,
    promptId: input.promptId,
    buildHash: input.buildHash,
    version: input.version,
    // `.sss` dropped; see `LiveMarker.publishedAt`. `toISOString` is always UTC and always this shape.
    publishedAt: `${new Date(time).toISOString().slice(0, 19)}Z`,
  };
}

/**
 * The canonical bytes of an artifact — what `buildHash` is over, and what is written to R2.
 *
 * Exported because EPIC-051 has to store exactly these bytes and EPIC-052 has to hash exactly these
 * bytes, and a second implementation of "how an artifact is serialised" in either of them is a copy
 * of a decision that lives here. `buildHash` is excluded from its own digest and included in the
 * stored document, which is why this is not simply `canonicalJson(artifact)`.
 */
export function artifactBytes(artifact: Artifact): string {
  return canonicalJson(artifact as unknown as JsonValue);
}

/**
 * Re-derive an artifact's `buildHash` from its own fields.
 *
 * The check an SDK makes on a document it fetched: recompute, compare, refuse on a mismatch. It is
 * here rather than in the SDK so that the two cannot disagree about what is hashed — the failure
 * mode of a second copy being that verification quietly always passes, or quietly always fails.
 */
export function buildHashOf(artifact: Artifact): string {
  const { buildHash: _ignored, ...body } = artifact;
  return sha256Text(canonicalJson(body as unknown as JsonValue));
}
