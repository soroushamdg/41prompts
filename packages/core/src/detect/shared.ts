// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

// Helpers every detector shares: how a finding is built, how its id is derived, and the two
// oppositeness tests. One copy, so "these disagree" means the same thing in `repeated` (which
// declines to fire on it) and in `contradiction` (which fires on exactly it).

import { polarityOf } from "../cluster/polarity.js";
import type { Blok } from "../cluster/types.js";
import type { Range } from "../segment/types.js";
import antonymsData from "./antonyms.json" with { type: "json" };
import type { Finding, FindingKind, Severity } from "./types.js";

const ANTONYMS: ReadonlyArray<readonly [string, string]> = antonymsData.map(
  (pair) => [pair[0]!, pair[1]!] as const
);

/**
 * The opposed pair two sentences differ by, or `null`.
 *
 * Matched against the **text**, not the normalised vocabulary. Normalisation drops words of three
 * characters or fewer, which silently killed `high`/`low`, `add`/`remove` and `all`/`none` — three
 * of the nineteen pairs could never match anything, and a genuine "set it high" against "set it
 * low" produced no finding at all. Found in review.
 */
export function opposingAntonym(left: string, right: string): readonly [string, string] | null {
  for (const [a, b] of ANTONYMS) {
    const leftA = hasWord(left, a);
    const leftB = hasWord(left, b);
    const rightA = hasWord(right, a);
    const rightB = hasWord(right, b);
    // Each side must carry one word and not the other, or "short" appearing in both is not a
    // difference between them.
    if (leftA && rightB && !leftB && !rightA) return [a, b];
    if (leftB && rightA && !leftA && !rightB) return [b, a];
  }
  return null;
}

const WORD_CACHE = new Map<string, RegExp>();

function hasWord(text: string, word: string): boolean {
  let pattern = WORD_CACHE.get(word);
  if (pattern === undefined) {
    pattern = new RegExp(`\\b${word}\\b`, "i");
    WORD_CACHE.set(word, pattern);
  }
  return pattern.test(text);
}

export function opposed(left: ReturnType<typeof polarityOf>, right: ReturnType<typeof polarityOf>): boolean {
  return (left === "negative" && right === "positive") || (left === "positive" && right === "negative");
}

export function blokText(blok: Blok, source: string): string {
  return blok.ranges.map((range) => source.slice(range.start, range.end)).join("\n");
}

export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

export function toRange(range: Range): Range {
  return { start: range.start, end: range.end };
}

/** A short, single-line quotation of a span, for a message. */
export function quote(source: string, range: Range): string {
  const text = source.slice(range.start, range.end).replace(/\s+/g, " ").trim();
  const shown = text.length > 48 ? `${text.slice(0, 45)}…` : text;
  return JSON.stringify(shown);
}

export function makeFinding(
  kind: FindingKind,
  severity: Severity,
  bloks: readonly string[],
  ranges: readonly Range[],
  copy: { message: string; suggestion?: string }
): Finding {
  // Content-derived, so a user can share a link to a finding and two runs produce the same one.
  //
  // **Joined by a space, and safe only because no part can contain one** — audited 2026-09-14 after
  // EPIC-031 shipped a cache key with this shape that *was* exploitable. `kind` and `severity` are
  // closed sets, a blok id is `blok_` plus hex, and a range renders as digits-colon-digits. None of
  // them is user text.
  //
  // It is safe by the shape of the values rather than by construction, which is a weaker guarantee
  // than the one next door: `summarise/hash.ts` and `compile/hash.ts` length-prefix their
  // user-controlled field, and `cluster.ts` joins on `\u0000`. **If a part here ever becomes text a
  // person wrote, length-prefix it** — a separator that can occur in a field is not a separator.
  const parts = [kind, severity, ...bloks, ...ranges.map((range) => `${range.start}:${range.end}`)];
  return {
    id: `find_${hash(parts.join(" "))}`,
    kind,
    severity,
    message: copy.message,
    bloks,
    ranges,
    ...(copy.suggestion === undefined ? {} : { suggestion: copy.suggestion })
  };
}

/** The same sixteen-hex FNV-1a `cluster.ts` and `summarise/hash.ts` use. */
function hash(input: string): string {
  let low = 0x811c9dc5;
  let high = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    low ^= code;
    low = Math.imul(low, 0x01000193) >>> 0;
    high ^= code + i;
    high = Math.imul(high, 0x85ebca6b) >>> 0;
  }
  return high.toString(16).padStart(8, "0") + low.toString(16).padStart(8, "0");
}

/** Every antonym-list word this text contains. Used to index a span for the antonym path. */
export function antonymWordsIn(text: string): string[] {
  const words: string[] = [];
  for (const [a, b] of ANTONYMS) {
    if (hasWord(text, a)) words.push(a);
    if (hasWord(text, b)) words.push(b);
  }
  return words;
}

/**
 * The partner of every antonym-list word this text contains — the words a sentence would have to
 * carry to oppose this one. Looking these up is what lets the contradiction scan skip every span
 * that could not possibly oppose the one in hand.
 */
export function antonymPartnersIn(text: string): string[] {
  const partners: string[] = [];
  for (const [a, b] of ANTONYMS) {
    if (hasWord(text, a)) partners.push(b);
    if (hasWord(text, b)) partners.push(a);
  }
  return partners;
}
