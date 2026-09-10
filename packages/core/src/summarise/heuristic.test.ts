// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { cluster } from "../cluster/cluster.js";
import { CLUSTER_FIXTURES } from "../cluster/fixtures/prompts.js";
import { segment } from "../segment/segment.js";
import { checkSummaryContract, SUMMARY_CONTRACT_CASES } from "./contract.js";
import { heuristicSummariser, HEURISTIC_SUMMARISER_VERSION, SUMMARY_MAX_LENGTH } from "./heuristic.js";

const summarise = (text: string, kind: Parameters<typeof kindBlok>[0] = "constraint"): string =>
  heuristicSummariser.summarise(kindBlok(kind, text), text).text;

function kindBlok(kind: "context" | "constraint" | "example" | "expected" | "image_ref" | "image_input", text: string) {
  return { id: "blok_0000000000000000", kind, ranges: [{ start: 0, end: text.length }] } as const;
}

describe("the heuristic summariser against the shared contract", () => {
  it.each(SUMMARY_CONTRACT_CASES.map((c) => ({ name: c.name, testCase: c })))(
    "satisfies the contract on $name",
    ({ testCase }) => {
      const summary = heuristicSummariser.summarise(testCase.blok, testCase.source);
      expect(checkSummaryContract(testCase.blok, testCase.source, summary, HEURISTIC_SUMMARISER_VERSION)).toEqual([]);
    }
  );

  it("returns a valid summary for empty, whitespace-only, single-word and 10,000-character bloks without throwing", () => {
    // Decision 9, named explicitly because these are the four shapes that make a summariser throw:
    // a first sentence that is not there, a truncation with nothing to truncate at, an index into
    // nothing.
    for (const name of [
      "empty source",
      "whitespace-only blok",
      "single word",
      "a 10,000-character blok with no sentence end"
    ]) {
      const testCase = SUMMARY_CONTRACT_CASES.find((c) => c.name === name)!;
      const summary = heuristicSummariser.summarise(testCase.blok, testCase.source);
      expect(summary.text.length, name).toBeGreaterThan(0);
      expect(summary.source, name).toBe("heuristic");
    }
  });

  it("always says source: heuristic", () => {
    for (const testCase of SUMMARY_CONTRACT_CASES) {
      expect(heuristicSummariser.summarise(testCase.blok, testCase.source).source).toBe("heuristic");
    }
  });
});

describe("what the heuristic actually produces", () => {
  it("takes the first sentence and prefixes the kind", () => {
    expect(summarise("Always respond in JSON only. Never add commentary.")).toBe(
      "Rule: Always respond in JSON only."
    );
    expect(summarise("For example, return billing.", "example")).toBe("Example: For example, return billing.");
    expect(summarise("You are a support assistant.", "context")).toBe("You are a support assistant.");
  });

  it("leaves context unprefixed, because context is the least confident classification there is", () => {
    expect(summarise("Anything at all.", "context")).toBe("Anything at all.");
  });

  it("strips a leading list marker, because the marker is punctuation and not content", () => {
    expect(summarise("3. Never page after 22:00.")).toBe("Rule: Never page after 22:00.");
    expect(summarise("- Be direct.")).toBe("Rule: Be direct.");
  });

  it("collapses a multi-line fragment onto one line", () => {
    expect(summarise("Keep it short\nand tidy")).toBe("Rule: Keep it short and tidy");
    expect(summarise("Keep it short\nand tidy")).not.toContain("\n");
  });

  it("collapses the line separators that are not \\n", () => {
    // Found in review: the contract only rejected `\n`, and neither collapse nor the worker's
    // sanitiser touched `\v`, `\f`, U+0085, U+2028 or U+2029 — every one of which starts a new line
    // in something. A summary that renders on two lines breaks a card whatever the character was
    // called.
    for (const separator of ["\v", "\f", "\u0085", "\u2028", "\u2029"]) {
      const text = summarise(`Keep it short${separator}and tidy`);
      expect(text, JSON.stringify(separator)).not.toMatch(/[\n\r\v\f\u0085\u2028\u2029]/);
    }
  });

  it(`truncates at ${SUMMARY_MAX_LENGTH} characters, on a word boundary, and says so`, () => {
    const long = `${"a very long clause that keeps going ".repeat(6)}end`;
    const text = summarise(long);
    expect(text.length).toBeLessThanOrEqual(SUMMARY_MAX_LENGTH);
    expect(text.endsWith("…")).toBe(true);
    expect(text).not.toContain("goin…");
  });

  it("truncates mid-word only when there is no word boundary to use", () => {
    const text = summarise("x".repeat(200));
    expect(text.length).toBeLessThanOrEqual(SUMMARY_MAX_LENGTH);
    expect(text.endsWith("…")).toBe(true);
  });

  it("never paraphrases: every word in the summary comes from the source or the kind prefix", () => {
    const source = "Never mention that you are an AI model.";
    const text = summarise(source).replace("Rule: ", "");
    for (const word of text.replace("…", "").split(" ")) {
      expect(source.toLowerCase(), word).toContain(word.toLowerCase());
    }
  });
});

describe("a multi-range blok summarises the blok, not its first range", () => {
  const disagree = SUMMARY_CONTRACT_CASES.find((c) => c.name === "a multi-range blok whose ranges disagree")!;
  const agree = SUMMARY_CONTRACT_CASES.find((c) => c.name === "a multi-range blok whose ranges agree")!;

  it("uses the shared sentence when every range says the same thing", () => {
    expect(heuristicSummariser.summarise(agree.blok, agree.source).text).toBe("Rule: Reply in French.");
  });

  it("asserts neither one when the ranges disagree", () => {
    // Decision 8: says less rather than picking one. Showing only the first range would be lying by
    // omission on a card whose whole job is to say what the blok contains.
    const text = heuristicSummariser.summarise(disagree.blok, disagree.source).text;
    expect(text).toBe("Rule stated in 2 places");
    expect(text).not.toContain("Always");
    expect(text).not.toContain("Never");
    expect(text).not.toContain("audit");
  });
});

describe("determinism", () => {
  it("produces identical summaries over 100 runs of every clustering fixture", () => {
    for (const fixture of CLUSTER_FIXTURES) {
      const bloks = cluster(segment(fixture.text));
      const first = JSON.stringify(bloks.map((blok) => heuristicSummariser.summarise(blok, fixture.text)));
      for (let run = 0; run < 100; run++) {
        expect(
          JSON.stringify(bloks.map((blok) => heuristicSummariser.summarise(blok, fixture.text))),
          fixture.name
        ).toBe(first);
      }
    }
  });

  it("satisfies the contract on every blok of every clustering fixture", () => {
    for (const fixture of CLUSTER_FIXTURES) {
      for (const blok of cluster(segment(fixture.text))) {
        const summary = heuristicSummariser.summarise(blok, fixture.text);
        expect(
          checkSummaryContract(blok, fixture.text, summary, HEURISTIC_SUMMARISER_VERSION),
          `${fixture.name} ${blok.id}`
        ).toEqual([]);
      }
    }
  });
});
