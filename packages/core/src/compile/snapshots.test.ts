// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { compile } from "./compile.js";
import { drift } from "./drift.js";
import { editSpan } from "./edit-span.js";
import { COMPILE_FIXTURES, compileFixture } from "./fixtures/prompts.js";
import type { Compiled, PromptBlok } from "./types.js";

/**
 * Committed compiled snapshots, in the same style as `detect/fixtures/snapshots`.
 *
 * Readable on purpose: a snapshot of `JSON.stringify(compiled)` would diff as one unreadable line
 * and nobody would review it. This renders the text with its span boundaries marked, so a change to
 * the separator rule, the ordering, or who owns which characters shows up as something a person can
 * read in a pull request.
 */
function render(name: string, describes: string, compiled: Compiled, bloks: readonly PromptBlok[]): string {
  // REUSE-IgnoreStart -- the header written into every generated snapshot, not a licence for this file.
  const header = [
    "# SPDX-FileCopyrightText: 2026 41Prompts Inc.",
    "# SPDX-License-Identifier: Apache-2.0",
    "#",
    `# ${name} — ${describes}`,
    "#",
    "# Generated. Regenerate with:  pnpm --filter @41prompts/core exec vitest run -u",
    `# ${bloks.length} blok(s) -> ${compiled.spans.length} span(s), ${compiled.checks.length} check(s), ` +
      `${compiled.text.length} code units`,
    ""
  ];
  // REUSE-IgnoreEnd

  const spans = compiled.spans.map((span) => {
    const text = JSON.stringify(compiled.text.slice(span.start, span.textEnd));
    const separator = JSON.stringify(compiled.text.slice(span.textEnd, span.end));
    return `  ${String(span.start).padStart(4)}..${String(span.textEnd).padStart(4)}..${String(span.end).padStart(4)}  ${span.state}  ${span.hash}  ${text} + ${separator}`;
  });

  const checks = compiled.checks.map(
    (check) => `  ${check.id}  ${check.kind ?? "(no kind named)"}  ${JSON.stringify(check.text)}`
  );

  return `${[
    ...header,
    "## compiled text",
    JSON.stringify(compiled.text),
    "",
    "## spans  start..textEnd..end  state  hash  text + separator",
    ...(spans.length === 0 ? ["  (none)"] : spans),
    "",
    "## checks",
    ...(checks.length === 0 ? ["  (none)"] : checks)
  ].join("\n")}\n`;
}

describe("committed compiled snapshots", () => {
  it.each(COMPILE_FIXTURES.map((fixture) => ({ name: fixture.name, fixture })))(
    "compiles $name identically to its committed snapshot",
    async ({ fixture }) => {
      await expect(render(fixture.name, fixture.describes, compile(fixture.bloks), fixture.bloks)).toMatchFileSnapshot(
        `./fixtures/snapshots/${fixture.name}.snap.txt`
      );
    }
  );

  /**
   * The fifth fixture the epic asks for, which cannot be a blok set on its own: a hand-edited span
   * is a property of a `Compiled`, not of the bloks. Committed with its drift report, because the
   * two facts are the thing to keep an eye on across any change to this package.
   */
  it("compiles, edits one span by hand, and reports drift identically to its committed snapshot", async () => {
    const fixture = compileFixture("five-bloks");
    const edited = editSpan(compile(fixture.bloks), "b2", "Reply in at most 60 words, and never hedge.");

    // The blok set has moved on under the edit, in two different ways, so that the snapshot carries
    // **all four drift cells at once** — which is what makes it worth committing rather than
    // asserting inline. b3's text changed after the person typed; b1 was only reclassified, so its
    // hash moved and its rendered text did not.
    const movedOn = fixture.bloks.map((blok) =>
      blok.id === "b3"
        ? { ...blok, text: "Never promise a refund." }
        : blok.id === "b1"
          ? { ...blok, kind: "constraint" as const }
          : blok
    );

    const report = drift(edited, movedOn);
    const rows = report.spans.map(
      (span) =>
        `  ${span.blokId}  ${span.state.padEnd(14)}  text differs: ${String(span.textDiffersFromBlok).padEnd(5)}  blok changed since: ${span.blokChangedSinceSpan}`
    );

    await expect(
      `${render("one-blok-edited-by-hand", fixture.describes, edited, movedOn)}\n## drift\n${rows.join("\n")}\n`
    ).toMatchFileSnapshot("./fixtures/snapshots/one-blok-edited-by-hand.snap.txt");
  });
});
