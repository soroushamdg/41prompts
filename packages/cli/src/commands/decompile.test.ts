// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/**
 * `41p decompile` (EPIC-053, C11).
 *
 * The Northwind assertion is the roadmap's own test line — *"`41p decompile` on the Northwind file
 * yields the known findings"* — and "known" means the committed end-to-end snapshot that
 * `packages/core` already keeps for that prompt, not a second snapshot of the same text.
 */

import { CLUSTER_FIXTURES } from "@41prompts/core/fixtures";
import { cluster, detect, segment } from "@41prompts/core";
import { describe, expect, it } from "vitest";
import { EXIT } from "../exit.js";
import { forbiddenFetch, testEnv } from "../testing.js";
import { decompile } from "./decompile.js";

const NORTHWIND = CLUSTER_FIXTURES.find((fixture) => fixture.name === "prototype-sample");
const northwindText = (): string => {
  if (NORTHWIND === undefined) throw new Error("the prototype-sample fixture is gone");
  return NORTHWIND.text;
};

describe("41p decompile", () => {
  it("yields the known findings for the Northwind sample", () => {
    const source = northwindText();
    const env = testEnv({ files: { "northwind.txt": source }, fetch: forbiddenFetch });

    const result = decompile(env, { file: "northwind.txt", json: true });
    const report = JSON.parse((result.out ?? []).join("\n")) as {
      bloks: unknown[];
      findings: { kind: string }[];
    };

    // The numbers the committed snapshot names: 14 bloks, 7 findings. Derived here from core so the
    // two cannot disagree — a hardcoded 14 would pass while core changed underneath it.
    const bloks = cluster(segment(source));
    const findings = detect(bloks, source);
    expect(bloks).toHaveLength(14);
    expect(findings).toHaveLength(7);

    expect(report.bloks).toHaveLength(bloks.length);
    expect(report.findings.map((finding) => finding.kind)).toEqual(findings.map((finding) => finding.kind));
    expect(report.findings.filter((finding) => finding.kind === "rule_without_check").length).toBeGreaterThan(0);
  });

  it("makes no network request at all", () => {
    // `forbiddenFetch` throws if it is called, so this is a positive control rather than an
    // assumption — `api.test.ts` proves the same stub does fail a command that reaches the network.
    const env = testEnv({ files: { "p.txt": northwindText() }, fetch: forbiddenFetch });
    expect(() => decompile(env, { file: "p.txt" })).not.toThrow();
    expect(env.requested).toEqual([]);
  });

  it("needs no key and no config", () => {
    const env = testEnv({ files: { "p.txt": "Always answer in JSON. Never mention you are an AI." }, fetch: forbiddenFetch });
    const result = decompile(env, { file: "p.txt" });
    expect(result.code).not.toBe(EXIT.CANNOT_ANSWER);
    expect(env.files.has(".41prc")).toBe(false);
  });

  it("prints the bloks with their kinds and range counts", () => {
    const env = testEnv({ files: { "p.txt": northwindText() }, fetch: forbiddenFetch });
    const text = (decompile(env, { file: "p.txt" }).out ?? []).join("\n");
    expect(text).toContain("14 bloks");
    expect(text).toContain("context");
    expect(text).toContain("constraint");
    // The repeated rule is the one that owns two ranges; it is what makes "a blok owns a set of
    // ranges" visible in the output rather than a claim in the documentation.
    expect(text).toContain("2 ranges");
  });

  it("exits 1 when there are findings, so CI can key on it", () => {
    const env = testEnv({ files: { "p.txt": northwindText() }, fetch: forbiddenFetch });
    expect(decompile(env, { file: "p.txt" }).code).toBe(EXIT.ANSWERED_NO);
  });

  it("exits 0 for a prompt with nothing wrong with it", () => {
    const quiet = CLUSTER_FIXTURES.find((fixture) => fixture.name === "all-context");
    if (quiet === undefined) throw new Error("the all-context fixture is gone");
    const env = testEnv({ files: { "p.txt": quiet.text }, fetch: forbiddenFetch });
    const result = decompile(env, { file: "p.txt" });
    // The control for the assertion above: if every prompt exited 1, that test would be vacuous.
    expect(detect(cluster(segment(quiet.text)), quiet.text)).toHaveLength(0);
    expect(result.code).toBe(EXIT.OK);
  });

  it("cannot answer about a file that is not there, or is empty", () => {
    const env = testEnv({ files: { "empty.txt": "   " }, fetch: forbiddenFetch });
    expect(decompile(env, { file: "missing.txt" }).code).toBe(EXIT.CANNOT_ANSWER);
    expect(decompile(env, { file: "empty.txt" }).code).toBe(EXIT.CANNOT_ANSWER);
    expect(decompile(env, {}).code).toBe(EXIT.CANNOT_ANSWER);
  });
});
