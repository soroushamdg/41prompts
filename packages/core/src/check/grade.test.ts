// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { checkKindFor } from "../compile/checks.js";
import { compile } from "../compile/compile.js";
import { CHECK_KINDS, type Check, type PromptBlok } from "../compile/types.js";
import { grade, gradeAll, summarise } from "./grade.js";

function check(partial: Partial<Check> & Pick<Check, "id" | "blokId" | "text">): Check {
  return partial as Check;
}

const WORD_LIMIT = check({
  id: "chk_1",
  blokId: "blok_aaaaaaaaaaaaaaaa",
  text: "Reply in at most 5 words.",
  kind: "word_limit"
});

describe("grade() is deterministic", () => {
  /**
   * The property, asserted as a property rather than as a handful of cases.
   *
   * Everything in this package is pure, and this is the one function where a caller would most
   * reasonably expect otherwise — it grades a model's output, and models are the least deterministic
   * thing in the system. The function is not.
   */
  it("returns deeply equal results for the same inputs, every time", () => {
    const outputs = ["one two three", "one two three four five six", "", "🚀 🚀", '{"a":1}'];
    for (const output of outputs) {
      const first = grade(WORD_LIMIT, output);
      for (let i = 0; i < 25; i++) {
        expect(grade(WORD_LIMIT, output)).toEqual(first);
      }
    }
  });

  it("does not depend on the order checks are graded in", () => {
    const a = check({ id: "chk_a", blokId: "blok_a", text: 'Must contain "yes".', kind: "must_contain" });
    const b = check({ id: "chk_b", blokId: "blok_b", text: "Reply in at most 2 words.", kind: "word_limit" });
    const forwards = gradeAll([a, b], "yes indeed");
    const backwards = gradeAll([b, a], "yes indeed");
    expect(forwards[0]).toEqual(backwards[1]);
    expect(forwards[1]).toEqual(backwards[0]);
  });

  it("returns results in the order it was given, and only that order", () => {
    const checks = [WORD_LIMIT, { ...WORD_LIMIT, id: "chk_2" }, { ...WORD_LIMIT, id: "chk_3" }];
    expect(gradeAll(checks, "one").map((result) => result.checkId)).toEqual(["chk_1", "chk_2", "chk_3"]);
  });
});

describe("not_graded is neither a pass nor a fail", () => {
  it("is not_graded with no_kind when no shape matched", () => {
    const result = grade(check({ id: "c", blokId: "b", text: "Be helpful." }), "anything");
    expect(result.outcome).toBe("not_graded");
    expect(result.reason).toBe("no_kind");
    expect(result.kind).toBeUndefined();
  });

  it("is not_graded with params_not_derivable when the kind is known and the number is not there", () => {
    const result = grade(
      check({ id: "c", blokId: "b", text: "Reply briefly, at most a few words.", kind: "word_limit" }),
      "anything"
    );
    expect(result.outcome).toBe("not_graded");
    expect(result.reason).toBe("params_not_derivable");
    // The kind is still reported: we know what sort of check it would be, only not what it needs.
    expect(result.kind).toBe("word_limit");
  });

  it("is not_graded with pattern_rejected when the filter refused the pattern", () => {
    const result = grade(
      check({ id: "c", blokId: "b", text: 'Must match "(a+)+$".', kind: "matches_pattern" }),
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaab"
    );
    expect(result.outcome).toBe("not_graded");
    expect(result.reason).toBe("pattern_rejected");
  });

  it("is not_graded with needs_judgement for refuses_to_answer", () => {
    const result = grade(
      check({ id: "c", blokId: "b", text: "Refuses to answer out-of-scope questions.", kind: "refuses_to_answer" }),
      "I cannot help with that"
    );
    expect(result.outcome).toBe("not_graded");
    expect(result.reason).toBe("needs_judgement");
  });

  it("carries no evidence, because there is nothing to show", () => {
    const result = grade(check({ id: "c", blokId: "b", text: "Be helpful." }), "anything");
    expect(result.evidence).toBeUndefined();
  });
});

describe("the summary keeps two questions apart", () => {
  const passing = { checkId: "1", blokId: "b", outcome: "pass" } as const;
  const failing = { checkId: "2", blokId: "b", outcome: "fail" } as const;
  const ungraded = { checkId: "3", blokId: "b", outcome: "not_graded", reason: "no_kind" } as const;

  /**
   * **The criterion, in one test.** Ten ungradable checks and ten passing checks must not produce
   * the same answer, and a single boolean would have to make them.
   */
  it("distinguishes everything passed from nothing could be checked", () => {
    const allPassed = summarise(Array.from({ length: 10 }, (_, i) => ({ ...passing, checkId: `p${i}` })));
    const nonePossible = summarise(Array.from({ length: 10 }, (_, i) => ({ ...ungraded, checkId: `u${i}` })));

    expect(allPassed.noFailures).toBe(true);
    expect(allPassed.fullyChecked).toBe(true);

    expect(nonePossible.noFailures).toBe(true);
    expect(nonePossible.fullyChecked).toBe(false);

    expect(allPassed).not.toEqual(nonePossible);
  });

  it("does not expose a single field called passed, which a caller would use as the answer", () => {
    expect(Object.keys(summarise([passing]))).not.toContain("passed_");
    expect(summarise([passing])).not.toHaveProperty("passed_overall");
    // `passed` exists only as a count, and a count cannot be mistaken for a verdict.
    expect(typeof summarise([passing]).passed).toBe("number");
  });

  it("blocks Live on a failure and not on an ungradable check", () => {
    // CLAUDE.md rule 9: publishing is blocked when checks fail. Ten ungradable checks have failed
    // nothing, and blocking there would refuse to publish a prompt for being simple.
    expect(summarise([failing, passing]).noFailures).toBe(false);
    expect(summarise([ungraded, passing]).noFailures).toBe(true);
  });

  it("counts every outcome, and the counts add up to the total", () => {
    const summary = summarise([passing, failing, ungraded, passing]);
    expect(summary).toMatchObject({ total: 4, passed: 2, failed: 1, notGraded: 1 });
    expect(summary.passed + summary.failed + summary.notGraded).toBe(summary.total);
  });

  it("an empty set is not fully checked, because nothing verified anything", () => {
    const summary = summarise([]);
    expect(summary.noFailures).toBe(true);
    expect(summary.fullyChecked).toBe(false);
  });
});

describe("a failure attributes to exactly one blok", () => {
  const BLOKS: PromptBlok[] = [
    { id: "blok_1111111111111111", kind: "context", text: "You route support email.", order: 10 },
    { id: "blok_2222222222222222", kind: "expected", text: "Reply in at most 5 words.", order: 20 },
    { id: "blok_3333333333333333", kind: "expected", text: 'Must contain "ticket".', order: 30 }
  ];

  it("every check names a blok that is in the prompt", () => {
    const compiled = compile(BLOKS);
    const ids = new Set(BLOKS.map((blok) => blok.id));
    expect(compiled.checks.length).toBeGreaterThan(0);
    for (const one of compiled.checks) {
      expect(one.blokId).toBeTruthy();
      expect(ids.has(one.blokId)).toBe(true);
    }
  });

  it("every result carries the blok id of its check, unchanged", () => {
    const compiled = compile(BLOKS);
    for (const result of gradeAll(compiled.checks, "a short reply about a ticket")) {
      const source = compiled.checks.find((one) => one.id === result.checkId);
      expect(source).toBeDefined();
      expect(result.blokId).toBe(source!.blokId);
    }
  });

  /**
   * Attribution has to survive a recompile, or a result from an earlier run cannot be matched back
   * to the blok that caused it — which is the whole point of attributing at all.
   */
  it("survives an unrelated blok being edited", () => {
    const before = compile(BLOKS);
    const after = compile(
      BLOKS.map((blok) =>
        blok.id === "blok_1111111111111111" ? { ...blok, text: "You route inbound support email." } : blok
      )
    );

    for (const original of before.checks) {
      const same = after.checks.find((one) => one.id === original.id);
      expect(same, `check ${original.id} should survive the recompile`).toBeDefined();
      expect(same!.blokId).toBe(original.blokId);
    }
  });
});

describe("the eight, and no ninth", () => {
  it("grades every kind CHECK_KINDS lists without throwing", () => {
    for (const kind of CHECK_KINDS) {
      const result = grade(check({ id: "c", blokId: "b", text: "Reply in at most 5 words.", kind }), "one two");
      expect(["pass", "fail", "not_graded"]).toContain(result.outcome);
    }
  });

  it("never invents a kind that is not one of the eight", () => {
    const compiled = compile([
      { id: "blok_9999999999999999", kind: "expected", text: "Be generally helpful and kind.", order: 10 }
    ]);
    for (const one of compiled.checks) {
      if (one.kind !== undefined) expect(CHECK_KINDS).toContain(one.kind);
    }
  });
});

/**
 * **Evidence is a fact about the output, never a sentence about it** (decision 5).
 *
 * The same rule the compiler lives under — `CLAUDE.md` rule 3 — arriving on the other side. If core
 * ever starts writing prose about somebody's model output, this is where it gets caught: every
 * variant is checked to be a slice of the input, a measurement with its unit, or a statement about
 * something sought, and nothing else.
 */
describe("evidence points at the output rather than describing it", () => {
  const cases: readonly { text: string; kind: Check["kind"]; output: string }[] = [
    { text: 'Always include "ticket".', kind: "must_contain", output: "your ticket is open" },
    { text: 'Never say "guarantee".', kind: "must_not_contain", output: "we guarantee it" },
    { text: "Reply in at most 3 words.", kind: "word_limit", output: "one two three four" },
    { text: "At most 5 characters.", kind: "character_limit", output: "far too long" },
    { text: 'Return JSON with "intent".', kind: "json_shape", output: '{"other":1}' },
    { text: "Reply with one of: yes, no", kind: "allowed_values", output: "maybe" },
    { text: 'Must match "^[A-Z]+$".', kind: "matches_pattern", output: "lower" }
  ];

  it.each(cases)("$kind produces a fact, not prose", ({ text, kind, output }) => {
    const result = grade(check({ id: "c", blokId: "b", text, kind }), output);
    expect(result.outcome === "pass" || result.outcome === "fail").toBe(true);
    const evidence = result.evidence!;
    expect(evidence).toBeDefined();

    switch (evidence.kind) {
      case "excerpt":
        // A real slice of the real output, at the offsets claimed.
        expect(output).toContain(evidence.text);
        expect([...output].slice(evidence.start, evidence.end).join("")).toBe(evidence.text);
        break;
      case "measurement":
        expect(typeof evidence.measured).toBe("number");
        expect(typeof evidence.limit).toBe("number");
        expect(["words", "characters"]).toContain(evidence.counting);
        break;
      case "absent":
        // What was looked for, taken from the rule — never a sentence about it.
        expect(evidence.sought.length).toBeGreaterThan(0);
        expect(output).not.toContain(evidence.sought);
        break;
      case "shape":
        expect(Array.isArray(evidence.expected)).toBe(true);
        expect(Array.isArray(evidence.found)).toBe(true);
        break;
    }
  });

  it("carries no free-text field anywhere a sentence could hide", () => {
    const result = grade(
      check({ id: "c", blokId: "b", text: "Reply in at most 3 words.", kind: "word_limit" }),
      "one two three four"
    );
    // `message`, `summary`, `explanation` — the names prose arrives under.
    for (const forbidden of ["message", "summary", "explanation", "advice", "suggestion"]) {
      expect(result.evidence).not.toHaveProperty(forbidden);
      expect(result).not.toHaveProperty(forbidden);
    }
  });
});

/**
 * **`grade()` never produces a judgement, and that is a boundary rather than an omission.**
 *
 * `Evidence` gained a `judgement` variant in EPIC-033, and it is the only one no function in this
 * package can emit. The four others are facts `grade()` derives from the output by itself; a
 * judgement requires a model, a model requires IO, and `packages/core` has none — `CLAUDE.md` rule
 * 1 and dependency-cruiser both say so, and this test says it in the one place somebody adding a
 * "quick" judge heuristic here would be looking.
 *
 * The variant lives here anyway because the *type* is the contract `apps/worker` writes into and
 * `apps/web` reads out of, and a shared shape with no shared home is how two copies start.
 */
describe("the judgement evidence variant", () => {
  it("is never produced by grade(), whatever the check", () => {
    const outputs = ["", "I cannot help with that.", "anything at all", "{}"];
    const texts = [
      "Refuse to answer questions about pricing.",
      'Never mention "sorry".',
      "Reply in at most 30 words.",
      "Always include the order number.",
    ];

    for (const text of texts) {
      for (const output of outputs) {
        const result = grade({ id: "c", blokId: "b", text, kind: checkKindFor(text) }, output);
        expect(result.evidence?.kind).not.toBe("judgement");
      }
    }
  });

  /**
   * And the reason the worker has work to do: a refusal check is handed on, not answered. If this
   * ever returns a verdict, somebody has shipped the phrase list `graders.ts` refuses to ship.
   */
  it("hands a refusal check on to the judge rather than guessing", () => {
    const result = grade(
      { id: "c", blokId: "b", text: "Refuse to answer questions about pricing.", kind: "refuses_to_answer" },
      "I cannot stress enough how much I can help"
    );
    expect(result.outcome).toBe("not_graded");
    expect(result.reason).toBe("needs_judgement");
  });
});
