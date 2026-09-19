#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
//
// Fails when a source file exports a **value** that no other file in the repository names.
//
// EPIC-900's survey found 39 of them across 602 source files, three of which appeared exactly once
// in `git grep` — on the line that declared them. Nothing failed, nothing was slower, and a
// module's export list had quietly stopped being a statement of what that module offers. That is
// the class this checks, and it is the class a person cannot sweep by hand: it is created a few
// symbols at a time, by ordinary work, and it is only visible when something reads all 602 files at
// once.
//
// `docs/roadmap.md` schedules a tech-debt sweep "every third sprint". A sweep that runs three times
// a year against a defect created daily is the failure `docs/PROCESS.md` names about the e2e
// container from the other side: a gate nobody runs covers nothing, and so does a gate that runs
// after the fact. This is the sweep turned into something that fails the build on the day.
//
// ## One class of finding, deliberately
//
// **Values only** — `const`, `let`, `var`, `function`, `class`. Not `type` and not `interface`: a
// type alias used once, inline, in the file that declares it is not debt, and the repository has
// 113 of them. A check that reports 113 things nobody should act on teaches people to skip its
// output, which costs more than it ever finds.
//
// ## What counts as a use is deliberately generous, and stops exactly at prose
//
// A declaration is used if its name appears as a word in **any other file that something executes
// or reads as configuration** -- `.ts`, `.tsx`, `.mjs`, `.json`, `.py`, `.yml`, a shell script. Not
// "is imported": this is a grep with a word boundary, and it is meant to be. A false negative here
// costs nothing -- one symbol stays exported for another quarter. A false positive costs somebody
// an argument with a gate, and an argument with a gate is how the gate gets deleted.
//
// **Markdown and plain text are not uses, and this was found by running the gate rather than by
// reasoning about it.** The first real run reported 35 findings where the survey that commissioned
// this epic had found 39. The four missing ones were not fixed and were not false positives: three
// were named in `docs/epics/EPIC-900-tech-debt-sweep.md`, written minutes earlier -- **the epic file
// describing the dead code had made the dead code invisible to the gate** -- and `snapshotNow` and
// `withFakeJudge` were each held alive by one sentence, in `plan-EPIC-041.md` and in
// `EPIC-033-report.md` respectively.
//
// That is not a rare shape here. This repository writes long reports that name symbols, and a
// report is permanent. Counting prose as a use means every symbol any report has ever mentioned is
// immortal, and the gate would have degraded silently, one epic report at a time, which is
// `docs/PROCESS.md`'s "a helper that normalises state hides the defect from every test that uses
// it" arriving through a file extension.
//
// Nothing executes Markdown. A `.md` mention is a sentence *about* the code.
//
// ## And a comment inside a code file is prose too
//
// The same run, one fix later, still protected `snapshotNow` and `withFakeJudge` -- by **this
// file's own header**, which had just been edited to name them as the examples. That is
// `forbidden-words.mjs`'s first lesson arriving in a second gate: *"comments stripped first -- a
// comment is neither a UI string nor an identifier -- this file's own comments would otherwise flag
// themselves."*
//
// So comments are blanked before a file is read for uses, with the same two-regular-expression
// stripper that gate uses, and the direction it errs in is the right one here. A `//` inside a
// string literal blanks the rest of that line, so a genuine use hiding after one would be
// **over**-reported -- a false positive, which is loud and has `ALLOWED` as its answer. The
// opposite mistake is a comment keeping a dead symbol alive, which is silent and permanent. A gate
// may over-report; it may not under-report.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// ── What is scanned for declarations ───────────────────────────────────────────────────────────
//
// `mirror/` is excluded: it is the public tree's overlay (its README, its workflows, its root
// manifest), read by a tree that does not exist in this checkout. Judging it from here would be
// judging a file against the wrong repository.
const DECL_ROOTS = ["packages", "apps", "sdks"];
const DECL_EXTENSIONS = /\.(ts|tsx|mts)$/;
const EXCLUDED = /^mirror\//;

/**
 * Names a framework calls rather than imports.
 *
 * These are a **class, not an allow-list**. Next.js reads `generateMetadata` off a route module by
 * name; Playwright loads a reporter by path; Sentry calls `onRequestError`. None of them is ever a
 * finding and none of them should ever need an `ALLOWED` entry — which is the assertion
 * `dead-code.test.mjs` makes about the real tree, because an exemption class that has quietly
 * stopped covering its cases shows up as entries appearing in `ALLOWED` one at a time.
 */
export const CONVENTION = new Set([
  // Next.js route and layout modules
  "generateMetadata", "generateStaticParams", "generateViewport", "metadata", "viewport",
  "dynamic", "dynamicParams", "revalidate", "fetchCache", "runtime", "preferredRegion",
  "maxDuration", "middleware", "config",
  // Route handlers
  "GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD",
  // Instrumentation: Next calls `register`, Sentry the other two
  "register", "onRequestError", "onRouterTransitionStart",
]);

/**
 * Exports kept on purpose.
 *
 * `{ file, name, why }`. **Checked in both directions**, which is this repository's own rule —
 * `docs/security/audit-baseline.json` for the audit, `HEADER_EXEMPT` in `scripts/license-gate.mjs`
 * for the licence headers. An entry here is silent; an export that is not here fails; and an entry
 * that no longer describes a live, otherwise-unreferenced export **also fails**, because a stale
 * exemption is how a check quietly stops catching what it exists for.
 *
 * It lives in the script rather than in `docs/` for `HEADER_EXEMPT`'s reason, settled in EPIC-901:
 * this gate has to pass in CI, and CI does not read a document.
 *
 * `why` is a sentence somebody can disagree with. "Intentional" is not one.
 */
export const ALLOWED = [];

function gitPaths(args) {
  const out = execFileSync("git", args, { encoding: "utf-8", maxBuffer: 256 * 1024 * 1024 });
  return out.split("\0").filter((p) => p.length > 0);
}

/**
 * Tracked, staged, and present-but-not-ignored — the union, deduplicated.
 *
 * `git ls-files` alone reads the **index**, so a file written and not yet staged is invisible and
 * the gate reports a pass it has not earned. That is `docs/PROCESS.md`'s "Local green is not CI
 * green" failure 2, where a local `binary-files` printed `486 checked` and passed over a NUL byte
 * in a file that had not been `git add`ed yet. Same three sources as `binary-files.mjs`, for the
 * same reason.
 */
function repoFiles() {
  const tracked = gitPaths(["ls-files", "-z"]);
  const staged = gitPaths(["diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR"]);
  const untracked = gitPaths(["ls-files", "-z", "--others", "--exclude-standard"]);
  return [...new Set([...tracked, ...staged, ...untracked])].sort();
}

/**
 * Files whose mention of a name counts as a use: code, and configuration something reads.
 *
 * `.md` and `.txt` are deliberately absent -- see the header. Prose is not a use, and in this
 * repository prose is voluminous and permanent.
 */
const CODE = /\.(ts|tsx|mts|mjs|cjs|js|jsx|json|py|sh|bash|zsh|yml|yaml|toml|css|html|sql|env|nvmrc|gitattributes)$/;

const DECLARATION =
  /^[ \t]*export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm;

// Every identifier-shaped word in a file. Cheaper and more exact than running 1,200 regexes over
// 1,500 files: one pass builds the index, and every lookup after it is a Map hit.
const WORD = /[A-Za-z_$][\w$]*/g;

/**
 * Comments blanked, so a sentence about a symbol is not mistaken for a use of it.
 *
 * **Newlines are preserved and everything else becomes a space**, rather than the whole comment
 * collapsing to one character. Two reasons, and the second is the one that bites: the declaration
 * pattern is anchored with `^`, and a multi-line block comment collapsed to a single space would
 * join the line before it to the line after it — manufacturing declarations that are not there and
 * hiding ones that are.
 *
 * It also keeps one real and unusual shape working. `packages/core/src/detect/contradiction.ts`
 * puts a whole doc block between the `export` keyword and the `const` it belongs to. That is valid
 * TypeScript, `SCOPED` really is exported, and blanking the block in place — rather than deleting
 * it — is what leaves `export` and `const` still separated by nothing but whitespace.
 *
 * Per language, and only the forms that occur here. `.json` has no comments, and every extension
 * CODE admits is covered below.
 */
const blank = (text) => text.replace(/[^\n]/g, " ");

function stripComments(file, source) {
  if (/\.(ts|tsx|mts|mjs|cjs|js|jsx)$/.test(file)) {
    return source.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/.*$/gm, blank);
  }
  if (/\.css$/.test(file)) return source.replace(/\/\*[\s\S]*?\*\//g, blank);
  if (/\.py$/.test(file)) {
    return source
      .replace(/"""[\s\S]*?"""/g, blank)
      .replace(/'''[\s\S]*?'''/g, blank)
      .replace(/#.*$/gm, blank);
  }
  if (/\.(sh|bash|zsh|yml|yaml|toml|env|nvmrc|gitattributes)$/.test(file)) {
    return source.replace(/#.*$/gm, blank);
  }
  if (/\.html$/.test(file)) return source.replace(/<!--[\s\S]*?-->/g, blank);
  if (/\.sql$/.test(file)) return source.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/--.*$/gm, blank);
  return source;
}

/**
 * The scan, over a file list and a reader rather than over the filesystem.
 *
 * Injectable for one reason and it is the reason `audit.mjs` takes `(read, paths)` too: a test that
 * can only run against the real tree can prove neither half of a both-directions allow-list, and a
 * test that has to build a temporary git repository to say something about a regular expression is
 * a test nobody will extend.
 */
function scan({ files, read }) {
  const list = files.filter((f) => !EXCLUDED.test(f) && CODE.test(f));

  /** name -> Set of files that mention it */
  const mentions = new Map();
  /** file -> comment-blanked source, for the files also scanned for declarations */
  const declSources = new Map();

  for (const file of list) {
    let raw;
    try {
      raw = read(file);
    } catch {
      continue; // staged-but-deleted, or unreadable; nothing to read
    }
    const text = stripComments(file, raw);
    for (const word of text.match(WORD) ?? []) {
      let set = mentions.get(word);
      if (!set) mentions.set(word, (set = new Set()));
      set.add(file);
    }
    const inDeclRoot = DECL_ROOTS.some((r) => file === r || file.startsWith(r + "/"));
    if (inDeclRoot && DECL_EXTENSIONS.test(file) && !file.endsWith(".d.ts")) {
      declSources.set(file, text);
    }
  }

  /** every exported value: { file, kind, name } */
  const declarations = [];
  for (const [file, text] of declSources) {
    for (const m of text.matchAll(DECLARATION)) {
      declarations.push({ file, kind: m[1], name: m[2] });
    }
  }

  // A name may be declared in more than one file — `ActionResult` is in four. It is orphaned only
  // when *none* of its homes is mentioned anywhere else, so the homes are grouped before judging.
  // Judging each declaration on its own would report all four the moment any one of them went
  // quiet, which is a finding about a name rather than about a file.
  const homes = new Map();
  for (const d of declarations) {
    let group = homes.get(d.name);
    if (!group) homes.set(d.name, (group = []));
    group.push(d);
  }

  const orphans = [];
  for (const [name, group] of homes) {
    if (CONVENTION.has(name)) continue;
    const own = new Set(group.map((d) => d.file));
    let elsewhere = false;
    for (const f of mentions.get(name) ?? []) {
      if (!own.has(f)) { elsewhere = true; break; }
    }
    if (!elsewhere) orphans.push(...group);
  }
  orphans.sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name));

  return { files: list.length, scanned: declSources.size, declarations, orphans };
}

/**
 * The run, as data, so the tests can assert on it without parsing stdout.
 *
 * `allowed` is a parameter rather than a closed-over constant for the same reason `files` is: the
 * tests have to be able to prove the both-directions behaviour, and a test that can only exercise
 * the real tree's `ALLOWED` can prove neither half of it.
 */
export function deadCode({ files, read, allowed = ALLOWED } = {}) {
  const list = files ?? repoFiles();
  const reader = read ?? ((f) => readFileSync(f, "utf-8"));
  const scanned = scan({ files: list, read: reader });

  const key = (d) => `${d.file}::${d.name}`;
  const orphanKeys = new Set(scanned.orphans.map(key));
  const declKeys = new Set(scanned.declarations.map(key));

  const allowedKeys = new Set(allowed.map((a) => key(a)));
  const findings = scanned.orphans.filter((o) => !allowedKeys.has(key(o)));

  // The other direction. An entry goes stale for one of two different reasons and the message says
  // which, because "it is gone" and "it is no longer needed" are fixed in opposite ways.
  const stale = [];
  for (const entry of allowed) {
    const k = key(entry);
    if (!declKeys.has(k)) {
      stale.push({ ...entry, reason: "no such exported value any more" });
    } else if (!orphanKeys.has(k)) {
      stale.push({ ...entry, reason: "something else names it now, so the exemption does nothing" });
    }
  }

  return {
    files: scanned.files,
    scanned: scanned.scanned,
    declarations: scanned.declarations.length,
    orphans: scanned.orphans,
    findings,
    stale,
    allowed,
  };
}

function explain() {
  console.log(`dead-code — exported values that nothing else in the repository names.

Declarations are read from : ${DECL_ROOTS.join(", ")}  (${DECL_EXTENSIONS}, excluding .d.ts)
Uses are looked for in     : every tracked, staged or unignored CODE file, except ${EXCLUDED}\n                             (${CODE}) — Markdown is prose, not a use
A declaration is           : export (const|let|var|function|class) NAME
Types are not checked      : a type alias used once in its own file is not debt.

Two exemptions:
  CONVENTION (${CONVENTION.size} names) — called by a framework, never imported:
    ${[...CONVENTION].join(", ")}
  ALLOWED (${ALLOWED.length} entries) — kept on purpose, checked in BOTH directions:
${ALLOWED.length === 0 ? "    (none)" : ALLOWED.map((a) => `    ${a.file}  ${a.name}\n      ${a.why}`).join("\n")}

Nothing was scanned. Drop --explain to run it.`);
}

function main(argv) {
  if (argv.includes("--explain")) { explain(); return 0; }

  const { files, scanned, declarations, findings, stale, allowed } = deadCode({});

  if (stale.length > 0) {
    console.error(`An ALLOWED entry in scripts/dead-code.mjs no longer describes anything:\n`);
    for (const s of stale) console.error(`  ${s.file}  ${s.name} — ${s.reason}`);
    console.error(
      "\nA stale exemption is how a check quietly stops catching what it exists for, so this fails" +
      "\nrather than being ignored. Delete the entry."
    );
  }

  if (findings.length > 0) {
    console.error(`${stale.length > 0 ? "\n" : ""}An exported value is named nowhere else in this repository:\n`);
    let current = "";
    for (const f of findings) {
      if (f.file !== current) { console.error(`  ${f.file}`); current = f.file; }
      console.error(`    ${f.kind.padEnd(8)} ${f.name}`);
    }
    console.error(
      "\nThree ways out, in the order to try them:" +
      "\n  1. Delete it. Nothing this repository executes mentions the name — not a test, not a" +
      "\n     script, not a config. A report or an epic file naming it is prose, and does not count." +
      "\n  2. Drop the `export` keyword, if the file itself uses it. The keyword was the only thing" +
      "\n     making it look like a surface." +
      "\n  3. Add it to ALLOWED in scripts/dead-code.mjs with a `why` somebody could disagree with," +
      "\n     if the export is a deliberate contract. That list is checked in both directions."
    );
  }

  if (findings.length > 0 || stale.length > 0) return 1;

  console.log(
    `No orphaned export: ${declarations} exported values across ${scanned} source files ` +
    `are each named somewhere else (${files} files read, ${allowed.length} allowed by name).`
  );
  return 0;
}

// Run only as a CLI. Imported by scripts/dead-code.test.mjs, which needs `deadCode` without the
// exit code.
if (process.argv[1] && process.argv[1].endsWith("dead-code.mjs")) {
  process.exit(main(process.argv.slice(2)));
}
