// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/**
 * The golden files (EPIC-053, C2 and C3) — `docs/roadmap.md`'s *"Golden files TS + Python"*.
 *
 * **A golden is only a test while it is not regenerated to match.** There is deliberately no
 * `--update` path and no `E2E_CAPTURE` equivalent here: if one of these fails, either the generator
 * changed on purpose — in which case a person rewrites the file and the diff is the review — or it
 * changed by accident, which is the whole point.
 *
 * `compiles.test.ts` is the other half: these two files are also the ones fed to `tsc --strict` and
 * `mypy --strict`, so a golden nobody can compile cannot quietly sit here looking correct.
 */

import { promptsFile, pythonPromptsFile, typescriptPromptsFile } from "@41prompts/core";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GOLDEN_PROMPTS } from "./goldens.js";

const GOLDENS = join(dirname(fileURLToPath(import.meta.url)), "__goldens__");
const golden = (name: string): string => readFileSync(join(GOLDENS, name), "utf8");

describe("golden files", () => {
  it("prompts.ts is what the generator writes", () => {
    expect(typescriptPromptsFile(GOLDEN_PROMPTS)).toBe(golden("prompts.ts.txt"));
  });

  it("prompts.py is what the generator writes", () => {
    expect(pythonPromptsFile(GOLDEN_PROMPTS)).toBe(golden("prompts.py.txt"));
  });

  it("promptsFile dispatches to the same two functions", () => {
    expect(promptsFile("typescript", GOLDEN_PROMPTS)).toBe(golden("prompts.ts.txt"));
    expect(promptsFile("python", GOLDEN_PROMPTS)).toBe(golden("prompts.py.txt"));
  });

  it("both carry the ownership sentence the roadmap names", () => {
    for (const name of ["prompts.ts.txt", "prompts.py.txt"]) {
      expect(golden(name)).toContain("This file is yours; 41Prompts claims no rights in it.");
    }
  });

  it("the comparison can fail", () => {
    // The control: if `toBe` were comparing something trivially equal, every assertion above would
    // be vacuous. A different prompt set must produce a different file.
    expect(typescriptPromptsFile([GOLDEN_PROMPTS[0]!])).not.toBe(golden("prompts.ts.txt"));
  });
});
