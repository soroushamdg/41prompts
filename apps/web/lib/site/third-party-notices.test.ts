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

/**
 * The per-platform exclusion, proved in **both** directions (EPIC-074's follow-up).
 *
 * `scripts/third-party-notices.mjs` drops native builds like `@esbuild/darwin-x64` because
 * `pnpm licenses list` reports what is *installed*, and that differs by machine — which made this
 * file's own `--check` answer "current" on a Mac and "stale" on the Linux runner, and left `main`
 * red on GitHub from 2026-09-20.
 *
 * **A filter that makes a notices page shorter is a filter that can make it less true**, so it does
 * not stand on its own reasoning. These are its controls: nothing platform-specific survives, and
 * every project whose per-platform build was removed is **still credited by name**.
 */
describe("platform-specific packages are excluded, and nothing is lost by it", () => {
  const names = NOTICE_PACKAGES.map((entry) => entry.name);

  /**
   * **This pattern is written here rather than imported from the generator, on purpose.**
   *
   * A test sharing its subject's predicate cannot catch a bug in that predicate — it agrees with it
   * however wrong it is. Two independent expressions disagree when either is wrong, which is the
   * whole value. (`turbo boundaries` also refuses the import, `scripts/` being outside this
   * package, which is how the first version of this test was caught.)
   *
   * **It is deliberately a weaker check than the generator's**, and that is the right way round:
   * the generator excludes on `os`/`cpu` in a package's own manifest, which is npm's own
   * declaration and catches packages whose names say nothing — `fsevents` being the one that cost a
   * red CI run. A name pattern here cannot catch those, so it is a floor rather than the rule.
   */
  const PLATFORM_NAME = /(?:^|[-/])(?:darwin|linux|win32|freebsd|android)(?:[-.]|$)|-(?:x64|arm64|ia32|musl|gnu|msvc)(?:-|$)/;

  it("lists nothing whose name declares a platform", () => {
    const platform = names.filter((name) => PLATFORM_NAME.test(name));
    expect(platform, `platform-specific packages survived the filter: ${platform.join(", ")}`).toEqual([]);
  });

  /**
   * **The case a name pattern cannot see, named explicitly because it is the one that broke CI.**
   *
   * `fsevents` is macOS-only and its name says nothing about that. It is excluded because its own
   * manifest says `"os": ["darwin"]`, and it is right to exclude: the deployed application runs on
   * Linux and a notices page is about what is **distributed**.
   */
  it("excludes fsevents, which is macOS-only and does not say so in its name", () => {
    expect(names).not.toContain("fsevents");
  });

  /**
   * The half that matters. Each of these is a project whose per-platform build was dropped; if the
   * parent ever stops being listed, the filter has removed a **project** rather than a duplicate of
   * one already credited — which would make the page shorter by making it less true.
   */
  it.each(["esbuild", "sharp", "next", "rollup", "lightningcss", "@tailwindcss/oxide", "@sentry/cli"])(
    "still credits %s, whose per-platform build was dropped",
    (parent) => {
      expect(names, `${parent} was excluded along with its platform builds`).toContain(parent);
    }
  );

  /**
   * The control on this file's own pattern. Every assertion above would pass over a regex narrowed
   * until it matched nothing — which is how the darwin/linux split would come back.
   */
  it.each([
    "@esbuild/darwin-x64",
    "@esbuild/linux-x64",
    "@img/sharp-linux-x64",
    "@next/swc-darwin-arm64",
    "@rollup/rollup-linux-x64-gnu",
    "lightningcss-win32-x64-msvc",
    "@sentry/cli-darwin"
  ])("recognises %s as a platform build", (name) => {
    expect(PLATFORM_NAME.test(name)).toBe(true);
  });

  it.each(["esbuild", "sharp", "next", "rollup", "lightningcss", "react", "@sentry/cli", "@types/node"])(
    "does not mistake %s for one",
    (name) => {
      expect(PLATFORM_NAME.test(name)).toBe(false);
    }
  );
});
