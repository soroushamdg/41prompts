import type { SuiteCheckRow, SuiteResultRow, SuiteRunRow } from "@41prompts/db";
import { describe, expect, it } from "vitest";
import {
  checkRows,
  columnProblemWords,
  costSentence,
  csvProblemWords,
  evidenceSentence,
  highlightParts,
  refusalWords,
  stateWords,
  summaryOf,
  verification,
} from "./view";

function check(overrides: Partial<SuiteCheckRow> = {}): SuiteCheckRow {
  return {
    id: "schk_1",
    checkId: "chk_1",
    blokId: "blok_1",
    blokKind: "expected",
    blokText: 'Never mention "sorry".',
    kind: "must_not_contain",
    position: 0,
    ...overrides,
  };
}

function result(overrides: Partial<SuiteResultRow> = {}): SuiteResultRow {
  return {
    id: "sres_1",
    suiteCheck: "schk_1",
    inputIndex: 0,
    run: "run_1",
    outcome: "pass",
    reason: null,
    evidence: null,
    ...overrides,
  };
}

const run = (overrides: Partial<SuiteRunRow> = {}) =>
  ({
    state: "done",
    completedInputs: 2,
    totalInputs: 2,
    refusalReason: null,
    calls: 2,
    cachedCalls: 0,
    costCents: 4,
    ...overrides,
  }) as SuiteRunRow;

describe("checkRows", () => {
  it("rolls every input's verdict up onto its check, and names the owning blok", () => {
    const [row] = checkRows(
      [check()],
      [result({ id: "a", inputIndex: 0, outcome: "pass" }), result({ id: "b", inputIndex: 1, outcome: "fail" })]
    );
    expect(row).toMatchObject({ passed: 1, failed: 1, total: 2, status: "fail", meterValue: 50, blokId: "blok_1" });
  });

  it("gives a check with any failure the failing status, not a partial pass", () => {
    const [row] = checkRows([check()], [result({ outcome: "fail" }), result({ id: "b", inputIndex: 1 })]);
    expect(row!.status).toBe("fail");
  });

  /** Amber is drift. Nothing on this page is drift, so nothing here may be amber (rule 10). */
  it("never produces a status other than pass or fail", () => {
    const rows = checkRows(
      [check(), check({ id: "schk_2", kind: null })],
      [result(), result({ id: "b", suiteCheck: "schk_2", outcome: "not_graded", reason: "no_kind" })]
    );
    expect(rows.map((row) => row.status)).toEqual(["pass", undefined]);
  });

  it("gives a check nothing could grade no colour and no rate", () => {
    const [row] = checkRows(
      [check({ kind: null })],
      [result({ outcome: "not_graded", reason: "no_kind" })]
    );
    expect(row).toMatchObject({ status: undefined, meterValue: 0, notGraded: 1 });
  });

  it("points at the first failing input, with its evidence", () => {
    const [row] = checkRows(
      [check()],
      [
        result({ id: "a", inputIndex: 2, outcome: "fail", evidence: { kind: "excerpt", text: "sorry", start: 5, end: 10 } }),
        result({ id: "b", inputIndex: 1, outcome: "fail", evidence: { kind: "excerpt", text: "sorry", start: 0, end: 5 } }),
      ]
    );
    expect(row!.firstFailure?.inputIndex).toBe(1);
  });

  it("renders ADR-003's phrase, never the internal identifier", () => {
    expect(checkRows([check({ kind: "json_shape" })], [])[0]!.phrase).toBe("valid JSON shape");
    expect(checkRows([check({ kind: "word_limit" })], [])[0]!.phrase).toBe("word limit");
  });
});

describe("the verification sentences", () => {
  /**
   * **The named test for the inherited requirement.** EPIC-030 ships a `RunSummary` with two
   * booleans and deliberately no `passed` field, because "did this pass?" has two honest answers
   * when nothing could be graded. The words are the last mile, and this is the assertion that the
   * last mile was walked.
   */
  it("does not say the same thing about an ungraded run as about one that passed", () => {
    const allPassed = [result({ id: "a" }), result({ id: "b", inputIndex: 1 })];
    const noneGraded = [
      result({ id: "a", outcome: "not_graded", reason: "no_kind" }),
      result({ id: "b", inputIndex: 1, outcome: "not_graded", reason: "needs_judgement" }),
    ];

    const passed = verification(summaryOf(allPassed), allPassed);
    const ungraded = verification(summaryOf(noneGraded), noneGraded);

    expect(passed.headline).not.toBe(ungraded.headline);
    expect(ungraded.headline).not.toContain("passed");
    expect(JSON.stringify(ungraded)).not.toContain("passed");
  });

  it("gives the un-checked count its own sentence, and says how many and why", () => {
    const results = [
      result({ id: "a" }),
      result({ id: "b", inputIndex: 1, outcome: "not_graded", reason: "params_not_derivable" }),
      result({ id: "c", inputIndex: 2, outcome: "not_graded", reason: "needs_judgement" }),
    ];
    const { headline, notChecked } = verification(summaryOf(results), results);

    expect(notChecked).toContain("2 of 3");
    expect(notChecked).toContain("the rule does not say what to measure");
    expect(notChecked).toContain("it needs judgement");
    // Its own sentence, not folded into the headline.
    expect(headline).not.toContain("could not be checked");
  });

  it("tells the four reasons apart rather than collapsing them", () => {
    const reasons = ["no_kind", "params_not_derivable", "pattern_rejected", "needs_judgement"] as const;
    const said = reasons.map((reason) => {
      const results = [result({ outcome: "not_graded", reason })];
      return verification(summaryOf(results), results).notChecked;
    });
    expect(new Set(said).size).toBe(4);
  });

  it("keeps failures in a separate sentence from the un-checked count", () => {
    const results = [
      result({ id: "a", outcome: "fail" }),
      result({ id: "b", inputIndex: 1, outcome: "not_graded", reason: "no_kind" }),
    ];
    const said = verification(summaryOf(results), results);
    expect(said.failures).toContain("1 of 2 failed");
    expect(said.notChecked).toContain("1 of 2 could not be checked");
  });

  it("says a prompt with no checks verified nothing", () => {
    const said = verification(summaryOf([]), []);
    expect(said.headline).toContain("no checks");
    expect(said.notChecked).toBeUndefined();
  });

  it("says everything passed only when every check ran and every one passed", () => {
    const results = [result({ id: "a" }), result({ id: "b", inputIndex: 1 })];
    expect(verification(summaryOf(results), results).headline).toBe("Every check ran, and every one passed.");
  });
});

describe("the cost sentence", () => {
  /** EPIC-031's inherited requirement 3, as a test rather than as a promise. */
  it("distinguishes a first run that cost something from a free re-run", () => {
    const first = costSentence({ calls: 4, cachedCalls: 0, costCents: 40 });
    const again = costSentence({ calls: 0, cachedCalls: 4, costCents: 0 });

    expect(first).toContain("$0.40");
    expect(first).toContain("4 calls");
    expect(again).not.toBe(first);
    expect(again).toContain("spent nothing");
    expect(again).toContain("cache");
  });

  it("says what the number counts, not merely what it is", () => {
    expect(costSentence({ calls: 1, cachedCalls: 0, costCents: 3 })).toContain(
      "not the cost of everything on this page"
    );
  });

  it("makes cache hits visible when only some of the inputs were cached", () => {
    const said = costSentence({ calls: 2, cachedCalls: 3, costCents: 6 });
    expect(said).toContain("$0.06");
    expect(said).toContain("3 more inputs were answered from the cache");
  });
});

describe("state and refusal words", () => {
  it("says a refused run is refused, and why", () => {
    expect(stateWords(run({ state: "refused", refusalReason: "provider_not_configured", completedInputs: 0 }))).toContain(
      "Refused"
    );
    expect(refusalWords("provider_not_configured")).toContain("no model provider is configured");
  });

  it("tells a run that stopped at the cap apart from one that was refused outright", () => {
    const stopped = stateWords(run({ state: "done", refusalReason: "budget_exhausted", completedInputs: 40, totalInputs: 200 }));
    expect(stopped).toContain("Stopped after 40 of 200");
    expect(stopped).not.toContain("Refused");
  });

  it("shows progress while a run is in flight", () => {
    expect(stateWords(run({ state: "running", completedInputs: 3, totalInputs: 10 }))).toBe(
      "Running — 3 of 10 inputs"
    );
  });

  it("never leaves a refusal unexplained", () => {
    expect(refusalWords(null)).toContain("itself a defect");
  });

  /**
   * **A queue that would not take the job is not a provider that is not configured.**
   *
   * Both are refusals nobody outside this project caused, which is why it is tempting to give them
   * one sentence. They send a person to different places: one to set a key, the other to a queue
   * that failed with the key quite possibly set all along. A refusal that names the wrong cause is
   * a wrong answer delivered confidently.
   */
  it("tells a missing provider and an unavailable queue apart", () => {
    expect(refusalWords("queue_unavailable")).toContain("queue");
    expect(refusalWords("queue_unavailable")).not.toContain("provider");
    expect(refusalWords("provider_not_configured")).not.toBe(refusalWords("queue_unavailable"));
  });
});

describe("evidence, as a sentence", () => {
  it("says where an excerpt was found", () => {
    expect(evidenceSentence({ kind: "excerpt", text: "sorry", start: 5, end: 10 })).toBe(
      "Found “sorry” at character 5."
    );
  });

  it("names the unit a measurement was counted in", () => {
    expect(evidenceSentence({ kind: "measurement", measured: 42, limit: 30, counting: "words" })).toContain(
      "Measured 42 words against a limit of 30"
    );
  });

  it("says what was looked for and not found", () => {
    expect(evidenceSentence({ kind: "absent", sought: "refund" })).toBe(
      "Looked for “refund” and it was not there."
    );
  });

  it("says what shape was expected and what turned up", () => {
    expect(evidenceSentence({ kind: "shape", expected: ["a", "b"], found: ["a"] })).toBe(
      "Expected a, b. Found a."
    );
    expect(evidenceSentence({ kind: "shape", expected: ["a"], found: [] })).toContain("not an object");
  });

  it("has nothing to say when there is no evidence", () => {
    expect(evidenceSentence(undefined)).toBeUndefined();
  });
});

describe("highlightParts", () => {
  it("splits the output around the failing region", () => {
    expect(highlightParts("I am sorry, no.", { kind: "excerpt", text: "sorry", start: 5, end: 10 })).toEqual({
      before: "I am ",
      match: "sorry",
      after: ", no.",
    });
  });

  /**
   * Core counts **code points** and says so. Slicing the string directly would count UTF-16 code
   * units, cut a surrogate pair in half, and highlight the wrong run of text.
   */
  it("counts code points, so an emoji before the region does not shift it", () => {
    const output = "👩‍💻 says sorry";
    const points = [...output];
    const start = points.indexOf("s");
    const parts = highlightParts(output, { kind: "excerpt", text: "sorry", start: start + 5, end: start + 10 });
    expect(parts.match).toBe("sorry");
  });

  it("has no region to mark when the evidence is not an excerpt", () => {
    const parts = highlightParts("hello", { kind: "absent", sought: "x" });
    expect(parts).toEqual({ before: "hello", match: "", after: "" });
  });
});

describe("upload refusals, in words", () => {
  it("names the line a CSV went wrong on", () => {
    expect(csvProblemWords({ kind: "ragged_row", line: 4, expected: 3, found: 2 })).toContain("Line 4");
    expect(csvProblemWords({ kind: "unterminated_quote", line: 2 })).toContain("line 2");
  });

  it("names the column that matches no variable, and says nothing was saved", () => {
    const said = columnProblemWords([{ kind: "unknown_column", name: "urgency" }]);
    expect(said).toContain("“urgency”");
    expect(said).toContain("Nothing was saved.");
  });

  it("names the required variable the file has no column for", () => {
    const said = columnProblemWords([{ kind: "missing_required", name: "order" }]);
    expect(said).toContain("“order”");
    expect(said).toContain("requires");
  });

  it("says plainly that a prompt with no variables cannot take a file", () => {
    const said = columnProblemWords([{ kind: "no_variables_declared" }]);
    expect(said).toContain("declares no variables");
    expect(said).toContain("Variables tab");
  });
});
