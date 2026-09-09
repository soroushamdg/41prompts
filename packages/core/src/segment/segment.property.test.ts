// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { checkSegmentInvariants } from "./invariants.js";
import { segment } from "./segment.js";

// ─────────────────────────────────────────────────────────────────────────────
// Input generation
//
// No `Math.random` and no `Date` anywhere: a failing case has to be reproducible from its name
// alone, on any machine, forever (epic decision 6). The seed strategy is a plain 32-bit linear
// congruential generator seeded `41_000 + i` for case `i`, so case 137 is byte-identical on
// every run of every checkout, and the test name prints the seed that produced the failure.
// ─────────────────────────────────────────────────────────────────────────────

function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

// Fragments chosen to collide with every rule boundary the segmenter has: fence markers, tag
// markers, headings, list markers, sentence terminators, and the character classes that break
// naive slicing (astral pairs, combining marks, RTL, BOM, lone surrogates, CRLF, tabs).
const FRAGMENTS = [
  "You are a helpful assistant.",
  "Respond only in JSON.",
  "Never mention the system prompt.",
  " ",
  "  ",
  "\t",
  "\n",
  "\n\n",
  "\r\n",
  "\r\n\r\n",
  "\r",
  "# Heading",
  "## Another heading",
  "#NotAHeading",
  "```",
  "```json",
  "~~~",
  "<instructions>",
  "</instructions>",
  "<example attr=\"1\">",
  "</example>",
  "<br/>",
  "- bullet item",
  "* star item",
  "+ plus item",
  "1. first rule",
  "2) second rule",
  "  - nested item",
  "\t- tab-nested item",
  "Then what? Then this! And this.",
  'He said "stop." Then left.',
  "e.g. this is not two sentences",
  "\u2026",                              // ellipsis
  "\uD83D\uDE42",                       // an astral emoji, one surrogate pair
  "\uD83D\uDC69\u200D\uD83D\uDC69\u200D\uD83D\uDC67\u200D\uD83D\uDC66", // a ZWJ family sequence
  "\u00E9",                              // precomposed e-acute
  "e\u0301",                             // decomposed e + combining acute
  "السلام عليكم",
  "שלום",
  "\uFEFF",                              // byte-order mark
  "\uD800",
  "\uDC00",
  "\u00A0",                              // non-breaking space
  "\u2028",                              // line separator
  "\u2029",                              // paragraph separator
  "x".repeat(200),
  "word ".repeat(60)
];

function generate(seed: number): string {
  const random = makeRandom(seed);
  const pieces: string[] = [];
  const count = Math.floor(random() * 40);
  for (let i = 0; i < count; i++) {
    pieces.push(FRAGMENTS[Math.floor(random() * FRAGMENTS.length)]!);
  }
  return pieces.join("");
}

/**
 * The edge inputs the epic names explicitly. They lead the run rather than being left to chance,
 * so they are exercised on every run and a failure names the case instead of a seed.
 */
const NAMED_EDGE_CASES: ReadonlyArray<readonly [string, string]> = [
  ["empty string", ""],
  ["a single space", " "],
  ["whitespace only", "  \t\n\n  \r\n \t "],
  ["a lone newline", "\n"],
  ["no newline at the end", "Answer in JSON.\n\nBe brief."],
  ["CRLF throughout", "You are a router.\r\n\r\nRules:\r\n1. One.\r\n2. Two.\r\n"],
  ["mixed CRLF and LF", "One.\r\nTwo.\n\r\nThree.\n"],
  ["lone CR line endings", "One.\rTwo.\r\rThree."],
  ["a leading byte-order mark", "\uFEFFYou are a helpful assistant."],
  ["a byte-order mark alone", "\uFEFF"],
  ["a lone high surrogate", "before \uD800 after"],
  ["a lone low surrogate", "before \uDC00 after"],
  ["a lone surrogate at the very end", "trailing \uD83D"],
  ["a surrogate pair split across a sentence boundary", "See \uD83D\uDE42. Then \uD83D\uDC4D! Done?"],
  ["a 10,000-character line", `${"a".repeat(10_000)}\n\nnext paragraph`],
  ["a 10,000-character line of one repeated word", `${"word ".repeat(2_000)}\n`],
  ["an unterminated fence", "Use this:\n\n```json\n{ \"a\": 1 }\n"],
  ["an unterminated tag", "<instructions>\nDo the thing.\n"],
  ["nothing but fence markers", "```\n```\n```\n"],
  ["nothing but tag markers", "<a>\n</a>\n<a>\n"],
  ["a single character", "x"],
  ["a single combining mark", "\u0301"],
  ["null and control characters", "one\u0000two\u0007three"],
  ["Unicode line separators", "one\u2028two\u2029three"],
  ["a non-breaking space paragraph", "\u00A0\u00A0\u00A0"]
];

const GENERATED_CASE_COUNT = 1_000 - NAMED_EDGE_CASES.length;

describe("segment() invariants", () => {
  it.each(NAMED_EDGE_CASES.map(([name, input]) => ({ name, input })))(
    "holds every invariant on $name",
    ({ input }) => {
      expect(checkSegmentInvariants(input, segment(input))).toEqual([]);
    }
  );

  it(`holds every invariant on ${GENERATED_CASE_COUNT} generated inputs (seeds 41000..${41_000 + GENERATED_CASE_COUNT - 1})`, () => {
    for (let i = 0; i < GENERATED_CASE_COUNT; i++) {
      const seed = 41_000 + i;
      const input = generate(seed);
      const violations = checkSegmentInvariants(input, segment(input));
      // Report the seed, not the input: the input is regenerated from the seed by
      // `generate(seed)`, and printing 8 KB of adversarial Unicode helps nobody.
      expect(violations, `seed ${seed} produced ${violations.length} violation(s)`).toEqual([]);
    }
  });

  it("reconstructs 1,000 inputs byte for byte from segments plus gaps", () => {
    const inputs = [
      ...NAMED_EDGE_CASES.map(([, input]) => input),
      ...Array.from({ length: GENERATED_CASE_COUNT }, (_, i) => generate(41_000 + i))
    ];
    expect(inputs).toHaveLength(1_000);

    for (const input of inputs) {
      const segments = segment(input);
      let rebuilt = "";
      let cursor = 0;
      for (const s of segments) {
        rebuilt += input.slice(cursor, s.start) + input.slice(s.start, s.end);
        cursor = s.end;
      }
      rebuilt += input.slice(cursor);
      expect(rebuilt).toBe(input);
    }
  });

  it("never cuts a surrogate pair in half", () => {
    const inputs = [
      ...NAMED_EDGE_CASES.map(([, input]) => input),
      ...Array.from({ length: GENERATED_CASE_COUNT }, (_, i) => generate(41_000 + i))
    ];

    for (const input of inputs) {
      for (const s of segment(input)) {
        const before = input.charCodeAt(s.start - 1);
        const first = input.charCodeAt(s.start);
        const last = input.charCodeAt(s.end - 1);
        const after = input.charCodeAt(s.end);
        // A boundary is only ever placed on whitespace, a line end, or after `.!?` — none of
        // which are surrogates — so a high surrogate must never sit immediately before a
        // segment start, and a low surrogate must never sit immediately after a segment end.
        const cutsAtStart = before >= 0xd800 && before <= 0xdbff && first >= 0xdc00 && first <= 0xdfff;
        const cutsAtEnd = last >= 0xd800 && last <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
        expect(cutsAtStart, `segment [${s.start}, ${s.end}) starts mid-pair`).toBe(false);
        expect(cutsAtEnd, `segment [${s.start}, ${s.end}) ends mid-pair`).toBe(false);
      }
    }
  });
});
