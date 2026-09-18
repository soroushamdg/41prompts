// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { LIST_MIN_ITEMS, SENTENCE_SPLIT_THRESHOLD } from "./constants.js";
import { checkSegmentInvariants } from "./invariants.js";
import { segment } from "./segment.js";

/** The segment texts, which is what most rule tests are actually about. */
function texts(input: string): string[] {
  return segment(input).map((s) => s.text);
}

describe("the contract", () => {
  it("returns no segments for an empty string", () => {
    expect(segment("")).toEqual([]);
  });

  it("returns no segments for whitespace only", () => {
    expect(segment(" \t\n\n  \r\n  ﻿ \t ")).toEqual([]);
  });

  it("gives every segment the verbatim source slice and half-open UTF-16 offsets", () => {
    const input = "First rule.\n\nSecond rule.";
    for (const s of segment(input)) {
      expect(s.text).toBe(input.slice(s.start, s.end));
      expect(s.end - s.start).toBe(s.text.length);
    }
  });

  it("counts offsets in UTF-16 code units, so an astral emoji counts as two", () => {
    // "🚀" is one code point and two code units. A consumer indexing by code point (Python)
    // must convert; this test is the reason `types.ts` says so out loud.
    const [first, second] = segment("Ship it 🚀\n\nThen tell the team.");
    expect(first!.end).toBe(10);
    expect(second!.start).toBe(12);
  });

  it("segments the same input identically 100 times", () => {
    const input = [
      "# Heading",
      "",
      "<wrapper>",
      "one",
      "</wrapper>",
      "",
      "- a",
      "- b",
      "",
      "```",
      "code",
      "```",
      "",
      "A long paragraph. ".repeat(20)
    ].join("\n");

    const first = JSON.stringify(segment(input));
    for (let run = 0; run < 100; run++) {
      expect(JSON.stringify(segment(input))).toBe(first);
    }
  });

  it("gives the same sentence appearing twice two different offsets", () => {
    // The prototype found offsets with `text.indexOf(str, cursor)`. That is correct only until
    // a prompt repeats itself — and prompts repeat themselves constantly, which is the whole
    // premise of a blok owning a set of ranges.
    const line = "Always respond in JSON only.";
    const input = `${line}\n\nSomething else entirely.\n\n${line}`;

    const found = segment(input);
    expect(found.map((s) => s.text)).toEqual([line, "Something else entirely.", line]);
    expect(found[0]!.start).toBe(0);
    expect(found[2]!.start).toBe(input.lastIndexOf(line));
    expect(found[0]!.start).not.toBe(found[2]!.start);
    expect(checkSegmentInvariants(input, found)).toEqual([]);
  });
});

describe("rule 1 — fenced code is atomic", () => {
  it("never splits a fence that contains a blank line", () => {
    const input = ["Use this:", "", "```json", "{", '  "a": 1,', "", '  "b": 2', "}", "```", "", "Done."].join("\n");
    expect(texts(input)).toEqual([
      "Use this:",
      '```json\n{\n  "a": 1,\n\n  "b": 2\n}\n```',
      "Done."
    ]);
  });

  it("never splits a fence that contains what looks like a markdown heading", () => {
    const input = ["Example session:", "", "```bash", "# install first", "npm i", "", "## then run", "npm start", "```"].join("\n");
    expect(texts(input)).toEqual([
      "Example session:",
      "```bash\n# install first\nnpm i\n\n## then run\nnpm start\n```"
    ]);
  });

  it("never splits a fence that contains list markers or sentence boundaries", () => {
    const input = ["```", "- not a list item. Not a sentence either.", "1. also not an item", "```"].join("\n");
    expect(texts(input)).toEqual(["```\n- not a list item. Not a sentence either.\n1. also not an item\n```"]);
  });

  it("does not let a tilde fence close a backtick fence", () => {
    const input = ["```", "one", "~~~", "two", "```"].join("\n");
    expect(texts(input)).toEqual(["```\none\n~~~\ntwo\n```"]);
  });

  it("closes a fence only on a marker at least as long as the opener", () => {
    const input = ["````", "```", "still inside", "````"].join("\n");
    expect(texts(input)).toEqual(["````\n```\nstill inside\n````"]);
  });

  it("runs an unterminated fence to the end of the input", () => {
    const input = ["```", "half-written", "", "and more"].join("\n");
    expect(texts(input)).toEqual(["```\nhalf-written\n\nand more"]);
  });

  it("does not open a fence on a backtick run of fewer than three, or one indented four spaces", () => {
    expect(texts("``not a fence``\n\nplain")).toEqual(["``not a fence``", "plain"]);
    expect(texts("    ```\n\n    plain")).toEqual(["```", "plain"]);
  });

  it("does not open a backtick fence whose info string contains a backtick", () => {
    const input = "```not `a` fence```\n\nnext paragraph";
    expect(texts(input)).toEqual(["```not `a` fence```", "next paragraph"]);
  });
});

describe("rule 2 — matched tag regions are atomic", () => {
  it("never splits a matched tag region, whatever it contains", () => {
    const input = [
      "Before.",
      "",
      "<instructions>",
      "One.",
      "",
      "- a",
      "- b",
      "",
      "# not a heading here either",
      "</instructions>",
      "",
      "After."
    ].join("\n");
    expect(texts(input)).toEqual([
      "Before.",
      "<instructions>\nOne.\n\n- a\n- b\n\n# not a heading here either\n</instructions>",
      "After."
    ]);
  });

  it("matches the outer close tag when the same tag name is nested", () => {
    const input = ["<e>", "<e>", "inner", "</e>", "outer tail", "</e>"].join("\n");
    expect(texts(input)).toEqual(["<e>\n<e>\ninner\n</e>\nouter tail\n</e>"]);
  });

  it("treats an unmatched opening tag as ordinary prose", () => {
    const input = ["<scratchpad>", "think here", "", "then answer"].join("\n");
    expect(texts(input)).toEqual(["<scratchpad>\nthink here", "then answer"]);
  });

  it("does not open a region on a self-closing tag", () => {
    expect(texts("<br/>\nsome text\n\nnext")).toEqual(["<br/>\nsome text", "next"]);
  });

  it("does not open a region on a tag that is not first on its line", () => {
    const input = "Use <b>bold</b> sparingly.\n\nNext paragraph.";
    expect(texts(input)).toEqual(["Use <b>bold</b> sparingly.", "Next paragraph."]);
  });

  it("does not open a region on a tag inside a fence", () => {
    const input = ["```html", "<div>", "</div>", "```", "", "after"].join("\n");
    expect(texts(input)).toEqual(["```html\n<div>\n</div>\n```", "after"]);
  });

  it("closes a single-line region on the same line", () => {
    expect(texts("<answer>42</answer>\n\ntail")).toEqual(["<answer>42</answer>", "tail"]);
  });

  it("does not open a region when the closing tag is not the last thing on its line", () => {
    // Found in self-review. `<task>…</task>` here is an inline tag inside a sentence that
    // happens to wrap; making its line atomic would cut the sentence at the wrap.
    const input = "<task>Summarise the email</task> and reply in under\n120 words, in plain language.";
    expect(texts(input)).toEqual(["<task>Summarise the email</task> and reply in under\n120 words, in plain language."]);
  });

  it("does not open a region indented more than three columns", () => {
    expect(texts("\t<x>\n\t</x>")).toEqual(["<x>\n\t</x>"]);
  });
});

describe("rule 3 — headings separate", () => {
  it("makes each heading line its own segment", () => {
    const input = ["# One", "text under one", "## Two", "text under two"].join("\n");
    expect(texts(input)).toEqual(["# One", "text under one", "## Two", "text under two"]);
  });

  it("accepts one to six hashes and rejects seven", () => {
    expect(texts("###### Six")).toEqual(["###### Six"]);
    expect(texts("####### Seven\nfollowing line")).toEqual(["####### Seven\nfollowing line"]);
  });

  it("requires a space, a tab or end of line after the hashes", () => {
    expect(texts("#NoSpace\nsame paragraph")).toEqual(["#NoSpace\nsame paragraph"]);
    expect(texts("#\nsame paragraph? no")).toEqual(["#", "same paragraph? no"]);
  });

  it("ignores a hash that is not at the start of a line", () => {
    expect(texts("mention #ops in the ticket")).toEqual(["mention #ops in the ticket"]);
  });
});

describe("rule 4 — blank lines separate paragraphs", () => {
  it("splits on one blank line and on many", () => {
    expect(texts("one\n\ntwo\n\n\n\nthree")).toEqual(["one", "two", "three"]);
  });

  it("treats a line of only spaces or tabs as blank", () => {
    expect(texts("one\n   \ntwo\n\t\nthree")).toEqual(["one", "two", "three"]);
  });

  it("keeps consecutive non-blank lines in one paragraph", () => {
    expect(texts("one\ntwo\nthree")).toEqual(["one\ntwo\nthree"]);
  });

  it("treats CRLF and lone CR exactly like LF", () => {
    expect(texts("one\r\n\r\ntwo")).toEqual(["one", "two"]);
    expect(texts("one\r\rtwo")).toEqual(["one", "two"]);
    expect(texts("one\r\n\ntwo")).toEqual(["one", "two"]);
  });
});

describe("rule 5 — list items", () => {
  it("makes each top-level item its own segment", () => {
    expect(texts("- a\n- b\n- c")).toEqual(["- a", "- b", "- c"]);
    expect(texts("1. a\n2. b")).toEqual(["1. a", "2. b"]);
    expect(texts("1) a\n2) b")).toEqual(["1) a", "2) b"]);
    expect(texts("* a\n+ b")).toEqual(["* a", "+ b"]);
    expect(texts("• a\n• b")).toEqual(["• a", "• b"]);
  });

  it("keeps a nested list with its parent item", () => {
    const input = ["- parent one", "  - child a", "  - child b", "- parent two"].join("\n");
    expect(texts(input)).toEqual(["- parent one\n  - child a\n  - child b", "- parent two"]);
  });

  it("keeps a continuation line with the item above it", () => {
    const input = ["1. first rule", "   which carries on here", "2. second rule"].join("\n");
    expect(texts(input)).toEqual(["1. first rule\n   which carries on here", "2. second rule"]);
  });

  it("keeps the lines before the first marker as one lead-in segment", () => {
    expect(texts("Rules:\n1. a\n2. b")).toEqual(["Rules:", "1. a", "2. b"]);
    expect(texts("Rules:\nRead them all.\n1. a\n2. b")).toEqual(["Rules:\nRead them all.", "1. a", "2. b"]);
  });

  it(`needs ${LIST_MIN_ITEMS} markers before a paragraph counts as a list`, () => {
    expect(texts("Some prose - with a dash in it")).toEqual(["Some prose - with a dash in it"]);
    expect(texts("A line\n- and one bullet")).toEqual(["A line\n- and one bullet"]);
    expect(texts("A line\n- one bullet\n- two bullets")).toEqual(["A line", "- one bullet", "- two bullets"]);
  });

  it("does not treat a bare marker character as a marker without a space after it", () => {
    expect(texts("-not an item\n-nor this")).toEqual(["-not an item\n-nor this"]);
    expect(texts("1.not an item\n2.nor this")).toEqual(["1.not an item\n2.nor this"]);
  });

  it("does not treat a number with no delimiter, or one with ten digits, as a marker", () => {
    expect(texts("1\n2")).toEqual(["1\n2"]);
    expect(texts("123456789. a\n123456789. b")).toEqual(["123456789. a", "123456789. b"]);
    expect(texts("1234567890. a\n1234567890. b")).toEqual(["1234567890. a\n1234567890. b"]);
  });

  it("does not treat a thematic break as a list", () => {
    expect(texts("---\n---")).toEqual(["---\n---"]);
    expect(texts("***\n***")).toEqual(["***\n***"]);
  });

  it("accepts a marker with nothing after it", () => {
    expect(texts("-\n-")).toEqual(["-", "-"]);
  });

  it("never sentence-splits a list item, however long it is", () => {
    const long = `${"Explain the reason at length. ".repeat(12)}`;
    const input = `- ${long}\n- ${long}`;
    expect(segment(input)).toHaveLength(2);
  });
});

describe("rule 6 — long paragraphs split at sentence boundaries", () => {
  const sentence = "This is one sentence of exactly some length. ";

  it(`leaves a paragraph of ${SENTENCE_SPLIT_THRESHOLD} characters or fewer whole`, () => {
    const atThreshold = "a. ".repeat(20) + "b".repeat(SENTENCE_SPLIT_THRESHOLD - 60);
    expect(atThreshold.trim()).toHaveLength(SENTENCE_SPLIT_THRESHOLD);
    expect(segment(atThreshold)).toHaveLength(1);
  });

  it("splits a paragraph one character over the threshold", () => {
    const overThreshold = `${"a. ".repeat(20) + "b".repeat(SENTENCE_SPLIT_THRESHOLD - 60)}c`;
    expect(overThreshold.trim()).toHaveLength(SENTENCE_SPLIT_THRESHOLD + 1);
    expect(segment(overThreshold).length).toBeGreaterThan(1);
  });

  it("splits after `.`, `!` and `?` alike", () => {
    // Four sentences puts the paragraph over the threshold; three would leave it under it.
    const input = sentence.repeat(4) + "Really? Yes! Done.";
    const found = texts(input);
    expect(found).toContain("Really?");
    expect(found).toContain("Yes!");
    expect(found.at(-1)).toBe("Done.");
  });

  it("splits a run of terminators only once, after the last one", () => {
    const input = `${sentence.repeat(4)}Wait... then go?! Now.`;
    const found = texts(input);
    expect(found).toContain("Wait...");
    expect(found).toContain("then go?!");
  });

  it("does not split a decimal, an abbreviation mid-word, or a terminator with no whitespace after it", () => {
    const input = `${sentence.repeat(4)}Charge 1.50 USD and see docs.example.com now.`;
    expect(texts(input).at(-1)).toBe("Charge 1.50 USD and see docs.example.com now.");
  });

  it("does not split a quoted sentence embedded mid-sentence", () => {
    const input = `${sentence.repeat(4)}If the author wrote "this is temporary." in a comment, ask when.`;
    expect(texts(input).at(-1)).toBe('If the author wrote "this is temporary." in a comment, ask when.');
  });

  it("splits across a line break inside one paragraph", () => {
    const input = `${sentence.repeat(4)}One sentence here.\nAnother sentence there.`;
    const found = texts(input);
    expect(found).toContain("One sentence here.");
    expect(found.at(-1)).toBe("Another sentence there.");
  });
});

describe("rule order", () => {
  it("lets a fence win over a tag region that opens inside it", () => {
    const input = ["```", "<x>", "```", "", "</x>"].join("\n");
    expect(texts(input)).toEqual(["```\n<x>\n```", "</x>"]);
  });

  it("lets a tag region win over a heading and a blank line inside it", () => {
    const input = ["<x>", "# heading", "", "para", "</x>"].join("\n");
    expect(texts(input)).toEqual(["<x>\n# heading\n\npara\n</x>"]);
  });

  it("lets a heading end the paragraph above it without a blank line", () => {
    expect(texts("paragraph text\n# heading\nmore text")).toEqual(["paragraph text", "# heading", "more text"]);
  });

  it("lets the list rule win over the sentence rule in the same paragraph", () => {
    const long = "A sentence that is quite long indeed. ".repeat(6);
    expect(texts(`- ${long}\n- ${long}`)).toHaveLength(2);
  });
});

describe("whitespace handling", () => {
  it("leaves a leading byte-order mark in the gap, not in the first segment", () => {
    const found = segment("﻿You are a helpful assistant.");
    expect(found[0]!.start).toBe(1);
    expect(found[0]!.text.startsWith("﻿")).toBe(false);
  });

  it("trims indentation and trailing spaces off a segment without losing them from the source", () => {
    const input = "   indented paragraph   \n\n\tsecond one\t";
    const found = segment(input);
    expect(found.map((s) => s.text)).toEqual(["indented paragraph", "second one"]);
    expect(checkSegmentInvariants(input, found)).toEqual([]);
  });

  it("keeps whitespace inside a segment untouched", () => {
    expect(texts("one   two\tthree")).toEqual(["one   two\tthree"]);
  });

  // These four are one bug, found in self-review: the structural rules used to skip only spaces
  // and tabs as indentation while everything else used the full ECMAScript whitespace set. A
  // byte-order mark glued to the front of a prompt — which is exactly where a byte-order mark
  // lives — then stopped a fence *opener* being recognised while the closer still was, so the
  // closer was read as a new unterminated opener and swallowed the rest of the prompt.
  it("recognises a fence whose opener is preceded by a byte-order mark", () => {
    const input = '\uFEFF```json\n{ "a": 1 }\n```\n\nAfter the fence.\n\nAnother paragraph.';
    expect(texts(input)).toEqual(['```json\n{ "a": 1 }\n```', "After the fence.", "Another paragraph."]);
  });

  it("recognises a heading preceded by a byte-order mark or a non-breaking space", () => {
    expect(texts("\uFEFF# Role\n\nBody text.")).toEqual(["# Role", "Body text."]);
    expect(texts("\u00A0## Voice\n\nBody text.")).toEqual(["## Voice", "Body text."]);
  });

  it("recognises list items preceded by a byte-order mark or a non-breaking space", () => {
    expect(texts("\uFEFF- one\n- two")).toEqual(["- one", "- two"]);
    expect(texts("\u00A01. one\n2. two")).toEqual(["1. one", "2. two"]);
  });

  it("still treats a tab-indented line as code rather than a fence or a heading", () => {
    expect(texts("\t```\n\tstill code")).toEqual(["```\n\tstill code"]);
    expect(texts("\t# not a heading\n\tsame paragraph")).toEqual(["# not a heading\n\tsame paragraph"]);
  });
});
