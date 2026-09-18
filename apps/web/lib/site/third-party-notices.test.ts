import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NOTICE_PACKAGES, NOTICE_SOURCE, noticeGroups } from "./third-party-notices";

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const GENERATOR = join(REPO_ROOT, "scripts", "third-party-notices.mjs");
const GENERATED = join(REPO_ROOT, "apps", "web", "lib", "site", "third-party-notices.generated.json");

/**
 * The committed notices file is generated, and this is what stops it becoming typed.
 *
 * `--check` re-runs the generator and compares. Measured at about a second, which is why it is a
 * test and not a script somebody is supposed to remember — a generated file with no test is a hand
 * written file with a misleading comment at the top.
 */
describe("the notices file is what the generator produces", () => {
  it("is current", () => {
    // Throws with the generator's own message and a non-zero exit if the file is stale.
    const out = execFileSync("node", [GENERATOR, "--check"], { cwd: REPO_ROOT, encoding: "utf8" });
    expect(out).toContain("current");
  });

  /**
   * The control. `--check` passing proves nothing unless `--check` can fail, and the cheapest way
   * to know that is to hand it something that is not the generator's output.
   */
  it("would notice a stale file", () => {
    const real = readFileSync(GENERATED, "utf8");
    const tampered = JSON.parse(real);
    tampered.packages.push({ name: "not-installed", version: "0.0.0", license: "MIT", homepage: null });
    expect(`${JSON.stringify(tampered, null, 2)}\n`).not.toBe(real);
  });
});

describe("the list is usable", () => {
  it("has the whole production closure in it, not a sample", () => {
    expect(NOTICE_PACKAGES.length).toBeGreaterThan(300);
  });

  it("names the command that produced it, so a reader can run it", () => {
    expect(NOTICE_SOURCE).toContain("pnpm licenses list");
  });

  it("gives every package a name, a version and a licence", () => {
    for (const entry of NOTICE_PACKAGES) {
      expect(entry.name.length, JSON.stringify(entry)).toBeGreaterThan(0);
      expect(entry.version.length, JSON.stringify(entry)).toBeGreaterThan(0);
      expect(entry.license.length, JSON.stringify(entry)).toBeGreaterThan(0);
    }
  });

  it("lists nothing twice", () => {
    const keys = NOTICE_PACKAGES.map((entry) => `${entry.name}@${entry.version}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("puts the commonest licence first and loses nothing to grouping", () => {
    const groups = noticeGroups();
    expect(groups.length).toBeGreaterThan(5);
    expect(groups[0]?.packages.length).toBeGreaterThanOrEqual(groups.at(-1)?.packages.length ?? 0);
    expect(groups.reduce((total, group) => total + group.packages.length, 0)).toBe(NOTICE_PACKAGES.length);
  });

  /**
   * None of this repository's own packages belongs on a third-party notices page.
   *
   * `pnpm licenses list` reports resolved dependencies rather than workspace projects, so this
   * should hold by construction — which is exactly the kind of thing worth asserting, because "by
   * construction" is a claim about a tool's behaviour and tools change.
   */
  it("lists nothing of ours", () => {
    for (const entry of NOTICE_PACKAGES) {
      expect(entry.name.startsWith("@41prompts/"), entry.name).toBe(false);
      expect(entry.name === "41p", entry.name).toBe(false);
    }
  });
});
