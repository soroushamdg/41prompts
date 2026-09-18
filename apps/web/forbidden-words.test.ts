import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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

/**
 * Every case here spawns a real `node` process, and vitest's default budget is five seconds.
 *
 * That default measures the machine rather than the gate. On the machine this was written on
 * `/usr/local/bin/node` is an **x86_64 binary under Rosetta 2**, so each spawn pays a translation
 * cost that has nothing to do with the code under test, and `gates.mjs ci` failed two of these on a
 * loaded host while the whole file ran in 2.4 s unloaded — a forty-fold spread on a quantity the
 * test is not about.
 *
 * `apps/web/cli-generated-code.test.ts` already sets its own budget for the same reason and at
 * `120_000`; thirty seconds is generous for one process start and still fails an actual hang.
 * `docs/PROCESS.md`, "Three timing gates report rather than enforce", is the same argument: an
 * absolute wall-clock budget on a contended machine measures the machine.
 */
const SPAWN_TIMEOUT = 30_000;

/** Run the gate over one fixture file. Returns its output and whether it passed. */
function scan(source: string, extension = "ts"): { ok: boolean; output: string } {
  const dir = mkdtempSync(join(tmpdir(), "41p-forbidden-"));
  writeFileSync(join(dir, `fixture.${extension}`), source);
  try {
    return { ok: true, output: execFileSync("node", [SCRIPT, dir], { encoding: "utf-8" }) };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    return { ok: false, output: `${failure.stdout ?? ""}${failure.stderr ?? ""}` };
  }
}

describe("the ADR-003 vocabulary gate", { timeout: SPAWN_TIMEOUT }, () => {
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

/**
 * **Which trees the gate is pointed at** (EPIC-053, C16).
 *
 * Lesson 19, and this is the third time it has applied: `packages/sdk-ts/src` joined the roots in
 * EPIC-052 and **eleven strings failed immediately**; `scripts/binary-files.mjs` grew three roots in
 * EPIC-055 and caught two live NUL bytes; `packages/cli/src` joins here and found three on the first
 * run. A gate only guards what it is pointed at, and the argument list is the easiest part of a gate
 * to leave behind.
 *
 * Two assertions, and neither is sufficient alone. The first is that the root is **in the default
 * list** — the list is what CI and every local run use, since `pnpm forbidden-words` passes no
 * arguments. The second is that the scanner **fires on a file in a root it is given**, which the
 * tests above already establish for the word matching and which is repeated here against a
 * `packages/cli`-shaped path so the two halves are one argument.
 *
 * It is done this way rather than by planting a file inside the real `packages/cli/src` because
 * `docs/PROCESS.md` forbids a suite writing into the working tree, and a gate test that dirtied the
 * tree would be trading one of this repository's rules for another.
 */
describe("the roots the gate scans", { timeout: SPAWN_TIMEOUT }, () => {
  const source = readFileSync(SCRIPT, "utf-8");

  it.each([
    "packages/ui/src",
    "apps/web/app",
    "apps/web/lib",
    "packages/sdk-ts/src",
    "packages/cli/src",
    // EPIC-054, lesson 19's fourth application. A CLI's output and an SDK's warnings are read by
    // exactly the person ADR-003's vocabulary is written for; so is a Python package's.
    "sdks/python/fortyone",
  ])(
    "%s is in the default list, which is what a bare `pnpm forbidden-words` uses",
    (root) => {
      const list = source.slice(source.indexOf("const DEFAULT_ROOTS"), source.indexOf("const ROOTS"));
      expect(list).toContain(`"${root}"`);
    },
  );

  it("fires on a CLI-shaped file, rather than merely passing over one", () => {
    // The positive control for the widening. `41p link`'s own output is the kind of string this is
    // now guarding — a sentence a person reads on a terminal.
    const result = scan('export const said = "Your artifact was pulled.";');
    expect(result.ok).toBe(false);
    expect(result.output).toContain("artifact");
  });

  it("and passes over the CLI's actual strings", () => {
    // The other direction: what the commands really say must be clean, or the widening above would
    // be a gate that is red for ever and therefore ignored.
    expect(scan('export const said = "Pulled 2 prompts. Run 41p check in CI.";').ok).toBe(true);
  });
});

/**
 * The Python root (EPIC-054 ruling 7) — lesson 19's fourth application.
 *
 * `sdks/python/fortyone` joined `DEFAULT_ROOTS`, and a root added without teaching the gate `.py`
 * would have scanned nothing and reported clean: **a widened root that guards nothing is worse than
 * no root**, because the run then names a tree it has not checked. So every claim here is about the
 * gate firing, not about it passing.
 *
 * It fired on three real strings the first time it ran, which is why the exemption below exists.
 */
describe("the vocabulary gate over Python", { timeout: SPAWN_TIMEOUT }, () => {
  it("catches the word in a sentence a person would read", () => {
    const result = scan('MESSAGE = "Your artifact is ready."\n', "py");
    expect(result.ok).toBe(false);
    expect(result.output).toContain("artifact");
  });

  it("catches it in a single-quoted string too", () => {
    const result = scan("MESSAGE = 'the pointer moved'\n", "py");
    expect(result.ok).toBe(false);
    expect(result.output).toContain("pointer");
  });

  it("does not catch it in a comment or a docstring, which are prose and not output", () => {
    const result = scan(
      ['"""The artifact format, and the pointer it names."""', "", "# The artifact is public.", "VALUE = 1", ""].join("\n"),
      "py",
    );
    expect(result.output).toContain("clean");
    expect(result.ok).toBe(true);
  });

  it("still sees a violation on a line that follows a comment containing a hash inside a string", () => {
    // The scanner exists for this: blanking from the first `#` would have hidden the word after it,
    // and a vocabulary gate may over-report but must never under-report.
    const result = scan('SEPARATOR = "#"\nMESSAGE = "the artifact is ready"\n', "py");
    expect(result.ok).toBe(false);
    expect(result.output).toContain("artifact");
  });

  it("allows the shared cache record's key, which @41prompts/sdk writes and fortyone reads", () => {
    const result = scan(
      ['record = {"artifact": text}', 'value = record["artifact"]', 'other = record.get("artifact")', ""].join("\n"),
      "py",
    );
    expect(result.output).toContain("clean");
    expect(result.ok).toBe(true);
  });

  it("and that exemption does not cover the word anywhere else on the line", () => {
    // The control on the exemption. A line that has the key *and* a sentence is still a violation.
    const result = scan('record = {"artifact": "your artifact is ready"}\n', "py");
    expect(result.ok).toBe(false);
  });

  it("skips a pytest file, the way it skips a .test.ts", () => {
    const dir = mkdtempSync(join(tmpdir(), "41p-forbidden-"));
    writeFileSync(join(dir, "test_thing.py"), 'MESSAGE = "your artifact is ready"\n');
    const output = execFileSync("node", [SCRIPT, dir], { encoding: "utf-8" });
    expect(output).toContain("clean");
  });

  it("names the Python root in its own default list", () => {
    // Proves the root is spelled the way the tree spells it. A typo would scan nothing and pass.
    const output = execFileSync("node", [SCRIPT], { encoding: "utf-8" });
    expect(output).toContain("sdks/python/fortyone");
  });
});

/**
 * The path exemption (EPIC-072).
 *
 * `apps/web/lib/site/claims.ts` points a reader at the code behind each claim, and one of those
 * paths is `packages/core/src/artifact/schema.ts` — a real directory, frozen by ADR-005 and named
 * in `CLAUDE.md`'s own never-touch list. The gate read it as the word.
 *
 * **The exemption is the filesystem, not a pattern.** A rule written as "things that look like a
 * path" is satisfiable by prose — `artifact/schema` matches almost any such pattern — and this
 * repository has already been bitten twice by a gate narrowed until it stopped firing (EPIC-056
 * §4.7, and the customer-count pattern that read the product's own name as a count). Requiring the
 * candidate to **resolve to a file or directory in this repository** cannot be satisfied by a
 * sentence, because a sentence is not a file.
 */
describe("the path exemption", { timeout: SPAWN_TIMEOUT }, () => {
  it("allows a path to a directory that exists in this repository", () => {
    const result = scan('export const evidence = "packages/core/src/artifact/schema.ts";');
    expect(result.output).toContain("clean");
    expect(result.ok).toBe(true);
  });

  it("allows it inside a longer line, beside other code", () => {
    const result = scan('const rows = [{ id: "build", evidence: "packages/core/src/artifact" }];');
    expect(result.ok).toBe(true);
  });

  /**
   * The controls, and they are the point. Each of these is path-shaped and none of them resolves,
   * so a pattern-based exemption would let all three through.
   */
  it.each([
    ["a path-shaped phrase that is not a path", 'export const s = "the artifact/schema is frozen";'],
    ["a path under a directory that does not exist", 'export const s = "packages/nope/src/artifact/schema.ts";'],
    ["a plausible but absent file", 'export const s = "apps/web/lib/artifact/reader.ts";']
  ])("still catches %s", (_label, source) => {
    const result = scan(source);
    expect(result.ok).toBe(false);
    expect(result.output).toContain("artifact");
  });

  it("does not let a real path exempt a sentence beside it", () => {
    // Per occurrence, like the record-key exemption above.
    const result = scan('export const s = "see packages/core/src/artifact/schema.ts — your artifact is ready";');
    expect(result.ok).toBe(false);
  });
});
