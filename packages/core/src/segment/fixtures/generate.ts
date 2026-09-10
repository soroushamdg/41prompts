// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

// Deterministic input generation, shared by every property test in this package.
//
// One generator and one seed space on purpose: when EPIC-010's reconstruction property and
// EPIC-011a's blok invariants both fail on seed 41137, they failed on the *same* input, and that is
// worth more than either test having a generator tuned to itself. No `Math.random` and no `Date`
// anywhere, so a failing case is reproducible from its seed alone, on any machine, forever
// (EPIC-010 decision 6).

export function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

// Fragments chosen to collide with every rule boundary the segmenter has: fence markers, tag
// markers, headings, list markers, sentence terminators, and the character classes that break
// naive slicing (astral pairs, combining marks, RTL, BOM, lone surrogates, CRLF, tabs).
export const FRAGMENTS: readonly string[] = [
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

export function generatePrompt(seed: number): string {
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
export const NAMED_EDGE_CASES: ReadonlyArray<readonly [string, string]> = [
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
