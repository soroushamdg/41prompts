// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CORE_SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * `CLAUDE.md` rule 3, held open for an epic that does not exist yet.
 *
 * A summary is metadata about the text and never a replacement for it: the compiler emits the blok's
 * **verbatim source span**, never its summary. There is no compiler yet — EPIC-020 builds it — so
 * there is nothing to assert against, and the usual answer would be to write the test then.
 *
 * The usual answer is how rules get lost. By the time somebody is writing a compiler, the reason a
 * summary must never reach its output is three epics behind them, and the failure mode is silent:
 * a compiled prompt that reads fine, is shorter than the source, and no longer says what the author
 * wrote. Nothing downstream would notice, because a paraphrase of a rule still looks like a rule.
 *
 * So this is a tripwire instead. It passes while no compiler exists and **fails the moment one
 * does**, with instructions, so that finishing the assertion is part of building the compiler rather
 * than something to remember afterwards.
 */
const COMPILER_PATHS = ["compile", "compiler", "artifact"];

const WHAT_TO_DO = `
A compiler now exists in packages/core, and this placeholder from EPIC-011b has done its job.

Replace the assertion below with the real one:

  - Compile a prompt whose bloks all carry summaries (heuristicSummariser will do).
  - Assert the compiled output contains each blok's VERBATIM source span.
  - Assert the compiled output contains NO summary text, for any blok, from any summariser.
  - Assert it for a multi-range blok too, where the summary is "Rule stated in 2 places" and
    therefore looks nothing like the source — which is exactly the case a naive implementation
    would get wrong without anybody noticing.

Why this matters (CLAUDE.md rule 3, EPIC-011b decision 2): a summary is metadata about the text,
never a replacement for it. A compiled prompt built from summaries reads fine, is shorter than the
source, and no longer says what the author wrote — and nothing downstream can tell, because a
paraphrase of a rule still looks like a rule.
`;

describe("a summary never becomes compiled output (EPIC-011b decision 2)", () => {
  it("is still a placeholder, because no compiler exists yet", () => {
    const found = COMPILER_PATHS.filter((path) => existsSync(join(CORE_SRC, path)));
    expect(found, `${WHAT_TO_DO}\nFound: packages/core/src/${found.join(", ")}`).toEqual([]);
  });

  it("is still a placeholder, because nothing exports a compile function", () => {
    const index = readFileSync(join(CORE_SRC, "index.ts"), "utf-8");
    const exportsCompile = /\bexport\s*\{[^}]*\bcompile\b/.test(index) || /\bexport function compile\b/.test(index);
    expect(exportsCompile, WHAT_TO_DO).toBe(false);
  });

  it("states the rule it is holding open, so the reason survives without the code", () => {
    // The one assertion here that is not a tripwire: the two above only say "not yet", and a test
    // file whose entire content is "not yet" teaches the next reader nothing about why.
    expect(WHAT_TO_DO).toContain("VERBATIM source span");
    expect(WHAT_TO_DO).toContain("NO summary text");
  });
});
