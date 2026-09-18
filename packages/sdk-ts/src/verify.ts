// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Reading a document somebody else served us (EPIC-052).
 *
 * ## Nothing here trusts a byte
 *
 * An artifact arrives over HTTP from a CDN with no session in front of it. ADR-005 §1 says that is
 * deliberate — *"anything in an artifact is public"* — and the consequence is that this module is
 * the only thing standing between a wrong document and a prompt sent to a model. So it checks the
 * version first, then the content address, and only then reads a field.
 *
 * ## The hash is the structural check
 *
 * `buildHashOf` re-derives the address from the document's own body through the same canonical
 * encoding the publisher used. A document with a field added, a field missing, a character changed
 * or a number reformatted does not produce the same address — so a match is a much stronger
 * statement than any field-by-field validation, and it is one somebody in another language can make
 * the same way. The `typeof` checks below are there for the case the hash cannot cover: a document
 * that has never been hashed at all, where a wrong shape would otherwise reach a `.map` call.
 *
 * ## It is core's `buildHashOf`, and there is deliberately no second one
 *
 * `packages/core/src/artifact/schema.ts` says why, and it is the reason this package bundles core
 * rather than restating it: *"the failure mode of a second copy being that verification quietly
 * always passes, or quietly always fails"*.
 */

import {
  ARTIFACT_SCHEMA_VERSION,
  MARKER_SCHEMA_VERSION,
  buildHashOf,
  type Artifact,
  type LiveMarker,
} from "@41prompts/core";
import type { Warning } from "./types.js";

export type Read<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly warning: Warning };

const bad = (code: Warning["code"], message: string, promptId?: string): Read<never> => ({
  ok: false,
  warning: promptId === undefined ? { code, message } : { code, message, promptId },
});

/** A plain object, and not a `Map`, a `Set`, an array or a class instance. EPIC-050's lesson 14. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function parseJson(text: string): Read<unknown> {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return bad("malformed", "the response was not JSON");
  }
}

/**
 * Read a Live marker.
 *
 * Refuses a `schemaVersion` it was written before, per ADR-005 §3 — which here means a warning and a
 * fallback rather than an exception, because rule 8 says this package never throws.
 */
export function readMarker(text: string): Read<LiveMarker> {
  const parsed = parseJson(text);
  if (!parsed.ok) return parsed;
  const document = parsed.value;
  if (!isPlainObject(document)) return bad("malformed", "the Live marker was not an object");

  if (document["schemaVersion"] !== MARKER_SCHEMA_VERSION) {
    return bad(
      "unknown_version",
      `the Live marker is format ${String(document["schemaVersion"])} and this SDK reads ${MARKER_SCHEMA_VERSION}; upgrade @41prompts/sdk`,
    );
  }
  if (typeof document["promptId"] !== "string" || typeof document["buildHash"] !== "string") {
    return bad("malformed", "the Live marker is missing promptId or buildHash");
  }
  if (typeof document["version"] !== "number" || typeof document["publishedAt"] !== "string") {
    return bad("malformed", "the Live marker is missing version or publishedAt");
  }
  return { ok: true, value: document as unknown as LiveMarker };
}

/**
 * Read an artifact, and prove it is the one that is Live.
 *
 * Two checks, and the roadmap's *"artifact sha verified against pointer"* is both of them:
 *
 * 1. **The document hashes to its own address.** Catches corruption and tampering.
 * 2. **That address is the one the marker named.** Catches a document that is intact and is not the
 *    one that is Live — a stale CDN edge, a cache holding a real object from last week, a bucket
 *    prefix serving another environment's builds. A correct artifact for the wrong moment is the
 *    failure nobody would otherwise notice, because everything about it looks right.
 *
 * `expectedHash` is optional because a **bundled** artifact has no marker to be checked against: it
 * was shipped with the application by whoever built it, and there is nothing newer to compare it to.
 * Check 1 still runs on it.
 */
export function readArtifact(text: string, expectedHash?: string): Read<Artifact> {
  const parsed = parseJson(text);
  if (!parsed.ok) return parsed;
  return checkArtifact(parsed.value, expectedHash);
}

/** The same checks against an already-parsed value — what `bundled` holds. */
export function checkArtifact(document: unknown, expectedHash?: string): Read<Artifact> {
  if (!isPlainObject(document)) return bad("malformed", "the build was not an object");

  if (document["schemaVersion"] !== ARTIFACT_SCHEMA_VERSION) {
    return bad(
      "unknown_version",
      `the build is format ${String(document["schemaVersion"])} and this SDK reads ${ARTIFACT_SCHEMA_VERSION}; upgrade @41prompts/sdk`,
    );
  }
  if (typeof document["buildHash"] !== "string" || typeof document["text"] !== "string") {
    return bad("malformed", "the build is missing buildHash or text");
  }
  if (!Array.isArray(document["variables"]) || typeof document["promptId"] !== "string") {
    return bad("malformed", "the build is missing promptId or variables");
  }

  const artifact = document as unknown as Artifact;

  let derived: string;
  try {
    derived = buildHashOf(artifact);
  } catch {
    // `canonicalJson` refuses a value with no canonical form. Parsed JSON has one, so this is only
    // reachable from `bundled`, where a caller may hand us any object at all.
    return bad("malformed", "the build holds a value that cannot be hashed", artifact.promptId);
  }

  if (derived !== artifact.buildHash) {
    return bad("hash_mismatch", "the build does not match its own content address", artifact.promptId);
  }
  if (expectedHash !== undefined && artifact.buildHash !== expectedHash) {
    return bad(
      "hash_mismatch",
      "the build is intact but is not the one the Live marker names",
      artifact.promptId,
    );
  }
  return { ok: true, value: artifact };
}
