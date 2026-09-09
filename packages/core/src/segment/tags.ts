// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

// ── Rule 2: a matched tag block is atomic ────────────────────────────────────────────────────
//
// `<instructions> … </instructions>` is one thing the author wrote, and every rule below would
// otherwise shred it: the blank line between two examples inside it would end a paragraph, and
// a bulleted list inside it would become loose items with no idea what they belong to.
//
// Only *matched* pairs are atomic. An unmatched `<answer>` is prose that happens to start with
// an angle bracket, and is left to the paragraph rules — which is the honest reading, because a
// prompt with an unclosed tag has no block for us to keep together.

import { indentWidth, isBlankRange } from "./chars.js";
import type { FenceMap } from "./fences.js";
import type { Line } from "./lines.js";

/**
 * `<name …>`, `</name>` or `<name …/>`.
 *
 * `[^<>]*` is a single quantifier over a single class with no nesting, so there is nothing to
 * backtrack: a `<` that starts no tag fails in constant time, and the class cannot consume the
 * `>` the pattern then needs. An attribute value containing a literal `>` ends the token early
 * and the block simply is not recognised — a miss, never a hang.
 */
const TAG_PATTERN = "<(/?)([A-Za-z][A-Za-z0-9._:-]*)([^<>]*)>";

// A plain string union rather than a TypeScript enumeration type: ADR-003 keeps that word out of code
// identifiers, and `isolatedModules` makes the `const` form a trap besides.
type TagKind = "open" | "close" | "self-closing";

interface TagToken {
  readonly line: number;
  readonly name: string;
  readonly kind: TagKind;
  /** True when this is the line's first tag and only ≤ 3 columns of whitespace precede it. */
  readonly opensLine: boolean;
  /** True when nothing but whitespace follows this tag on its line. */
  readonly endsLine: boolean;
}

/** For each line: the last line index of the tag block opening here, or -1. */
export interface TagMap {
  readonly opensAt: readonly number[];
}

function hasAngleBracket(text: string, start: number, end: number): boolean {
  for (let i = start; i < end; i++) {
    if (text.charCodeAt(i) === 0x3c) return true;
  }
  return false;
}

function tokenize(text: string, lines: readonly Line[], fences: FenceMap): TagToken[] {
  // Built per call rather than shared at module scope: a `g` regex carries mutable `lastIndex`,
  // and shared mutable state is exactly the kind of thing that makes a "deterministic" function
  // depend on what ran before it.
  const pattern = new RegExp(TAG_PATTERN, "g");
  const tokens: TagToken[] = [];

  for (let li = 0; li < lines.length; li++) {
    if (fences.inside[li]) continue;
    const line = lines[li]!;
    // Most lines of most prompts contain no `<` at all. Checking for one before slicing skips
    // both the copy and the regex on them, which is the difference between allocating the whole
    // document again and allocating the handful of lines that could actually hold a tag.
    if (!hasAngleBracket(text, line.start, line.contentEnd)) continue;
    const content = text.slice(line.start, line.contentEnd);

    pattern.lastIndex = 0;
    let first = true;
    let match = pattern.exec(content);
    while (match !== null) {
      const closing = match[1] === "/";
      const attributes = match[3] ?? "";
      const kind: TagKind = closing ? "close" : attributes.endsWith("/") ? "self-closing" : "open";
      const opensLine =
        first &&
        isBlankRange(text, line.start, line.start + match.index) &&
        indentWidth(text, line.start, line.contentEnd) <= 3;
      const endsLine = isBlankRange(text, line.start + match.index + match[0].length, line.contentEnd);

      tokens.push({ line: li, name: match[2]!, kind, opensLine, endsLine });
      first = false;
      match = pattern.exec(content);
    }
  }

  return tokens;
}

/**
 * Match every opener to its closer in one stack pass over the token stream.
 *
 * The naive version — for each opener, scan forward for its closer — is O(n²) on a prompt full
 * of unmatched openers, which is a plausible thing for a user to paste and an easy way to hang
 * the browser tab in EPIC-013. One pass with a stack per tag name is O(n) whatever the input.
 *
 * The `Map` is only ever used for lookup and never iterated, so no output depends on its key
 * order (epic decision 6).
 */
export function scanTagRegions(text: string, lines: readonly Line[], fences: FenceMap): TagMap {
  const tokens = tokenize(text, lines, fences);
  const openStacks = new Map<string, number[]>();
  const closesOnLine: number[] = new Array<number>(tokens.length).fill(-1);
  const closerEndsLine: boolean[] = new Array<boolean>(tokens.length).fill(false);

  for (let t = 0; t < tokens.length; t++) {
    const token = tokens[t]!;
    if (token.kind === "open") {
      let stack = openStacks.get(token.name);
      if (stack === undefined) {
        stack = [];
        openStacks.set(token.name, stack);
      }
      stack.push(t);
    } else if (token.kind === "close") {
      const stack = openStacks.get(token.name);
      const opener = stack?.pop();
      if (opener !== undefined) {
        closesOnLine[opener] = token.line;
        closerEndsLine[opener] = token.endsLine;
      }
    }
  }

  const opensAt: number[] = new Array<number>(lines.length).fill(-1);
  for (let t = 0; t < tokens.length; t++) {
    const token = tokens[t]!;
    // A region has to span whole lines: the opener starts one and the closer finishes one. A
    // pair that opens and closes mid-line — `<task>Summarise this</task> and reply in under 120
    // words.` — is an inline tag inside a sentence, and making its line atomic would cut that
    // sentence at the line wrap. Prose is what the paragraph rules are for.
    if (token.kind !== "open" || !token.opensLine || !closerEndsLine[t]) continue;
    const close = closesOnLine[t]!;
    if (close >= 0 && opensAt[token.line]! < 0) opensAt[token.line] = close;
  }

  return { opensAt };
}
