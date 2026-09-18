// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * The unscoped `41p` package (EPIC-053, C15).
 *
 * It is a wrapper, and the whole value of a wrapper is that it contains nothing. These assertions
 * are what stop it acquiring something: the day somebody fixes a bug here instead of in
 * `@41prompts/cli`, the two names start behaving differently and nobody finds out from a version
 * number.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const manifest = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;

const unscoped = manifest(join(HERE, "package.json"));
const scoped = manifest(join(HERE, "..", "cli", "package.json"));

describe("41p wraps @41prompts/cli", () => {
  it("is called 41p and depends on the scoped package", () => {
    expect(unscoped.name).toBe("41p");
    expect(unscoped.dependencies).toEqual({ "@41prompts/cli": "workspace:*" });
  });

  it("provides the same binary name", () => {
    expect((unscoped.bin as Record<string, string>)["41p"]).toBeDefined();
    expect((scoped.bin as Record<string, string>)["41p"]).toBeDefined();
  });

  it("has no source of its own beyond the entry point", () => {
    // `files` is what npm ships. A second module appearing here is the thing being prevented.
    expect(unscoped.files).toEqual(["bin.mjs", "LICENSE", "NOTICE", "README.md"]);
  });

  it("the entry point does nothing but call the scoped package's main", () => {
    const source = readFileSync(join(HERE, "bin.mjs"), "utf8");
    const statements = source
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("//") && !line.startsWith("#!"));
    expect(statements).toEqual(['import { main } from "@41prompts/cli";', "await main();"]);
  });

  it("moves in lockstep with the package it wraps", () => {
    // Two names for one tool. A version skew would mean `npx 41p` and `npx @41prompts/cli` are
    // different programs, which is precisely what an unscoped alias must never become.
    expect(unscoped.version).toBe(scoped.version);
  });

  it("refuses to publish until the public repository exists", () => {
    // EPIC-056's guard, the same one core, cli and the SDK carry.
    const scripts = unscoped.scripts as Record<string, string>;
    expect(scripts.prepublishOnly).toContain("41prompts/41prompts");
  });
});
