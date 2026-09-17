import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The ADR-003 vocabulary gate, and specifically its **"(UI only)"** qualifier (EPIC-051).
 *
 * `CLAUDE.md`'s Vocabulary line marks two of its eleven words that way — *assertion* and *artifact*
 * — and ADR-003 says the same thing twice over: "the internal type may be `Check`; the word
 * 'assertion' does not appear in the UI", and "Never in **UI strings**: label, pointer, artifact".
 * `CLAUDE.md`'s Definition of Done says "forbidden-word grep over **UI strings**".
 *
 * The gate applied all eleven to identifiers as well. That was stricter than the rule and it never
 * mattered until `@41prompts/core` froze `Artifact`, `artifactOf` and `ARTIFACT_SCHEMA_VERSION` as a
 * public contract (ADR-005) that `apps/web` must import by name and cannot rename.
 *
 * **Both directions are tested, because a relaxation is only safe if the thing it relaxes still
 * fires.** A gate that stopped catching the word in a sentence would be worse than no gate: it would
 * report "clean" over exactly the failure it exists to find.
 *
 * It runs the real script against a fixture directory in the OS temp dir — never inside the working
 * tree, per `docs/PROCESS.md`'s "a test suite never writes into the working tree".
 */

const SCRIPT = join(fileURLToPath(new URL("../../scripts/forbidden-words.mjs", import.meta.url)));

/** Run the gate over one fixture file. Returns its output and whether it passed. */
function scan(source: string): { ok: boolean; output: string } {
  const dir = mkdtempSync(join(tmpdir(), "41p-forbidden-"));
  writeFileSync(join(dir, "fixture.ts"), source);
  try {
    return { ok: true, output: execFileSync("node", [SCRIPT, dir], { encoding: "utf-8" }) };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    return { ok: false, output: `${failure.stdout ?? ""}${failure.stderr ?? ""}` };
  }
}

describe("the ADR-003 vocabulary gate", () => {
  it("allows the frozen public identifiers apps/web has to import", () => {
    const result = scan(
      [
        'import { ARTIFACT_SCHEMA_VERSION, artifactBytes, type Artifact } from "@41prompts/core";',
        "export function store(artifact: Artifact): string {",
        "  return artifactBytes(artifact);",
        "}",
      ].join("\n"),
    );
    expect(result.output).toContain("clean");
    expect(result.ok).toBe(true);
  });

  // The control. Without it the test above would be satisfied by a gate that had stopped working.
  it("still catches the word in a sentence a person would read", () => {
    const result = scan('export const says = "Your artifact is ready.";');
    expect(result.ok).toBe(false);
    expect(result.output).toContain("artifact");
  });

  it("still catches it in JSX text", () => {
    const result = scan("export const Panel = () => <p>The artifact was published.</p>;");
    expect(result.ok).toBe(false);
  });

  it("is unchanged for the nine words with no UI-only qualifier", () => {
    // `block` is the word ADR-003 exists for — "blok" and "block" one letter apart was the naming
    // defect — and it is forbidden as an identifier just as much as in a sentence.
    expect(scan("export const block = 1;").ok).toBe(false);
    expect(scan('export const says = "promote";').ok).toBe(false);
    expect(scan("export const pointer = 1;").ok).toBe(false);
  });

  /**
   * **Pre-existing, and not changed here.** The pattern is `\b(word)s?\b`, so a camelCase compound
   * such as `addBlock` has no word boundary before `Block` and is not matched. Recorded because the
   * test above could otherwise be read as a claim that it is. Widening it is its own change with its
   * own false-positive budget — `lastFour`, `unblock`, `sha256` — and belongs to whoever wants it.
   */
  it("does not see a forbidden word buried inside a camelCase identifier", () => {
    expect(scan("export function addBlock(): void {}").ok).toBe(true);
  });

  it("keeps the platform-API exemptions it already had", () => {
    expect(scan('export const Field = () => <label htmlFor="x">Name</label>;').ok).toBe(true);
  });
});
