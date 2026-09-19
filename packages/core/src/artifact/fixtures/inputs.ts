// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * The one blok set the golden artifact is built from, and the two builders that build it.
 *
 * **One definition, two readers.** `scripts/write-artifact-fixtures.mts` writes the committed JSON
 * from these; `frozen.test.ts` rebuilds from these and compares. If the inputs lived in the script,
 * the test could only re-read the file it was asserting about and would prove nothing; if they lived
 * in the test, regenerating would mean copying them.
 *
 * ## Why this blok set rather than `compile/fixtures`' `five-bloks`
 *
 * A golden file is only worth its maintenance if it exercises the format. This one reaches every
 * corner of it, and each blok is here for a named reason:
 *
 * - **four blok kinds**, one of them `expected` twice over;
 * - **a check with a kind and a check with none** — `kind: null` is the answer v1 writes down, and a
 *   fixture where every check had a kind would never encode it;
 *- **a hand-edited span**, so `state: "edited by hand"` appears in the frozen bytes. A published
 *   prompt must be the text that was tested, and a run sends the version's compiled text with hand
 *   edits in it, so an artifact that dropped them would publish something nobody ran;
 * - **non-ASCII and an astral code point**, because `buildHash` is over UTF-8 bytes and a digest
 *   taken over UTF-16 code units would be wrong-but-stable and pass every other test in this
 *   directory;
 * - **a required variable and an optional one**, declared out of name order so the sort is exercised;
 * - **`params` with two keys inserted in non-alphabetical order**, so the canonical sort is too.
 */

import { compile } from "../../compile/compile.js";
import type { KeptSpan, PromptBlok } from "../../compile/types.js";
import { blokHash } from "../../compile/hash.js";
import { artifactOf, liveMarkerOf, type Artifact, type ArtifactVariable, type LiveMarker } from "../schema.js";

/** `pr_` plus eight hex, per `CLAUDE.md`'s naming and the published schema's own pattern. */
const FIXTURE_PROMPT_ID = "pr_4a1f9c02";

const FIXTURE_BLOKS: readonly PromptBlok[] = [
  {
    id: "blok_ctx01",
    kind: "context",
    order: 10,
    text: "You triage inbound support email for {{company}}.",
  },
  { id: "blok_con01", kind: "constraint", order: 20, text: "Reply in at most 80 words." },
  {
    id: "blok_con02",
    kind: "constraint",
    order: 30,
    text: "Never promise a refund. Say that a human will confirm it.",
  },
  {
    id: "blok_exa01",
    kind: "example",
    order: 40,
    // Non-ASCII on purpose: "café" is two UTF-8 bytes for one code unit, the rocket is four bytes
    // for two code units. A digest taken over the wrong unit cannot match the committed one.
    text: 'Input: "mon café a été facturé deux fois 🚀"\nOutput: {"category":"billing","needs_human":true}',
  },
  {
    id: "blok_exp01",
    kind: "expected",
    order: 50,
    text: "Respond with valid JSON containing category and needs_human.",
  },
  { id: "blok_exp02", kind: "expected", order: 60, text: "The tone should feel warm and human." },
];

/**
 * One span a person took by hand, on `blok_con02`.
 *
 * The hash is the blok's own, computed rather than written out, because a literal would go stale the
 * day `COMPILER_VERSION` moves and the fixture would then record an edit taken from a blok that
 * never existed.
 */
const FIXTURE_HAND_EDITS: ReadonlyMap<string, KeptSpan> = new Map([
  [
    "blok_con02",
    {
      text: "Never promise a refund. A human confirms every refund, without exception.",
      hash: blokHash(FIXTURE_BLOKS[2]!),
    },
  ],
]);

/** Declared out of name order, so `artifactOf`'s sort has something to do. */
const FIXTURE_VARIABLES: readonly ArtifactVariable[] = [
  { name: "locale", defaultValue: "en-GB", description: "Which spelling and date format to use." },
  { name: "company", defaultValue: null, description: "The company whose support email this is." },
];

/** The model the checks were proved against, and the run that proved them. */
const FIXTURE_MODEL = "claude-sonnet-5";
const FIXTURE_CHECK_SUITE_ID = "srun_3f7b1e08c4d29a65";

/** Keys inserted out of alphabetical order, so `canonicalJson`'s sort is exercised by the fixture. */
const FIXTURE_PARAMS = { temperature: 0, maxOutputTokens: 1024 } as const;

/** The golden artifact. Deterministic: same bytes on every machine, on every run, for ever. */
export function fixtureArtifact(): Artifact {
  return artifactOf({
    promptId: FIXTURE_PROMPT_ID,
    compiled: compile(FIXTURE_BLOKS, { keep: FIXTURE_HAND_EDITS }),
    bloks: FIXTURE_BLOKS,
    model: FIXTURE_MODEL,
    params: FIXTURE_PARAMS,
    variables: FIXTURE_VARIABLES,
    checkSuiteId: FIXTURE_CHECK_SUITE_ID,
  });
}

/** A fixed instant, so the marker fixture is as deterministic as the artifact one. */
const FIXTURE_PUBLISHED_AT = new Date("2026-09-16T14:03:07.412Z");
const FIXTURE_VERSION = 6;

/** The golden Live marker, naming the golden artifact. */
export function fixtureLiveMarker(): LiveMarker {
  return liveMarkerOf({
    promptId: FIXTURE_PROMPT_ID,
    buildHash: fixtureArtifact().buildHash,
    version: FIXTURE_VERSION,
    publishedAt: FIXTURE_PUBLISHED_AT,
  });
}
