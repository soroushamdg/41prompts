// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/**
 * One segment of a prompt: a half-open range of the source, and the source text it covers.
 *
 * ## Offset units — this is a public contract
 *
 * `start` and `end` are **UTF-16 code unit indices**, the same indices JavaScript's
 * `String.prototype.slice` uses. `start` is inclusive, `end` is exclusive, so
 * `text === source.slice(start, end)` always holds and `end - start === text.length`.
 *
 * This matters outside JavaScript. Python string indices are Unicode *code points*, so a
 * consumer in `sdks/python` must convert: an emoji outside the BMP is two units here and one
 * character there, and a naive `source[start:end]` would drift by one per astral character
 * before it. Convert, do not assume. Byte offsets (UTF-8) differ again and are never used here.
 */
export interface Segment {
  /** The verbatim source slice. Never paraphrased, never normalised (CLAUDE.md rule 3). */
  readonly text: string;
  /** Inclusive start, in UTF-16 code units. */
  readonly start: number;
  /** Exclusive end, in UTF-16 code units. */
  readonly end: number;
}

/**
 * A committed corpus prompt. The corpus is the shared truth for every later epic — EPIC-011a's
 * clustering tests and EPIC-013's UI fixtures read the same prompts these snapshots are built
 * from, so a boundary change shows up in one place.
 */
export interface SegmentFixture {
  /** Stable kebab-case id. Also the snapshot file name. */
  readonly name: string;
  /** What this prompt exists to exercise. One line. */
  readonly describes: string;
  /** The prompt itself, byte for byte. */
  readonly text: string;
}
