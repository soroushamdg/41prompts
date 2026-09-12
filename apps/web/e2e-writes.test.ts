import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * **No ordinary e2e spec may write into the working tree.**
 *
 * The rule and its cost are in `docs/PROCESS.md`: a suite that rewrites committed files on every run
 * leaves `git status` permanently dirty, which makes it useless as a signal — and that is how a
 * stray NUL byte survived two self-reviews. It happened three times in one session before the
 * generators were moved out of the default run.
 *
 * Moving them fixed the instances. This fixes the class: the next spec that adds a
 * `screenshot({ path: "docs/…" })` outside `e2e/capture/` fails here rather than in somebody's
 * `git status` six weeks later.
 *
 * A write is allowed in exactly two places: inside `e2e/capture/`, or guarded by `CAPTURING` in a
 * spec whose assertions have to stay in the default run.
 */

const e2eDir = join(dirname(fileURLToPath(import.meta.url)), "e2e");

function specs(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return specs(full);
    return full.endsWith(".spec.ts") ? [full] : [];
  });
}

/** A `path:` pointing at `docs/`, whichever quote style. */
const WRITES_INTO_DOCS = /path:\s*[`"']docs\//;

describe("the e2e suite does not write into the working tree", () => {
  const ordinary = specs(e2eDir).filter((file) => !relative(e2eDir, file).startsWith("capture"));

  it("has ordinary specs to check, so this is not vacuously green", () => {
    expect(ordinary.length).toBeGreaterThan(4);
  });

  it.each(ordinary.map((file) => [relative(e2eDir, file), file] as const))(
    "%s writes no screenshot into docs/ outside a CAPTURING guard",
    (_name, file) => {
      const lines = readFileSync(file, "utf-8").split("\n");
      const offenders = lines
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => WRITES_INTO_DOCS.test(line))
        // A write is fine when the enclosing block is gated. Looking back a few lines is crude and
        // is enough: the guard is written immediately above the write, by convention and by the two
        // existing cases.
        .filter(({ index }) => !lines.slice(Math.max(0, index - 6), index).some((l) => l.includes("CAPTURING")));

      expect(
        offenders.map(({ index, line }) => `line ${index + 1}: ${line.trim()}`),
        "move it to e2e/capture/, or guard it with `if (CAPTURING)`"
      ).toEqual([]);
    }
  );
});
