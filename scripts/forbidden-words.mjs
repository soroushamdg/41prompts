#!/usr/bin/env node
// ADR-003 vocabulary check (CLAUDE.md "Vocabulary" section): none of these words may appear in
// UI strings, schema, or code identifiers. Word-boundary, case-insensitive grep over the app and
// design-system source trees, comments stripped first (a comment is neither a UI string nor an
// identifier — this file's own comments would otherwise flag themselves). The `<label>` HTML
// element and `aria-label`/`aria-labelledby` are real, unrenameable platform accessibility APIs,
// not product vocabulary, so a bare `label` match fully accounted for by one of those is exempt —
// everything else is a real violation.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const FORBIDDEN = ["block", "assertion", "label", "pointer", "artifact", "promote", "enum", "sha", "reconcile", "override", "drifted"];

const ROOTS = ["packages/ui/src", "apps/web/app", "apps/web/lib"];
const EXTENSIONS = new Set([".ts", ".tsx"]);
const SKIP_DIRS = new Set(["node_modules", ".next", ".turbo", "dist", "coverage"]);
const SKIP_FILES = new Set(["contrast.ts", "contrast-cli.ts", "contrast.test.ts", "token-contract.test.ts"]);

// s? catches the plain plural too (assertions, blocks, labels, ...) — CLAUDE.md lists base forms
// but plainly means the word, not just its exact singular spelling.
const WORD_RE = new RegExp(`\\b(${FORBIDDEN.join("|")})s?\\b`, "gi");
const EXEMPT_CONTEXT_RE = /<label\b|<\/label>|aria-label(?:ledby)?["']?\s*[:=]|htmlFor=/i;

function blank(match) {
  return match.replace(/[^\n]/g, " ");
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/.*$/gm, blank);
}

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry) || SKIP_FILES.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walk(full));
    } else if (EXTENSIONS.has(extname(entry)) && !entry.endsWith(".test.ts") && !entry.endsWith(".test.tsx")) {
      out.push(full);
    }
  }
  return out;
}

const repoRoot = new URL("..", import.meta.url).pathname;
const violations = [];

for (const root of ROOTS) {
  for (const file of walk(join(repoRoot, root))) {
    const original = readFileSync(file, "utf-8");
    const scanned = stripComments(original);
    const lines = scanned.split("\n");
    const originalLines = original.split("\n");
    lines.forEach((line, index) => {
      const matches = line.match(WORD_RE);
      if (!matches) return;
      if (EXEMPT_CONTEXT_RE.test(line) && matches.every((m) => m.toLowerCase() === "label")) return;
      violations.push({ file: file.replace(repoRoot, ""), line: index + 1, text: originalLines[index].trim(), matches });
    });
  }
}

if (violations.length > 0) {
  console.error(`Forbidden ADR-003 word found in ${violations.length} place(s):\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}: ${v.matches.join(", ")}\n    ${v.text}`);
  }
  process.exit(1);
}

console.log(`Forbidden-word grep clean (${ROOTS.join(", ")}).`);
