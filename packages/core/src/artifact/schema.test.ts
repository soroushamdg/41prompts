// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compile } from "../compile/compile.js";
import { compileFixture } from "../compile/fixtures/prompts.js";
import { COMPILER_VERSION } from "../compile/hash.js";
import type { PromptBlok } from "../compile/types.js";
import { CanonicalJsonError } from "./canonical.js";
import { fixtureArtifact } from "./fixtures/inputs.js";
import {
  ARTIFACT_SCHEMA_VERSION,
  MARKER_SCHEMA_VERSION,
  artifactBytes,
  artifactOf,
  buildHashOf,
  liveMarkerOf,
  type Artifact,
} from "./schema.js";

const FIVE = compileFixture("five-bloks").bloks;

/** The ordinary call, so no test has to repeat the five required inputs to vary one of them. */
const build = (overrides: Partial<Parameters<typeof artifactOf>[0]> = {}, bloks: readonly PromptBlok[] = FIVE): Artifact =>
  artifactOf({
    promptId: "pr_0000beef",
    compiled: compile(bloks),
    bloks,
    model: "claude-sonnet-5",
    ...overrides,
  });

/**
 * **The twelve fields of v1, written out.**
 *
 * This list is the freeze. A thirteenth field appearing without `ARTIFACT_SCHEMA_VERSION` moving is
 * exactly the change ADR-005 says cannot happen silently, and the assertion below is what makes
 * "silently" impossible — the test fails and whoever added the field has to decide, in public,
 * whether it is a v2.
 */
const V1_FIELDS = [
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
] as const;

describe("artifact schema v1, frozen", () => {
  it("carries exactly the twelve v1 fields and no others", () => {
    expect(Object.keys(build()).sort()).toEqual([...V1_FIELDS].sort());
    expect(ARTIFACT_SCHEMA_VERSION).toBe(1);
    expect(build().schemaVersion).toBe(1);
  });

  /**
   * The file has to *say* which side of the freeze it is on. `CLAUDE.md` puts it on the do-not-touch
   * list from Stage 5a, and the previous version of this test asserted the opposite sentence — which
   * is the point: the claim in the file is load-bearing and is asserted either way.
   */
  it("says in the file that it is frozen, where it used to say it was not", () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "schema.ts"), "utf-8");
    expect(source).toContain("FROZEN as of EPIC-050");
    expect(source).not.toContain("NOT FROZEN until Stage 5a");
  });

  it("records which compiler produced the text, since a different one may produce different bytes", () => {
    expect(build().compilerVersion).toBe(COMPILER_VERSION);
  });

  it("carries the blok set, so a published prompt can still be explained", () => {
    const artifact = build();
    expect(artifact.bloks).toHaveLength(FIVE.length);
    expect(artifact.spans).toHaveLength(4);
    expect(artifact.checks).toHaveLength(1);
  });
});

describe("what the artifact does not carry", () => {
  /** Ruling 5. The compiler's cache key is not a fact about a published, immutable document. */
  it("drops a span's hash, which is the compiler's cache key and means nothing to a reader", () => {
    const compiled = compile(FIVE);
    expect(compiled.spans[0]).toHaveProperty("hash");
    expect(build().spans[0]).not.toHaveProperty("hash");
  });

  /**
   * `order` is the caller's own ordering — a fractional database rank in practice, whose only
   * meaning is its comparison against its siblings. `position` is a contiguous ordinal.
   */
  it("replaces a blok's `order` with a 0-based position in compile order", () => {
    const artifact = build();
    expect(artifact.bloks[0]).not.toHaveProperty("order");
    expect(artifact.bloks.map((blok) => blok.position)).toEqual([0, 1, 2, 3, 4]);
  });

  it("positions bloks by compile order, not by the order the array arrived in", () => {
    const shuffled = [...FIVE].reverse();
    expect(build({}, shuffled).bloks.map((blok) => blok.id)).toEqual(FIVE.map((blok) => blok.id));
  });

  it("writes a check's absent kind as null rather than leaving the key out", () => {
    const kindless = compileFixture("only-expected").bloks;
    const artifact = build({ compiled: compile(kindless), bloks: kindless }, kindless);
    const unnamed = artifact.checks.find((check) => check.kind === null);
    expect(unnamed).toBeDefined();
    expect(Object.keys(unnamed!)).toContain("kind");
  });
});

describe("the content address", () => {
  it("is 64 hex characters of SHA-256, not the compiler's 16", () => {
    expect(build().buildHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    expect(build().buildHash).toBe(build().buildHash);
  });

  it("re-derives from the artifact's own fields, which is what an SDK checks", () => {
    const artifact = build();
    expect(buildHashOf(artifact)).toBe(artifact.buildHash);
  });

  it("fails to re-derive when a field has been tampered with", () => {
    const artifact = build();
    expect(buildHashOf({ ...artifact, text: `${artifact.text}and one more thing` })).not.toBe(artifact.buildHash);
  });

  /**
   * The v0 defect this format was frozen to close: `JSON.stringify` emits keys in insertion order,
   * so an artifact assembled two ways hashed two ways. Exercised through the fields a caller can
   * genuinely present in either order.
   */
  it("does not depend on the order variables, params or bloks arrived in", () => {
    const variables = [
      { name: "one", defaultValue: null, description: null },
      { name: "two", defaultValue: null, description: null },
    ];
    expect(build({ variables }).buildHash).toBe(build({ variables: [...variables].reverse() }).buildHash);

    const forwards: Record<string, number> = {};
    forwards.temperature = 0;
    forwards.maxOutputTokens = 1024;
    const backwards: Record<string, number> = {};
    backwards.maxOutputTokens = 1024;
    backwards.temperature = 0;
    expect(build({ params: forwards }).buildHash).toBe(build({ params: backwards }).buildHash);

    expect(build({}, [...FIVE].reverse()).buildHash).toBe(build().buildHash);
  });

  it("changes when the prompt id, a blok's text, the model, the params or the check suite changes", () => {
    const base = build().buildHash;
    expect(build({ promptId: "pr_0000cafe" }).buildHash).not.toBe(base);
    expect(build({ model: "gpt-4.1-2025-04-14" }).buildHash).not.toBe(base);
    expect(build({ params: { temperature: 1 } }).buildHash).not.toBe(base);
    expect(build({ checkSuiteId: "srun_0000000000000001" }).buildHash).not.toBe(base);

    const edited = FIVE.map((blok) => (blok.id === "b2" ? { ...blok, text: "Reply briefly." } : blok));
    expect(build({}, edited).buildHash).not.toBe(base);
  });

  /**
   * Ruling 3, asserted so that nobody "fixes" it later thinking it an oversight. Two publishes of
   * byte-identical content proved by two different suite runs are two artifacts, because the
   * product's claim is about the proof and not only about the text.
   */
  it("covers the provenance, so identical content with a different proof is a different artifact", () => {
    const one = build({ checkSuiteId: "srun_1111111111111111" });
    const other = build({ checkSuiteId: "srun_2222222222222222" });
    expect(one.text).toBe(other.text);
    expect(one.buildHash).not.toBe(other.buildHash);
  });

  it("serialises to the same bytes the hash was taken over, plus the hash itself", () => {
    const artifact = build();
    const bytes = artifactBytes(artifact);
    expect(JSON.parse(bytes)).toEqual(artifact);
    expect(bytes.startsWith('{"bloks"')).toBe(true); // sorted, so `bloks` is first whatever else is there
  });

  it("refuses params that have no canonical JSON form, rather than hashing a substitute", () => {
    expect(() => build({ params: { temperature: Number.NaN } })).toThrow(CanonicalJsonError);
  });
});

describe("variables in the artifact", () => {
  it("are in name order whatever order they arrived in", () => {
    const artifact = build({
      variables: [
        { name: "zebra", defaultValue: null, description: null },
        { name: "alpha", defaultValue: "a", description: "first" },
      ],
    });
    expect(artifact.variables.map((v) => v.name)).toEqual(["alpha", "zebra"]);
  });

  it("are an empty list by default, rather than an absent field", () => {
    expect(build().variables).toEqual([]);
  });

  it("leave the reserved type field absent rather than writing a placeholder into it", () => {
    const artifact = build({ variables: [{ name: "one", defaultValue: null, description: null }] });
    expect(artifact.variables[0]).not.toHaveProperty("type");
  });
});

describe("the defaults, which are answers rather than omissions", () => {
  it("defaults checkSuiteId to null, which means nothing proved this build", () => {
    expect(build().checkSuiteId).toBeNull();
    expect(Object.keys(build())).toContain("checkSuiteId");
  });

  it("defaults params to an empty object", () => {
    expect(build().params).toEqual({});
  });
});

describe("liveMarkerOf", () => {
  const published = new Date("2026-09-16T14:03:07.412Z");

  it("names an artifact by its build hash and carries its own schema version", () => {
    const marker = liveMarkerOf({ promptId: "pr_0000beef", buildHash: "a".repeat(64), version: 6, publishedAt: published });
    expect(marker).toEqual({
      schemaVersion: MARKER_SCHEMA_VERSION,
      promptId: "pr_0000beef",
      buildHash: "a".repeat(64),
      version: 6,
      publishedAt: "2026-09-16T14:03:07Z",
    });
  });

  it("truncates to second precision rather than publishing three digits of noise", () => {
    const marker = liveMarkerOf({ promptId: "pr_0000beef", buildHash: "a".repeat(64), version: 1, publishedAt: published });
    expect(marker.publishedAt).not.toContain(".");
    expect(marker.publishedAt.endsWith("Z")).toBe(true);
  });

  it("is versioned separately from the artifact, so one may move without the other", () => {
    // Equal today, and the test asserts they are two constants rather than that they are equal.
    expect(MARKER_SCHEMA_VERSION).toBe(1);
    expect(ARTIFACT_SCHEMA_VERSION).toBe(1);
  });

  it("refuses a version that is not a positive integer, rather than publishing v0", () => {
    for (const version of [0, -1, 1.5, Number.NaN]) {
      expect(() =>
        liveMarkerOf({ promptId: "pr_0000beef", buildHash: "a".repeat(64), version, publishedAt: published }),
      ).toThrow(RangeError);
    }
  });

  it("refuses an invalid date, rather than publishing \"Invalid Date\"", () => {
    expect(() =>
      liveMarkerOf({
        promptId: "pr_0000beef",
        buildHash: "a".repeat(64),
        version: 1,
        publishedAt: new Date("not a date"),
      }),
    ).toThrow(RangeError);
  });
});

describe("the fixture builder, which two other files depend on", () => {
  it("builds the same artifact every time it is called", () => {
    expect(fixtureArtifact().buildHash).toBe(fixtureArtifact().buildHash);
  });

  it("exercises a hand-edited span, which is what a run actually sends", () => {
    const states = fixtureArtifact().spans.map((span) => span.state);
    expect(states).toContain("edited by hand");
    expect(states).toContain("compiled");
  });
});
