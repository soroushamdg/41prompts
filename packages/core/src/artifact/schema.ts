// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/**
 * **Version 0. NOT FROZEN until Stage 5a.**
 *
 * `CLAUDE.md` puts this file on the do-not-touch list *once Stage 5a begins*, because from EPIC-050
 * it is a public contract: an artifact written to R2 with immutable headers, read back by
 * `@41prompts/sdk` and `fortyone-prompts` in versions of those packages that will still be installed
 * years later. Nothing about v0 is a promise. Change it freely until then, and bump
 * `ARTIFACT_SCHEMA_VERSION` when you do.
 *
 * The version field exists from the first line for exactly that reason: an artifact format without a
 * version in the payload cannot be migrated after it ships, and the first shipped reader is the one
 * that has to recognise a v1 it has never seen and refuse it cleanly rather than misparse it.
 *
 * ## What EPIC-050 still has to decide, listed so it is not rediscovered
 *
 * - **Canonical serialisation.** `buildHash` below is over a JSON shape; JSON key order is not
 *   canonical, so two equal artifacts can hash differently. v1 needs a defined byte encoding.
 * - **Integrity.** This hash addresses content, it does not authenticate it. EPIC-057's threat model
 *   covers artifact integrity and pointer abuse, and its answer belongs here.
 * - ~~**The variable contract** (EPIC-022)~~ — **added in v1, 2026-09-13.** The artifact now carries
 *   `variables`. The *compatibility check itself* — comparing a caller's arguments against this
 *   declaration and deciding what counts as a breaking change — is still EPIC-050's.
 * - **Live/Draft pointers**, which are not part of the artifact itself.
 */
export const ARTIFACT_SCHEMA_VERSION = 1;
// v0 → v1 on 2026-09-13: EPIC-022 added `variables`. Bumped because the comment above says to bump
// when the shape changes, and a version field that does not move when the format moves is the one
// thing the first shipped reader cannot recover from. Nothing reads artifacts yet, which is exactly
// why it is free to do now and expensive to start doing later.

import { hash } from "../compile/hash.js";
import { COMPILER_VERSION } from "../compile/hash.js";
import type { Check, Compiled, CompiledSpan, PromptBlok } from "../compile/types.js";
import type { VariableDeclaration } from "../variables/types.js";

/**
 * One compiled prompt, everything needed to serve it, and everything needed to explain it.
 *
 * The blok set travels with the compiled text on purpose: a published artifact that carried only the
 * text could be served but not attributed, and failure attribution back to the owning blok is the
 * product (`CLAUDE.md`'s opening paragraph). An artifact you cannot explain is a string.
 */
export interface Artifact {
  /** `ARTIFACT_SCHEMA_VERSION` as of when this was written. Read it before anything else. */
  readonly schemaVersion: number;
  /** Which compiler produced `text`. A different one may produce different bytes from the same bloks. */
  readonly compilerVersion: string;
  /** `pr_` plus eight hex (`CLAUDE.md` naming). Not validated here; EPIC-021a owns id minting. */
  readonly promptId: string;
  readonly text: string;
  readonly spans: readonly CompiledSpan[];
  readonly checks: readonly Check[];
  readonly bloks: readonly PromptBlok[];
  /**
   * What a caller must supply, and what they may leave out.
   *
   * **In name order**, so two artifacts declaring the same variables serialise identically — v1 has
   * no canonical serialisation yet (see the header) and an incidental ordering would make two equal
   * artifacts hash differently for no reason anybody could see.
   *
   * This is the half of "the variable contract" EPIC-022 owns: the declaration. The other half —
   * what a *compatibility check* considers breaking — is EPIC-050's, and it needs this to exist
   * before it can be written.
   */
  readonly variables: readonly ArtifactVariable[];
  /**
   * Content hash of the compiled artifact.
   *
   * **Named `buildHash`, not `buildSha`, and the two halves of `CLAUDE.md` disagree about that.**
   * Its Naming section calls this "Build sha: content hash of the compiled artifact"; its Vocabulary
   * section forbids `sha` in UI strings, schema *and* code identifiers. The vocabulary rule is the
   * one with a grep behind it and the one ADR-003 actually decided, so it wins here. Flagged in the
   * report rather than settled unilaterally — the Naming line describes the concept and may simply
   * predate the vocabulary.
   */
  readonly buildHash: string;
}

/**
 * A declared variable, as it travels in an artifact.
 *
 * ## `type` is reserved and always absent in v1
 *
 * EPIC-022 ruling Q1: a value type is a **compatibility surface** — the thing a contract check
 * compares a caller's arguments against — and EPIC-050 freezes this format. Shipping a type system
 * nobody had thought hard about would freeze that too, so v1 ships the field and not the feature.
 *
 * It is here rather than added later on purpose. A reader that has always seen the field can start
 * receiving values in it without anything breaking; a reader that has never seen it must be taught
 * about a new field by a version bump it may be too old to understand. **Do not bump the schema
 * version when this starts carrying values** — that is the whole reason for reserving it.
 */
export interface ArtifactVariable extends VariableDeclaration {
  readonly type?: string;
}

/**
 * Assemble an artifact from a compiled prompt and the bloks it came from.
 *
 * **Provisional, and here so that v0 is something you can construct and test rather than a shape
 * nobody has ever built.** EPIC-050 owns the real one, along with the canonical serialisation this
 * deliberately does not have.
 */
export function artifactOf(
  promptId: string,
  compiled: Compiled,
  bloks: readonly PromptBlok[],
  variables: readonly ArtifactVariable[] = []
): Artifact {
  const body = {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    compilerVersion: COMPILER_VERSION,
    promptId,
    text: compiled.text,
    spans: compiled.spans,
    checks: compiled.checks,
    bloks,
    // Sorted here rather than trusted from the caller: the ordering is part of what the hash means,
    // and a caller passing rows in database order would make an equal artifact hash differently.
    variables: [...variables].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  };
  return { ...body, buildHash: hash(JSON.stringify(body)) };
}
