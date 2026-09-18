// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * The published JSON Schema documents for the two formats in `schema.ts`.
 *
 * ## Who these are for
 *
 * Not for this codebase, which has TypeScript types. For **a reader written in another language** —
 * `sdks/python` (EPIC-054), a customer's Go service, anything that fetches an artifact from the CDN
 * and wants to know what it is looking at before trusting it. ADR-005 declares the format public;
 * these are the machine-readable half of that declaration.
 *
 * ## Why they are built from the same constants the types are
 *
 * `BLOK_KINDS` and `CHECK_KINDS` are spread into the enums rather than written out again. A second
 * list of the six blok kinds is a second list that can disagree with the first, and this repository
 * has already paid for exactly that once: `CLAUDE.md` records the check kinds being written down as
 * a sample of four, read as the whole set, and EPIC-012b concluding a phrase did not exist when it
 * had been in ADR-003 all along. A schema that derives its enums cannot go stale.
 *
 * ## They are objects, and that is not a compromise
 *
 * A JSON Schema document *is* a JSON value. `JSON.stringify(ARTIFACT_JSON_SCHEMA, null, 2)` is the
 * file, and EPIC-051 writes it next to the artifacts it serves. Keeping it as a value rather than a
 * committed `.json` is what lets the enums be derived, and `json-schema.test.ts` validates real
 * fixtures against it so it cannot describe something `artifactOf` does not produce.
 */

import { BLOK_KINDS } from "../classify/types.js";
import { CHECK_KINDS } from "../compile/types.js";
import type { JsonSchema } from "./validate.js";

const DRAFT = "https://json-schema.org/draft/2020-12/schema";

/** `pr_` plus eight hex — `CLAUDE.md`'s naming rule, as a pattern a reader can apply. */
const PROMPT_ID = "^pr_[0-9a-f]{8}$";

/** Sixty-four lower-case hex characters: SHA-256. */
const BUILD_HASH = "^[0-9a-f]{64}$";

/** ISO 8601, UTC, second precision. Exactly what `liveMarkerOf` writes and nothing looser. */
const INSTANT = "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$";

/**
 * The build artifact, version 1.
 *
 * `additionalProperties: false` everywhere, at every level, and that is the load-bearing keyword: it
 * is what makes this document able to say *"nothing else travels in this format"*, which is the
 * epic's Review line written as a constraint a stranger can run.
 */
export const ARTIFACT_JSON_SCHEMA: JsonSchema = {
  $schema: DRAFT,
  $id: "https://41prompts.ai/schema/artifact-v1.json",
  title: "41Prompts build artifact, version 1",
  description:
    "One compiled prompt, the bloks it came from, the checks they became, the variables a caller must supply, and what it was proved against. Content-addressed by buildHash.",
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "compilerVersion",
    "promptId",
    "text",
    "spans",
    "bloks",
    "checks",
    "variables",
    "model",
    "params",
    "checkSuiteId",
    "buildHash",
  ],
  properties: {
    schemaVersion: {
      type: "integer",
      const: 1,
      description: "Read this first. A reader that does not recognise the value must refuse the document, not parse it.",
    },
    compilerVersion: { type: "string", minLength: 1 },
    promptId: { type: "string", pattern: PROMPT_ID },
    text: { type: "string", description: "The compiled prompt, before variables are bound." },
    spans: {
      type: "array",
      description: "Tiles `text` exactly: no gaps, no overlaps. Offsets are UTF-16 code units.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["blokId", "start", "textEnd", "end", "state"],
        properties: {
          blokId: { type: "string", minLength: 1 },
          start: { type: "integer", minimum: 0 },
          textEnd: { type: "integer", minimum: 0 },
          end: { type: "integer", minimum: 0 },
          state: { type: "string", enum: ["compiled", "edited by hand"] },
        },
      },
    },
    bloks: {
      type: "array",
      description: "The blok set, in compile order. Present so a published prompt can still be explained.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "kind", "text", "position"],
        properties: {
          id: { type: "string", minLength: 1 },
          kind: { type: "string", enum: [...BLOK_KINDS] },
          text: { type: "string" },
          position: { type: "integer", minimum: 0 },
        },
      },
    },
    checks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "blokId", "text", "kind"],
        properties: {
          id: { type: "string", minLength: 1 },
          blokId: { type: "string", minLength: 1 },
          text: { type: "string" },
          kind: {
            type: ["string", "null"],
            enum: [...CHECK_KINDS, null],
            description: "null means no kind could honestly be named for this check.",
          },
        },
      },
    },
    variables: {
      type: "array",
      description: "In name order. What a caller must supply, and what they may leave out.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "defaultValue", "description"],
        properties: {
          name: { type: "string", minLength: 1 },
          defaultValue: {
            type: ["string", "null"],
            description: "null means the caller must supply it. Any string, including the empty one, means they need not.",
          },
          description: { type: ["string", "null"] },
          type: {
            type: "string",
            description:
              "Reserved and absent throughout version 1. It may start carrying values without the schema version moving; a reader must tolerate its presence.",
          },
        },
      },
    },
    model: {
      type: "string",
      minLength: 1,
      description: "The pinned model id the checks were proved against. Not a model a caller must use.",
    },
    params: {
      type: "object",
      description: "The provider parameters used for that proof. Scalars only.",
      additionalProperties: { type: ["string", "number", "boolean", "null"] },
    },
    checkSuiteId: {
      type: ["string", "null"],
      description: "The run of checks that proved this build, or null when nothing did.",
    },
    buildHash: {
      type: "string",
      pattern: BUILD_HASH,
      description: "SHA-256 of the canonical JSON of every other field, in UTF-8 bytes.",
    },
  },
};

/**
 * The Live marker, version 1.
 *
 * Five fields, and the shortness is the design. A marker is fetched far more often than an artifact
 * — it is the thing an SDK polls — and everything in it that is not needed to answer *which artifact
 * is Live* is bytes on somebody's hot path and a fact that can go stale against its own source.
 */
export const LIVE_MARKER_JSON_SCHEMA: JsonSchema = {
  $schema: DRAFT,
  $id: "https://41prompts.ai/schema/live-marker-v1.json",
  title: "41Prompts Live marker, version 1",
  description: "Which artifact is Live for one prompt, and when it was published. Versioned separately from the artifact.",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "promptId", "buildHash", "version", "publishedAt"],
  properties: {
    schemaVersion: { type: "integer", const: 1 },
    promptId: { type: "string", pattern: PROMPT_ID },
    buildHash: { type: "string", pattern: BUILD_HASH },
    version: { type: "integer", minimum: 1, description: 'The N a person reads as "Live vN".' },
    publishedAt: { type: "string", pattern: INSTANT, description: "ISO 8601, UTC, second precision." },
  },
};
