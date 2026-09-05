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
