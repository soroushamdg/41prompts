import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CONTRAST_PAIRS, checkContrast, contrastRatio, parseColorTokens } from "./contrast.js";

const here = dirname(fileURLToPath(import.meta.url));
const tokensCss = readFileSync(join(here, "tokens.css"), "utf-8");

function extractBlock(css: string, selector: RegExp): string {
  const match = selector.exec(css);
  if (!match) throw new Error(`no block matched ${selector}`);
  const start = css.indexOf("{", match.index);
  const end = css.indexOf("}", start);
  return css.slice(start + 1, end);
}

describe("contrastRatio", () => {
  it("is 21:1 for black on white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });
  it("is 1:1 for identical colours", () => {
    expect(contrastRatio("#123456", "#123456")).toBeCloseTo(1, 5);
  });
});

describe("the real tokens.css (both themes)", () => {
  const light = parseColorTokens(extractBlock(tokensCss, /@theme\s*{/));
  const dark = parseColorTokens(extractBlock(tokensCss, /\[data-theme="dark"\]\s*{/));

  it("light theme passes every contrast pair", () => {
    const results = checkContrast(light);
    const failures = results.filter((r) => !r.pass);
    expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
  });

  it("dark theme passes every contrast pair", () => {
    const results = checkContrast(dark);
    const failures = results.filter((r) => !r.pass);
    expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
  });

});

describe("checkContrast fails when a token is deliberately broken", () => {
  it("flags ink-on-bg when ink is changed to equal bg", () => {
    const broken = { ink: "#efede6", bg: "#efede6", surface: "#ffffff" };
    const results = checkContrast(broken, [{ fg: "ink", bg: "bg", minRatio: 4.5, note: "body text" }]);
    expect(results[0]!.pass).toBe(false);
    expect(results[0]!.ratio).toBeCloseTo(1, 5);
  });

  it("throws for a pair referencing an unknown token", () => {
    expect(() => checkContrast({ ink: "#111111" }, [{ fg: "ink", bg: "missing", minRatio: 4.5, note: "x" }])).toThrow();
  });
});

describe("CONTRAST_PAIRS", () => {
  it("never references --line (decorative hairline, not text)", () => {
    expect(CONTRAST_PAIRS.some((p) => p.fg === "line" || p.bg === "line")).toBe(false);
  });
});
