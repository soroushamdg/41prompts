// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

// ── Rule 2: a matched tag region is atomic ───────────────────────────────────────────────────
//
// `<instructions> … </instructions>` is one thing the author wrote, and every rule below would
// otherwise shred it: the blank line between two examples inside it would end a paragraph, and
// a bulleted list inside it would become loose items with no idea what they belong to.
//
// Only *matched* pairs are atomic, and a region has to span whole lines — opener first on its
// line, closer last on its. An unmatched `<answer>`, or a `<b>…</b>` inside a sentence, is prose
// that happens to contain an angle bracket, and is left to the paragraph rules.
//
// ## Why this is hand-written rather than a regular expression
//
// It used to be `<(/?)([A-Za-z][A-Za-z0-9._:-]*)([^<>]*)>` run per line. That is correct and it is
// linear, but it allocates twice per tag — a match-result array from `exec`, and a token object —
// plus a sliced copy of every line that contains a `<`. On a prompt full of tags that is the
// dominant cost of the whole segmenter, and it showed up as a growth exponent of 1.35 on CI
// against a 1.6 bar: not quadratic, but superlinear enough that the gate had less headroom than
// the variance between two runners.
//
// Scanning by hand allocates nothing per tag. Names are compared in the source rather than
// extracted, so a document with fifty thousand tags produces fifty thousand tokens and zero
// strings. The grammar below is exactly what the regular expression matched, so no snapshot moves.

import { indentWidth, isBlankRange } from "./chars.js";
import type { FenceMap } from "./fences.js";
import type { Line } from "./lines.js";

const LESS_THAN = 0x3c;
const GREATER_THAN = 0x3e;
const SLASH = 0x2f;

const KIND_OPEN = 0;
const KIND_CLOSE = 1;
const KIND_SELF_CLOSING = 2;

const FLAG_OPENS_LINE = 1;
const FLAG_ENDS_LINE = 2;

/** For each line: the last line index of the tag region opening here, or -1. */
export interface TagMap {
  readonly opensAt: readonly number[];
}

function isNameStart(code: number): boolean {
  return (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a);
}

function isNamePart(code: number): boolean {
  return (
    isNameStart(code) ||
    (code >= 0x30 && code <= 0x39) ||
    code === 0x2e || // .
    code === 0x5f || // _
    code === 0x3a || // :
    code === 0x2d // -
  );
}

/** One token's worth of parsed tag, or `null` when the `<` starts nothing. */
interface ScannedTag {
  readonly kind: number;
  readonly nameStart: number;
  readonly nameEnd: number;
  /** Index just past the closing `>`. */
  readonly end: number;
}

/**
 * Parse a tag beginning at `start`, which must be a `<`, without running past `limit`.
 *
 * `limit` is the line's `contentEnd`, so a tag can never span a line break — which is what the
 * per-line regular expression did, and keeping it means this rewrite moves no boundary.
 */
function scanTag(text: string, start: number, limit: number): ScannedTag | null {
  let i = start + 1;
  if (i >= limit) return null;

  let closing = false;
  if (text.charCodeAt(i) === SLASH) {
    closing = true;
    i += 1;
  }

  if (i >= limit || !isNameStart(text.charCodeAt(i))) return null;
  const nameStart = i;
  while (i < limit && isNamePart(text.charCodeAt(i))) i += 1;
  const nameEnd = i;

  // Attributes: anything up to the closing `>`, with `<` ending the attempt exactly as `[^<>]*`
  // did. A `<` here means the tag never closed and the next one starts.
  let lastNonSpace = -1;
  while (i < limit) {
    const code = text.charCodeAt(i);
    if (code === GREATER_THAN) {
      const selfClosing = lastNonSpace >= 0 && text.charCodeAt(lastNonSpace) === SLASH;
      return {
        kind: closing ? KIND_CLOSE : selfClosing ? KIND_SELF_CLOSING : KIND_OPEN,
        nameStart,
        nameEnd,
        end: i + 1
      };
    }
    if (code === LESS_THAN) return null;
    if (code !== 0x20 && code !== 0x09) lastNonSpace = i;
    i += 1;
  }

  return null;
}

/** True when two source ranges hold the same characters. */
function sameName(text: string, aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  if (aEnd - aStart !== bEnd - bStart) return false;
  for (let offset = 0; offset < aEnd - aStart; offset++) {
    if (text.charCodeAt(aStart + offset) !== text.charCodeAt(bStart + offset)) return false;
  }
  return true;
}

/** FNV-1a over a source range. Used only to bucket names, never to decide equality. */
function hashRange(text: string, start: number, end: number): number {
  let value = 0x811c9dc5;
  for (let i = start; i < end; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value;
}

/**
 * Map every opener to its closer in one stack pass, then keep the ones that span whole lines.
 *
 * The naive version — for each opener, scan forward for its closer — is O(n²) on a prompt full of
 * unclosed tags, which is a plausible paste and an easy way to hang EPIC-013's browser tab. One
 * pass with a stack per tag name is O(n) whatever the input.
 *
 * Names are interned by comparing source ranges: the hash only chooses a bucket, and equality is
 * always decided by comparing the characters, so a hash collision costs a comparison rather than a
 * wrong match. No `Map` iteration order reaches the output (EPIC-010 decision 6).
 */
export function scanTagRegions(text: string, lines: readonly Line[], fences: FenceMap): TagMap {
  // Parallel arrays rather than one object per token.
  const tokenLine: number[] = [];
  const tokenKind: number[] = [];
  const tokenName: number[] = [];
  const tokenFlags: number[] = [];

  // Interned names, as source ranges. A prompt has a handful of distinct tag names however many
  // tags it contains.
  const nameStarts: number[] = [];
  const nameEnds: number[] = [];
  const buckets = new Map<number, number[]>();

  const internName = (start: number, end: number): number => {
    const key = hashRange(text, start, end);
    let bucket = buckets.get(key);
    if (bucket === undefined) {
      bucket = [];
      buckets.set(key, bucket);
    }
    for (const candidate of bucket) {
      if (sameName(text, start, end, nameStarts[candidate]!, nameEnds[candidate]!)) return candidate;
    }
    const id = nameStarts.length;
    nameStarts.push(start);
    nameEnds.push(end);
    bucket.push(id);
    return id;
  };

  for (let li = 0; li < lines.length; li++) {
    if (fences.inside[li]) continue;
    const line = lines[li]!;
    let first = true;

    for (let i = line.start; i < line.contentEnd; i++) {
      if (text.charCodeAt(i) !== LESS_THAN) continue;
      const tag = scanTag(text, i, line.contentEnd);
      if (tag === null) continue;

      let flags = 0;
      if (first && isBlankRange(text, line.start, i) && indentWidth(text, line.start, line.contentEnd) <= 3) {
        flags |= FLAG_OPENS_LINE;
      }
      if (isBlankRange(text, tag.end, line.contentEnd)) flags |= FLAG_ENDS_LINE;

      tokenLine.push(li);
      tokenKind.push(tag.kind);
      tokenName.push(internName(tag.nameStart, tag.nameEnd));
      tokenFlags.push(flags);

      first = false;
      i = tag.end - 1; // the loop's own increment moves past the closing `>`
    }
  }

  const closesOnLine: number[] = new Array<number>(tokenLine.length).fill(-1);
  const closerEndsLine: boolean[] = new Array<boolean>(tokenLine.length).fill(false);
  const openStacks = new Map<number, number[]>();

  for (let t = 0; t < tokenLine.length; t++) {
    const name = tokenName[t]!;
    if (tokenKind[t] === KIND_OPEN) {
      let stack = openStacks.get(name);
      if (stack === undefined) {
        stack = [];
        openStacks.set(name, stack);
      }
      stack.push(t);
    } else if (tokenKind[t] === KIND_CLOSE) {
      const opener = openStacks.get(name)?.pop();
      if (opener !== undefined) {
        closesOnLine[opener] = tokenLine[t]!;
        closerEndsLine[opener] = (tokenFlags[t]! & FLAG_ENDS_LINE) !== 0;
      }
    }
  }

  const opensAt: number[] = new Array<number>(lines.length).fill(-1);
  for (let t = 0; t < tokenLine.length; t++) {
    // A region has to span whole lines: the opener starts one and the closer finishes one. A pair
    // that opens and closes mid-line — `<task>Summarise this</task> and reply in under 120
    // words.` — is an inline tag inside a sentence, and making its line atomic would cut that
    // sentence at the line wrap. Prose is what the paragraph rules are for.
    if (tokenKind[t] !== KIND_OPEN || (tokenFlags[t]! & FLAG_OPENS_LINE) === 0 || !closerEndsLine[t]) continue;
    const close = closesOnLine[t]!;
    const line = tokenLine[t]!;
    if (close >= 0 && opensAt[line]! < 0) opensAt[line] = close;
  }

  return { opensAt };
}
