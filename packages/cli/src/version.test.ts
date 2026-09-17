// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { VERSION, getVersionOutput } from "./version.js";

/**
 * `41p --version`.
 *
 * It reads the manifest rather than repeating the number, which is the whole change from EPIC-000's
 * version of this file: that one asserted the literal `"0.0.1"`, and bumping the package to `0.1.0`
 * for EPIC-053 broke it. A test that fails when a version is bumped is not testing anything — it is
 * a second place to edit, and the second place is the one somebody forgets.
 */
const manifest = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8"),
) as { version: string };

describe("41p --version", () => {
  it("is the version in package.json", () => {
    expect(getVersionOutput()).toBe(manifest.version);
    expect(VERSION).toBe(manifest.version);
  });

  it("is a version and not a placeholder", () => {
    // The control: `toBe(manifest.version)` would pass if both were the empty string.
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
