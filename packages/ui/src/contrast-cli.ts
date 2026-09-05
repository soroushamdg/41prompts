import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkContrast, parseColorTokens } from "./contrast.js";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "tokens.css"), "utf-8");

function block(selector: RegExp): string {
  const match = selector.exec(css);
  if (!match) throw new Error(`no block matched ${selector}`);
  const start = css.indexOf("{", match.index);
  const end = css.indexOf("}", start);
  return css.slice(start + 1, end);
}

let exitCode = 0;
for (const [label, cssBlock] of [
  ["light", block(/@theme\s*{/)],
  ["dark", block(/\[data-theme="dark"\]\s*{/)],
] as const) {
  console.log(`\n${label.toUpperCase()}`);
  const tokens = parseColorTokens(cssBlock);
  for (const result of checkContrast(tokens)) {
    const status = result.pass ? "PASS" : "FAIL";
    if (!result.pass) exitCode = 1;
    console.log(`  ${status}  ${result.ratio.toFixed(2)}:1  (>= ${result.minRatio})  ${result.fg} / ${result.bg} — ${result.note}`);
  }
}
process.exit(exitCode);
