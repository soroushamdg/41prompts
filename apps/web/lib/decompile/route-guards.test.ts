import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The two guards the epic asks for by name, checked where they can actually be checked.
 *
 * Neither is a unit test of behaviour — they are structural rules about what may exist on this
 * route, and they are here rather than in a lint config because a rule nobody can read the reason
 * for gets deleted the first time it is inconvenient.
 */

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const routeDirs = [join(webRoot, "app", "decompile"), join(webRoot, "lib", "decompile")];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry) && !entry.endsWith(".test.ts") && !entry.endsWith(".test.tsx")) out.push(full);
  }
  return out;
}

/** Comments are not code. A rule that fired on its own explanation would be untestable. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");
}

const files = routeDirs.flatMap(sourceFiles);

describe("no segmentation, clustering or detection code exists in apps/web", () => {
  it("finds the route's source files at all", () => {
    // Or every assertion below passes vacuously.
    expect(files.length).toBeGreaterThan(5);
  });

  /**
   * The identifiers that would mean somebody had reimplemented `packages/core` here — `CLAUDE.md`
   * rule 1 and the epic's decision 10. The page may *call* these through the package; what it may
   * not do is declare them.
   */
  const REIMPLEMENTED = [
    "function segment",
    "function cluster",
    "function detect",
    "function classify",
    "function summarise",
    "MERGE_OVERLAP_THRESHOLD =",
    "normalise(",
    "overlap(",
    "topicOf(",
    "polarityOf("
  ];

  it.each(files.map((file) => [file.replace(webRoot, "")] as const))("%s declares none of them", (relative) => {
    const source = withoutComments(readFileSync(join(webRoot, relative.slice(1)), "utf-8"));
    for (const identifier of REIMPLEMENTED) {
      expect(source, `${relative} declares ${identifier}`).not.toContain(identifier);
    }
  });

  it("imports what it needs from @41prompts/core rather than reaching into it", () => {
    // A deep import into core's internals would sidestep its public surface — the thing EPIC-052
    // freezes — and would make this route the reason a refactor inside core breaks the web app.
    for (const file of files) {
      const source = readFileSync(file, "utf-8");
      expect(source, `${file.replace(webRoot, "")} deep-imports core`).not.toMatch(
        /from ["']@41prompts\/core\/(?!fixtures["'])/
      );
      expect(source, `${file.replace(webRoot, "")} imports core by relative path`).not.toMatch(
        /from ["'][./]+packages\/core/
      );
    }
  });
});

describe("green, red and amber appear nowhere on this route", () => {
  /**
   * Epic decision 4: those three mean pass, fail and drift, and findings are not pass/fail. This
   * greps the tokens and the recipe classes that carry them; the rendered-colour check is the e2e
   * test "uses no pass, fail or drift colour anywhere on the route", which catches what a grep
   * cannot — a class that resolves to one of them through some other rule.
   */
  const RESERVED = [
    "--color-pass",
    "--color-fail",
    "--color-warn",
    "badge-pass",
    "badge-fail",
    "badge-drift",
    "cell-pass",
    "cell-fail",
    "cell-drift",
    "callout-fail",
    "callout-warn"
  ];

  it.each(files.map((file) => [file.replace(webRoot, "")] as const))("%s uses none of them", (relative) => {
    const source = withoutComments(readFileSync(join(webRoot, relative.slice(1)), "utf-8"));
    for (const token of RESERVED) {
      expect(source, `${relative} uses ${token}`).not.toContain(token);
    }
  });

  it("the route's stylesheet uses none of them either", () => {
    const css = withoutComments(
      readFileSync(join(webRoot, "..", "..", "packages", "ui", "src", "decompile.css"), "utf-8")
    );
    for (const token of RESERVED) {
      expect(css, `decompile.css uses ${token}`).not.toContain(token);
    }
  });
});
