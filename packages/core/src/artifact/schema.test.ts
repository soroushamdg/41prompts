// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compile } from "../compile/compile.js";
import { compileFixture } from "../compile/fixtures/prompts.js";
import { COMPILER_VERSION } from "../compile/hash.js";
import { ARTIFACT_SCHEMA_VERSION, artifactOf } from "./schema.js";

const FIVE = compileFixture("five-bloks").bloks;

describe("artifact schema v0", () => {
  it("carries a version field, from the first line", () => {
    expect(ARTIFACT_SCHEMA_VERSION).toBe(0);
    expect(artifactOf("pr_0000beef", compile(FIVE), FIVE).schemaVersion).toBe(0);
  });

  /**
   * The file has to *say* it is not frozen, not merely be unfrozen. `CLAUDE.md` puts it on the
   * do-not-touch list from Stage 5a, and somebody reading it before then needs to know which side of
   * that line they are on without going to look.
   */
  it("says in the file that it is not frozen until Stage 5a", () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "schema.ts"), "utf-8");
    expect(source).toContain("NOT FROZEN until Stage 5a");
  });

  it("records which compiler produced the text, since a different one may produce different bytes", () => {
    expect(artifactOf("pr_0000beef", compile(FIVE), FIVE).compilerVersion).toBe(COMPILER_VERSION);
  });

  it("carries the blok set, so a published prompt can still be explained", () => {
    // An artifact with only the text could be served but not attributed, and attribution back to the
    // owning blok is the product.
    const artifact = artifactOf("pr_0000beef", compile(FIVE), FIVE);
    expect(artifact.bloks).toHaveLength(FIVE.length);
    expect(artifact.spans).toHaveLength(4);
    expect(artifact.checks).toHaveLength(1);
  });

  it("hashes deterministically, and changes when anything in it changes", () => {
    const one = artifactOf("pr_0000beef", compile(FIVE), FIVE);
    expect(artifactOf("pr_0000beef", compile(FIVE), FIVE).buildHash).toBe(one.buildHash);
    expect(artifactOf("pr_0000cafe", compile(FIVE), FIVE).buildHash).not.toBe(one.buildHash);

    const edited = FIVE.map((blok) => (blok.id === "b2" ? { ...blok, text: "Reply briefly." } : blok));
    expect(artifactOf("pr_0000beef", compile(edited), edited).buildHash).not.toBe(one.buildHash);
  });

  it("uses `buildHash`, because ADR-003 forbids `sha` in schema and code identifiers", () => {
    // `CLAUDE.md`'s Naming section says "Build sha"; its Vocabulary section forbids the word. The
    // vocabulary rule is the one ADR-003 decided and the one with a grep behind it. Flagged in the
    // report; asserted here so the two cannot quietly diverge again.
    const artifact = artifactOf("pr_0000beef", compile(FIVE), FIVE);
    expect(Object.keys(artifact)).toContain("buildHash");
    expect(Object.keys(artifact).join(" ").toLowerCase()).not.toContain("sha");
  });
});
