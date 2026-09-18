#!/usr/bin/env node
// ADR-003 vocabulary check (CLAUDE.md "Vocabulary" section): none of these words may appear in
// UI strings, schema, or code identifiers. Word-boundary, case-insensitive grep over the app and
// design-system source trees, comments stripped first (a comment is neither a UI string nor an
// identifier — this file's own comments would otherwise flag themselves). The `<label>` HTML
// element and `aria-label`/`aria-labelledby` are real, unrenameable platform accessibility APIs,
// not product vocabulary, so a bare `label` match fully accounted for by one of those is exempt —
// everything else is a real violation. `scrollIntoView({ block: ... })` is the same category and
// is exempt on the same terms: a DOM option name we cannot rename, on a line that does nothing
// else. Both exemptions are deliberately narrow — they require the platform API on the same line
// AND every match on that line to be the one word — because the point of this check is that
// "blok" and "block" one letter apart was a naming defect (ADR-003), and an exemption broad
// enough to hide a real `block` would give that back.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, isAbsolute, join } from "node:path";

const FORBIDDEN = ["block", "assertion", "label", "pointer", "artifact", "promote", "enum", "sha", "reconcile", "override", "drifted"];

// ── The two words CLAUDE.md qualifies with "(UI only)" ──────────────────────────────────────────
//
// `CLAUDE.md`'s Vocabulary line reads: "block, assertion (UI only; the type may be `Check`), label,
// pointer, artifact (UI only), promote, ...". ADR-003 is the same both ways round — "the internal
// type may be `Check`; the word 'assertion' does not appear in the UI", and "Never in **UI
// strings**: label, pointer, artifact, ...".
//
// This gate applied the whole list to identifiers as well, which is stricter than the rule it
// enforces. It never mattered until EPIC-051, because nothing under `apps/web/app` or `apps/web/lib`
// had reason to name the build artifact — and then `@41prompts/core` exported `Artifact`,
// `artifactOf`, `artifactBytes` and `ARTIFACT_SCHEMA_VERSION` as a **frozen public contract**
// (ADR-005), which `apps/web` must import by those names and cannot rename.
//
// So these two are checked **in UI strings only**: inside a quoted string, or as JSX text. An
// identifier, a type name or a property is not a UI string and never was. `CLAUDE.md`'s own
// Definition of Done says "forbidden-word grep over **UI strings**".
const UI_ONLY = new Set(["assertion", "artifact"]);

/**
 * The trees scanned. An argument replaces them, which is **only** how the gate's own test points it
 * at a fixture directory outside the working tree — `apps/web/forbidden-words.test.ts`. `pnpm
 * forbidden-words` passes none, so CI and every local run scan exactly these four.
 *
 * **`packages/sdk-ts/src` joined the list in EPIC-052**, and it is the first entry that is not a
 * surface rendered in a browser. It belongs here for the reason `lib/deploy/store.ts` gives for
 * calling its keys `builds/` rather than `artifacts/`: a warning an SDK writes into a customer's log
 * *"is about as close to a string a customer reads as a non-rendered one gets"*. It is not scanned
 * for `.md`, so `README.md` is out of scope — this gate reads `.ts` and `.tsx` only, and teaching it
 * Markdown (headings, fenced code, link text) is a different gate than the one that exists.
 *
 * **`packages/cli/src` joined in EPIC-053**, for the same reason again and for the third time.
 * Lesson 19 is *a gate only guards what it is pointed at*, and a CLI's output is read by exactly the
 * person ADR-003's vocabulary is written for — on a terminal, in a CI log, more often than most of
 * the UI. `forbidden-words.test.mjs` proves the root **fires** rather than merely that the gate
 * passes: a widened root nobody has watched catch anything is a root that might be spelled wrong.
 */
const DEFAULT_ROOTS = [
  "packages/ui/src",
  "apps/web/app",
  "apps/web/lib",
  "packages/sdk-ts/src",
  "packages/cli/src",
  "sdks/python/fortyone",
];
const ROOTS = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_ROOTS;
const EXTENSIONS = new Set([".ts", ".tsx", ".py"]);
const SKIP_DIRS = new Set(["node_modules", ".next", ".turbo", "dist", "coverage"]);
const SKIP_FILES = new Set(["contrast.ts", "contrast-cli.ts", "contrast.test.ts", "token-contract.test.ts"]);

// s? catches the plain plural too (assertions, blocks, labels, ...) — CLAUDE.md lists base forms
// but plainly means the word, not just its exact singular spelling.
const WORD_RE = new RegExp(`\\b(${FORBIDDEN.join("|")})s?\\b`, "gi");
// Each exemption records the epic that added it and why, so the list stays auditable and nobody
// has to reconstruct the argument from a blame view.
// `label`    — EPIC-003: the <label> element and aria-label/aria-labelledby are the accessibility API.
// `block`    — EPIC-013: scrollIntoView({ block: "nearest" }) is a DOM option name, not our word.
// `artifact` — EPIC-054: the **key** of the disk-cache record, which `@41prompts/sdk` already
//              writes and `fortyone` reads out of the same directory (EPIC-054 ruling 5). It is a
//              serialisation field name, not a sentence, and `disk.ts` writes it as a TypeScript
//              property — an identifier, which this gate has never flagged. Python has no such
//              thing: a JSON key is a string literal, so the same field in the same format is a
//              violation in one language and not in the other. Renaming it on the Python side
//              would end the shared cache; renaming it on both would be a format change for a
//              gate's convenience. So it is exempt exactly where it is a quoted key or index of
//              that record, and nowhere else.
//
//              **Per occurrence, not per line**, unlike the two above. The first version exempted
//              the whole line when every match on it was `artifact`, and its own control caught
//              that `{"artifact": "your artifact is ready"}` then passed — the key exempting the
//              sentence beside it. The two older exemptions keep the line rule because `<label>`
//              and `scrollIntoView` do not plausibly share a line with the word in prose; this one
//              does, because the value beside a key is exactly where a message lives.
const LABEL_CONTEXT_RE = /<label\b|<\/label>|aria-label(?:ledby)?["']?\s*[:=]|htmlFor=/i;
const BLOCK_CONTEXT_RE = /scrollIntoView\s*\(/;
const RECORD_KEY_RE = /(["'])artifact\1\s*[:\])]/g;

// `path`   — EPIC-072: a string that is a **repo-relative path to something that exists on disk**.
//            `packages/core/src/artifact/` is a real directory, frozen by ADR-005 and named in
//            `CLAUDE.md`'s own never-touch list, so any file that has to cite it — a claims
//            registry pointing a reader at the evidence, a comment, a test fixture list — is
//            naming a file rather than using the word.
//
//            **The exemption is the filesystem, not a pattern**, and that is deliberate. A rule
//            written as a regular expression over "things that look like paths" is satisfiable by
//            prose: "the artifact/schema is frozen" reads as a path to anything matching
//            `\w+/\w+`. A rule that requires the string to resolve to a file or directory in this
//            repository cannot be satisfied by a sentence, because a sentence is not a file.
//
//            Per occurrence, like the record key above, so `"the artifact at packages/core/src/
//            artifact/schema.ts"` still fails on the first one.
const PATH_LIKE_RE = /[A-Za-z0-9_.@-]+(?:\/[A-Za-z0-9_.@*-]+)+/g;

/**
 * The spans of `line` that a person could read: quoted strings, and JSX text between `>` and `<`.
 *
 * Deliberately line-based, like the rest of this file. A template literal spanning several lines has
 * each of its lines judged on its own, which over-reports rather than under-reports — the safe
 * direction for a vocabulary gate.
 */
function readableSpans(line) {
  const spans = [];
  let quote = null;
  let start = 0;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quote === null && (char === '"' || char === "'" || char === "`")) {
      quote = char;
      start = i + 1;
    } else if (char === quote && line[i - 1] !== "\\") {
      spans.push([start, i]);
      quote = null;
    }
  }
  if (quote !== null) spans.push([start, line.length]);

  // JSX text: whatever sits between a closing `>` and the next opening `<`.
  for (const match of line.matchAll(/>([^<>]+)</g)) {
    const at = match.index + 1;
    spans.push([at, at + match[1].length]);
  }
  return spans;
}

/**
 * The spans of `line` holding the shared cache record's key — the word itself, not the quotes.
 *
 * See `RECORD_KEY_RE`'s comment. A match inside one of these is a serialisation field name; a match
 * anywhere else on the same line is not exempt, which is the whole difference from the two
 * line-level exemptions.
 */
function recordKeySpans(line) {
  const spans = [];
  for (const match of line.matchAll(RECORD_KEY_RE)) {
    const at = match.index + 1;
    spans.push([at, at + "artifact".length]);
  }
  return spans;
}

/**
 * The spans of `line` that are paths to files or directories that exist in this repository.
 *
 * See `PATH_LIKE_RE`'s comment: the candidate is found by shape and then **confirmed against the
 * filesystem**, which is what makes this impossible to satisfy with prose.
 */
function realPathSpans(line, repoRoot) {
  const spans = [];
  for (const match of line.matchAll(PATH_LIKE_RE)) {
    const candidate = match[0];
    if (!existsSync(join(repoRoot, candidate))) continue;
    spans.push([match.index, match.index + candidate.length]);
  }
  return spans;
}

/** True when `index` falls inside something a person could read. */
function isReadable(line, index) {
  return readableSpans(line).some(([from, to]) => index >= from && index < to);
}

/** True when every forbidden match on this line is a platform API name we cannot rename. */
function isPlatformApi(line, matches) {
  const words = matches.map((match) => match.toLowerCase());
  if (LABEL_CONTEXT_RE.test(line) && words.every((word) => word === "label")) return true;
  if (BLOCK_CONTEXT_RE.test(line) && words.every((word) => word === "block")) return true;
  return false;
}

function blank(match) {
  return match.replace(/[^\n]/g, " ");
}

function stripComments(source, python) {
  if (!python) return source.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/.*$/gm, blank);
  return stripPython(source);
}

/**
 * Blank Python comments and docstrings, keeping every other character in place.
 *
 * A scanner rather than two regular expressions, because the naive version — blank from `#` to the
 * end of the line — also blanks the rest of a line containing a `#` inside a string literal, and
 * that **under-reports**: a forbidden word after such a `#` would go unseen. A vocabulary gate may
 * over-report; it may not under-report. So quotes are tracked and a `#` only starts a comment
 * outside one.
 *
 * A triple-quoted string is treated as a comment because in Python that is what a docstring is —
 * the prose convention, matching how this file already exempts a JSDoc block in TypeScript. An
 * ordinary single-quoted string is left alone and is exactly what `readableSpans` then reads.
 *
 * Newlines are preserved throughout so line numbers in a violation still point at the right line.
 */
function stripPython(source) {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const three = source.slice(i, i + 3);
    if (three === '"""' || three === "\'\'\'") {
      const end = source.indexOf(three, i + 3);
      const stop = end === -1 ? source.length : end + 3;
      out += blank(source.slice(i, stop));
      i = stop;
      continue;
    }
    const char = source[i];
    if (char === "#") {
      const end = source.indexOf("\n", i);
      const stop = end === -1 ? source.length : end;
      out += blank(source.slice(i, stop));
      i = stop;
      continue;
    }
    if (char === '"' || char === "'") {
      // Copy the literal through, escapes included, so `readableSpans` sees it as a string.
      let j = i + 1;
      while (j < source.length && source[j] !== char && source[j] !== "\n") {
        j += source[j] === "\\" ? 2 : 1;
      }
      const stop = Math.min(j + 1, source.length);
      out += source.slice(i, stop);
      i = stop;
      continue;
    }
    out += char;
    i += 1;
  }
  return out;
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
    } else if (
      EXTENSIONS.has(extname(entry)) &&
      !entry.endsWith(".test.ts") &&
      !entry.endsWith(".test.tsx") &&
      !entry.startsWith("test_")
    ) {
      out.push(full);
    }
  }
  return out;
}

const repoRoot = new URL("..", import.meta.url).pathname;
const violations = [];

for (const root of ROOTS) {
  for (const file of walk(isAbsolute(root) ? root : join(repoRoot, root))) {
    const original = readFileSync(file, "utf-8");
    const scanned = stripComments(original, extname(file) === ".py");
    const lines = scanned.split("\n");
    const originalLines = original.split("\n");
    lines.forEach((line, index) => {
      // `matchAll` rather than `match`, because the UI-only rule needs each match's **position** and
      // not only its text: the same word is a violation inside a string and not as an identifier.
      const keys = recordKeySpans(line);
      const paths = realPathSpans(line, repoRoot);
      const found = [...line.matchAll(WORD_RE)].filter(
        (match) =>
          (!UI_ONLY.has(match[1].toLowerCase()) || isReadable(line, match.index)) &&
          !keys.some(([from, to]) => match.index >= from && match.index < to) &&
          !paths.some(([from, to]) => match.index >= from && match.index < to),
      );
      if (found.length === 0) return;
      const matches = found.map((match) => match[0]);
      if (isPlatformApi(line, matches)) return;
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
