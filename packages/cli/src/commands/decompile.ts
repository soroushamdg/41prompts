// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/**
 * `41p decompile <file>` — the open decompiler, offline (EPIC-053).
 *
 * ## No key, no account, no request
 *
 * `docs/roadmap.md` says *"the open decompiler, no account"*, and this command takes that literally:
 * it reads a file, runs `packages/core`'s segmenter, clustering and detectors over it, and prints
 * what they found. **Nothing leaves the machine.**
 *
 * That is a property worth asserting rather than assuming. Somebody's prompt is the most sensitive
 * thing they will ever hand a tool of ours — it is their product — and a command that quietly posted
 * it to us while claiming to be the open decompiler would be the opposite of the thing it is for.
 * So `decompile.test.ts` runs it with a `fetch` that fails the test if it is called at all, which is
 * the positive control the assertion needs (`docs/PROCESS.md`, lesson 8).
 *
 * ## It is the same pipeline the web decompiler runs
 *
 * `cluster(segment(source))` then `detect(bloks, source)` — `apps/web/lib/decompile/run.ts:41` does
 * exactly this. One implementation with two front ends, so `41p decompile` on the Northwind sample
 * yields the findings that sample's committed snapshot already names.
 */

import { cluster, detect, segment, uncheckedRuleCount, type Blok, type Finding } from "@41prompts/core";
import { answeredNo, cannotAnswer, ok, type CommandResult } from "../exit.js";
import type { Env } from "../out.js";

export interface DecompileArgs {
  readonly file?: string;
  readonly json?: boolean;
}

export function decompile(env: Env, args: DecompileArgs): CommandResult {
  if (args.file === undefined || args.file.length === 0) {
    return cannotAnswer(["41p decompile <file> — name the file holding the prompt."]);
  }

  const source = env.readFile(args.file);
  if (source === undefined) {
    return cannotAnswer([`Cannot read ${args.file}.`]);
  }
  if (source.trim().length === 0) {
    return cannotAnswer([`${args.file} is empty.`]);
  }

  const bloks = cluster(segment(source));
  const findings = detect(bloks, source);
  const unchecked = uncheckedRuleCount(bloks, source, findings);

  if (args.json === true) {
    return ok([JSON.stringify({ bloks: bloks.map(asJson), findings, uncheckedRuleCount: unchecked }, null, 2)]);
  }

  const lines = [
    `${args.file}: ${count(bloks.length, "blok")}, ${count(findings.length, "finding")}.`,
    "",
    ...bloks.map(
      (blok) => `  ${blok.kind.padEnd(10)} ${count(blok.ranges.length, "range")}  ${quote(textOf(blok, source))}`,
    ),
  ];

  if (findings.length > 0) {
    lines.push("", "Findings:");
    for (const finding of findings) lines.push(...findingLines(finding));
  }

  if (unchecked > 0) {
    lines.push(
      "",
      `${count(unchecked, "rule")} here ${unchecked === 1 ? "has" : "have"} nothing checking ${unchecked === 1 ? "it" : "them"}.`,
    );
  }

  // A finding is advisory. `CLAUDE.md` rule 9 is about publishing, and nothing here blocks anything
  // — but a CI job that wants to fail on findings needs a code to key on, so a prompt with findings
  // answers "no" rather than "yes". A clean one exits 0.
  return findings.length > 0 ? answeredNo([], lines) : ok(lines);
}

const findingLines = (finding: Finding): string[] => {
  const lines = [`  [${finding.severity}] ${finding.kind}`, `      ${finding.message}`];
  if (finding.suggestion !== undefined) lines.push(`      → ${finding.suggestion}`);
  return lines;
};

const asJson = (blok: Blok): { kind: string; ranges: readonly { start: number; end: number }[] } => ({
  kind: blok.kind,
  ranges: blok.ranges,
});

const textOf = (blok: Blok, source: string): string =>
  blok.ranges.map((range) => source.slice(range.start, range.end)).join(" ");

/** Eighty columns is a terminal, and an ellipsis is how a person knows it was cut. */
const quote = (text: string): string => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 76 ? `"${flat.slice(0, 75)}…"` : `"${flat}"`;
};

const count = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? "" : "s"}`;
