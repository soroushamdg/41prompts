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
 * - **The variable contract** (EPIC-022) and its compatibility check.
 * - **Live/Draft pointers**, which are not part of the artifact itself.
 */
export const ARTIFACT_SCHEMA_VERSION = 0;

import { hash } from "../compile/hash.js";
import { COMPILER_VERSION } from "../compile/hash.js";
import type { Check, Compiled, CompiledSpan, PromptBlok } from "../compile/types.js";

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
 * Assemble an artifact from a compiled prompt and the bloks it came from.
 *
 * **Provisional, and here so that v0 is something you can construct and test rather than a shape
 * nobody has ever built.** EPIC-050 owns the real one, along with the canonical serialisation this
 * deliberately does not have.
 */
export function artifactOf(promptId: string, compiled: Compiled, bloks: readonly PromptBlok[]): Artifact {
  const body = {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    compilerVersion: COMPILER_VERSION,
    promptId,
    text: compiled.text,
    spans: compiled.spans,
    checks: compiled.checks,
    bloks
  };
  return { ...body, buildHash: hash(JSON.stringify(body)) };
}
