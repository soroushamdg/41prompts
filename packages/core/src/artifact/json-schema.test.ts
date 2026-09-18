// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { BLOK_KINDS } from "../classify/types.js";
import { CHECK_KINDS } from "../compile/types.js";
import { compile } from "../compile/compile.js";
import { compileFixture } from "../compile/fixtures/prompts.js";
import { fixtureArtifact, fixtureLiveMarker } from "./fixtures/inputs.js";
import { ARTIFACT_JSON_SCHEMA, LIVE_MARKER_JSON_SCHEMA } from "./json-schema.js";
import { artifactOf, liveMarkerOf } from "./schema.js";
import { validate } from "./validate.js";

/** A deep copy through JSON, so a mutation in one case cannot reach another. */
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * The same copy, typed loosely, for the cases that deliberately put something wrong into it.
 *
 * An `Artifact` is `readonly` all the way down — which is what it should be — so a test that plants
 * a bad value has to say it is leaving the type behind. Doing that through one named helper keeps
 * the cast in one place rather than scattering four of them through the negative controls.
 */
type LooseArtifact = Record<string, unknown> & {
  bloks: Record<string, unknown>[];
  checks: Record<string, unknown>[];
  variables: Record<string, unknown>[];
};
const looseCopy = (value: unknown): LooseArtifact => JSON.parse(JSON.stringify(value)) as LooseArtifact;

describe("the published artifact schema", () => {
  it("validates the golden fixture", () => {
    expect(validate(ARTIFACT_JSON_SCHEMA, copy(fixtureArtifact()))).toEqual([]);
  });

  /**
   * The fixture is one artifact. These are the shapes it does not have — an empty prompt, a prompt
   * that is nothing but checks, a prompt with no variables and no proof — because a schema that only
   * ever meets one document describes that document rather than the format.
   */
  it.each(["five-bloks", "only-expected", "empty", "reordered"])(
    "validates an artifact built from the %s blok set",
    (name) => {
      const bloks = compileFixture(name).bloks;
      const artifact = artifactOf({ promptId: "pr_0000beef", compiled: compile(bloks), bloks, model: "claude-sonnet-5" });
      expect(validate(ARTIFACT_JSON_SCHEMA, copy(artifact))).toEqual([]);
    },
  );

  /**
   * **The negative controls.** A schema that accepts its fixture and also accepts everything else is
   * not a schema. Each of these is a real way a hand-written or ported reader could go wrong.
   */
  describe("rejects a document that is not one", () => {
    it("a missing required field", () => {
      const { model: _dropped, ...without } = copy(fixtureArtifact());
      expect(validate(ARTIFACT_JSON_SCHEMA, without)).toEqual([{ path: "model", message: "required, and missing" }]);
    });

    it("a field of the wrong type", () => {
      const wrong = { ...copy(fixtureArtifact()), text: 42 };
      expect(validate(ARTIFACT_JSON_SCHEMA, wrong)).toHaveLength(1);
    });

    it("an extra property, which is the assertion the Review line turns on", () => {
      const extra = { ...copy(fixtureArtifact()), ownerEmail: "someone@example.com" };
      expect(validate(ARTIFACT_JSON_SCHEMA, extra)).toEqual([
        { path: "ownerEmail", message: "not allowed by the schema" },
      ]);
    });

    it("an extra property nested inside a blok", () => {
      const artifact = looseCopy(fixtureArtifact());
      artifact.bloks[0]!.order = 10;
      expect(validate(ARTIFACT_JSON_SCHEMA, artifact)).toEqual([
        { path: "bloks[0].order", message: "not allowed by the schema" },
      ]);
    });

    it("a schema version it does not recognise", () => {
      const future = { ...copy(fixtureArtifact()), schemaVersion: 2 };
      expect(validate(ARTIFACT_JSON_SCHEMA, future)).toHaveLength(1);
    });

    it("a build hash that is not SHA-256 — the compiler's 16-character digest, for instance", () => {
      const old = { ...copy(fixtureArtifact()), buildHash: "0123456789abcdef" };
      expect(validate(ARTIFACT_JSON_SCHEMA, old)).toHaveLength(1);
    });

    it("a prompt id that is not `pr_` plus eight hex", () => {
      const bad = { ...copy(fixtureArtifact()), promptId: "prompt-1" };
      expect(validate(ARTIFACT_JSON_SCHEMA, bad)).toHaveLength(1);
    });

    it("a blok kind that is not one of the six", () => {
      const artifact = looseCopy(fixtureArtifact());
      artifact.bloks[0]!.kind = "preamble";
      expect(validate(ARTIFACT_JSON_SCHEMA, artifact)).toHaveLength(1);
    });

    it("a params value that is an object rather than a scalar", () => {
      const artifact = { ...copy(fixtureArtifact()), params: { nested: { a: 1 } } };
      expect(validate(ARTIFACT_JSON_SCHEMA, artifact)).toHaveLength(1);
    });

    it("a check kind written as an absent key rather than as null", () => {
      const artifact = looseCopy(fixtureArtifact());
      delete artifact.checks[1]!.kind;
      expect(validate(ARTIFACT_JSON_SCHEMA, artifact)).toEqual([
        { path: "checks[1].kind", message: "required, and missing" },
      ]);
    });
  });

  /**
   * The enums are spread from the same constants the types are built from, so this asserts that the
   * spread happened rather than re-listing the values — which would be the second copy the design
   * exists to avoid.
   */
  it("derives its enums from the code's own constants rather than repeating them", () => {
    const properties = ARTIFACT_JSON_SCHEMA.properties as Record<string, Record<string, Record<string, unknown>>>;
    expect(properties.bloks!.items!.properties).toBeDefined();
    const blokKind = (properties.bloks!.items as unknown as { properties: Record<string, { enum: unknown[] }> })
      .properties.kind!;
    expect(blokKind.enum).toEqual([...BLOK_KINDS]);

    const checkKind = (properties.checks!.items as unknown as { properties: Record<string, { enum: unknown[] }> })
      .properties.kind!;
    expect(checkKind.enum).toEqual([...CHECK_KINDS, null]);
  });

  it("permits the reserved `type` on a variable, so populating it later is not a breaking change", () => {
    const artifact = looseCopy(fixtureArtifact());
    artifact.variables[0]!.type = "string";
    expect(validate(ARTIFACT_JSON_SCHEMA, artifact)).toEqual([]);
  });
});

describe("the published Live marker schema", () => {
  it("validates the golden fixture", () => {
    expect(validate(LIVE_MARKER_JSON_SCHEMA, copy(fixtureLiveMarker()))).toEqual([]);
  });

  it("validates a marker for version 1, the first a prompt ever has", () => {
    const marker = liveMarkerOf({
      promptId: "pr_0000beef",
      buildHash: "a".repeat(64),
      version: 1,
      publishedAt: new Date("2026-01-02T03:04:05Z"),
    });
    expect(validate(LIVE_MARKER_JSON_SCHEMA, copy(marker))).toEqual([]);
  });

  describe("rejects a marker that is not one", () => {
    it("a missing field", () => {
      const { version: _dropped, ...without } = copy(fixtureLiveMarker());
      expect(validate(LIVE_MARKER_JSON_SCHEMA, without)).toEqual([{ path: "version", message: "required, and missing" }]);
    });

    it("an actor, which is the field this format deliberately does not have", () => {
      const named = { ...copy(fixtureLiveMarker()), publishedBy: "Soroush B." };
      expect(validate(LIVE_MARKER_JSON_SCHEMA, named)).toEqual([
        { path: "publishedBy", message: "not allowed by the schema" },
      ]);
    });

    it("a timestamp carrying milliseconds", () => {
      const noisy = { ...copy(fixtureLiveMarker()), publishedAt: "2026-09-16T14:03:07.412Z" };
      expect(validate(LIVE_MARKER_JSON_SCHEMA, noisy)).toHaveLength(1);
    });

    it("a version of zero", () => {
      const zero = { ...copy(fixtureLiveMarker()), version: 0 };
      expect(validate(LIVE_MARKER_JSON_SCHEMA, zero)).toHaveLength(1);
    });
  });
});
