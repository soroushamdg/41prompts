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

/** The opposed pair two vocabularies differ by, or `null`. */
export function opposingAntonym(left: Set<string>, right: Set<string>): readonly [string, string] | null {
  for (const [a, b] of ANTONYMS) {
    if (left.has(a) && right.has(b) && !left.has(b) && !right.has(a)) return [a, b];
    if (left.has(b) && right.has(a) && !left.has(a) && !right.has(b)) return [b, a];
  }
  return null;
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
