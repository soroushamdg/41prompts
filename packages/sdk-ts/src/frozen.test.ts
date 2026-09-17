// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/**
 * The public API is frozen (EPIC-052, C13 — `docs/decisions/ADR-006-sdk-public-api.md`).
 *
 * The same shape as `packages/core/src/artifact/frozen.test.ts`, and for the same reason: a surface
 * somebody installs and pins cannot be widened by accident. Adding an export is a deliberate act
 * that changes this list, an ADR and a minor version — not something that happens because a helper
 * looked useful from outside the module it lives in.
 *
 * **Why a list and not a snapshot.** A snapshot updates itself the moment somebody runs the suite
 * with `-u`, which is exactly the moment the freeze needed to say something.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as sdk from "./index.js";

/** Three functions. Everything else in this package is internal. */
const FROZEN_VALUES = ["configure", "createClient", "resolve"] as const;

/** The types those three name, transitively. Erased at runtime, so they are read from the source. */
const FROZEN_TYPES = [
  "Client",
  "ClientOptions",
  "FetchLike",
  "FetchResponse",
  "ResolveOptions",
  "ResolveResult",
  "ResolveSource",
  "Warning",
  "WarningCode",
] as const;

describe("the frozen surface", () => {
  it("exports exactly three values", () => {
    expect(Object.keys(sdk).sort()).toEqual([...FROZEN_VALUES]);
  });

  it("exports exactly the documented types", () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "index.ts"), "utf8");
    const block = /export type \{([^}]*)\}/.exec(source)?.[1] ?? "";
    const exported = block
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name.length > 0)
      .sort();

    expect(exported).toEqual([...FROZEN_TYPES]);
  });

  it("every frozen value is a function, so the list cannot be satisfied by a constant", () => {
    for (const name of FROZEN_VALUES) {
      expect(typeof (sdk as unknown as Record<string, unknown>)[name]).toBe("function");
    }
  });

  it("resolve() and createClient() answer without any configuration at all", () => {
    // The surface has to be usable by somebody who read three lines of the README, and it must not
    // throw for them either — which is where `CLAUDE.md` rule 8 meets ADR-006.
    const client = sdk.createClient({ cacheDir: null, onWarning: () => undefined });
    expect(client.resolve("pr_1a2b3c4d").status).toBe("unavailable");
    client.close();
  });
});
