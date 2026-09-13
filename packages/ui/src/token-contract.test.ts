import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcDir = dirname(fileURLToPath(import.meta.url));

// contrast.ts/contrast-cli.ts legitimately hold hex literals (they parse and compute against
// them); tokens.css is the one place colours are *defined*, not consumed.
const EXEMPT = new Set(["contrast.ts", "contrast.test.ts", "contrast-cli.ts", "tokens.css"]);

function walk(dir: string, extensions: string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walk(full, extensions));
    } else if (extensions.some((ext) => entry.endsWith(ext)) && !EXEMPT.has(entry)) {
      out.push(full);
    }
  }
  return out;
}

const HEX_COLOR = /#[0-9a-fA-F]{3}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{8}\b/;

describe("no component hard-codes a colour literal", () => {
  const tsxFiles = walk(srcDir, [".ts", ".tsx"]).filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"));

  it.each(tsxFiles.map((f) => [f.replace(srcDir, "")] as const))("%s has no raw hex colour", (relative) => {
    const content = readFileSync(join(srcDir, relative.slice(1)), "utf-8");
    const match = HEX_COLOR.exec(content);
    expect(match, `found ${match?.[0]} in ${relative}`).toBeNull();
  });

  const cssFiles = walk(srcDir, [".css"]);

  it.each(cssFiles.map((f) => [f.replace(srcDir, "")] as const))("%s has no raw hex colour", (relative) => {
    const content = readFileSync(join(srcDir, relative.slice(1)), "utf-8");
    const match = HEX_COLOR.exec(content);
    expect(match, `found ${match?.[0]} in ${relative}`).toBeNull();
  });
});

describe("no component hard-codes a radius or shadow literal", () => {
  const cssFiles = walk(srcDir, [".css"]);

  for (const file of cssFiles) {
    const relative = file.replace(srcDir, "");
    const content = readFileSync(file, "utf-8");

    it(`${relative}: every border-radius value is var(--radius-*) or a non-token shape (999px pill, 0)`, () => {
      const radiusLines = content.match(/border-radius:\s*[^;]+;/g) ?? [];
      for (const line of radiusLines) {
        const value = line.replace("border-radius:", "").replace(";", "").trim();
        expect(value === "999px" || value.startsWith("var(--radius") || value.startsWith("calc(var(--radius"), `${relative}: "${line}"`).toBe(true);
      }
    });

    it(`${relative}: every box-shadow value is built from var(--shadow-offset*) and var(--color-plate)`, () => {
      const shadowLines = content.match(/box-shadow:\s*[^;]+;/g) ?? [];
      for (const line of shadowLines) {
        const value = line.replace("box-shadow:", "").replace(";", "").trim();
        expect(value === "none" || (value.includes("var(--shadow-offset") && value.includes("var(--color-plate)")), `${relative}: "${line}"`).toBe(true);
      }
    });
  }
});

/**
 * **Every `var(--…)` in a stylesheet resolves to a token that exists.**
 *
 * Added 2026-09-13 after EPIC-022 shipped a whole section of `canvas.css` written against the
 * *mockup's* variable names — `--s3`, `--ink-3`, `--line`, `--surface-2`, `--mono`, `--focus` — none
 * of which this package defines. CSS does not fail on an unknown custom property: the declaration is
 * simply dropped, so the section rendered unstyled and every existing gate passed. The radius guard
 * above caught one hard-coded `4px` in the same block and said nothing about the ten variables
 * beside it that pointed at nothing.
 *
 * A variable with a fallback — `var(--font-mono, ui-monospace, monospace)` — is fine and is the
 * established convention for the two fonts, which Next's font loader sets at runtime rather than
 * `tokens.css` defining them.
 *
 * This is a guard rather than a structural fix because there is no structure available: CSS custom
 * properties are late-bound by design. The next best thing is that a typo fails a build instead of
 * quietly removing a rule.
 */
describe("every custom property a stylesheet reads is one this package defines", () => {
  /**
   * Supplied by the consuming app, not by this package: `apps/web`'s layout sets both from Next's
   * font loader onto the document. They are a real contract with the app rather than typos, and the
   * guard would otherwise report them for ever.
   *
   * Nothing else belongs here. A variable that is neither defined in this package nor on this list
   * is a name that resolves to nothing, and CSS drops the whole declaration rather than complaining.
   */
  const SUPPLIED_BY_THE_APP = new Set(["--font-sans", "--font-mono"]);

  const definitions = new Set<string>();
  for (const file of walk(srcDir, [".css"]).concat([join(srcDir, "tokens.css")])) {
    for (const match of readFileSync(file, "utf-8").matchAll(/(--[a-z0-9-]+)\s*:/g)) {
      definitions.add(match[1] as string);
    }
  }

  const cssFiles = walk(srcDir, [".css"]);

  it.each(cssFiles.map((f) => [f.replace(srcDir, "")] as const))("%s reads only defined tokens", (relative) => {
    const content = readFileSync(join(srcDir, relative.slice(1)), "utf-8");
    const unresolved: string[] = [];
    // `var(--name)` with no comma is a bare read; `var(--name, fallback)` carries its own answer.
    for (const match of content.matchAll(/var\(\s*(--[a-z0-9-]+)\s*\)/g)) {
      const name = match[1] as string;
      if (!definitions.has(name) && !SUPPLIED_BY_THE_APP.has(name)) unresolved.push(name);
    }
    expect([...new Set(unresolved)], `${relative} reads tokens nothing defines`).toEqual([]);
  });
});
