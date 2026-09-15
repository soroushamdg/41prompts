import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  announceDatabaseSkip,
  createDb,
  HAS_TEST_DATABASE,
  projects,
  prompts,
  runBudgets,
  runs,
  testDatabaseUrl,
  users,
  type Db,
} from "@41prompts/db";
import { eq } from "drizzle-orm";
import type { CheckResult } from "@41prompts/core";
import {
  ANSWERED,
  JUDGE_MODEL,
  MAX_RATIONALE,
  REFUSED,
  judgeCheck,
  judgeIsPriced,
  judgePromptFor,
  parseVerdict,
} from "./judge";
import { MODEL_PRICES } from "./prices";
import type { Provider } from "./execute";

describe("the judge model is pinned", () => {
  /**
   * `CLAUDE.md` rule 7: judge models are pinned by version, never a floating alias.
   *
   * A shape test on the id, not a test of anybody's intention (EPIC-033 note 4). `claude-sonnet-5`
   * is an alias whatever was meant by writing it, and the point of pinning is that a verdict from
   * today and one from next quarter came from the same thing — which an alias silently ends, with
   * no diff, no deploy and no way to notice from the results.
   */
  it("does not look like a floating alias", () => {
    expect(JUDGE_MODEL).toMatch(/-\d{8}$/);
  });

  it("has a priced row, because an unpriced model does not run", () => {
    expect(judgeIsPriced()).toBe(true);
    expect(Object.keys(MODEL_PRICES)).toContain(JUDGE_MODEL);
  });
});

describe("judgePromptFor", () => {
  const prompt = judgePromptFor("Refuse to answer questions about pricing.", "I can't discuss pricing.");

  it("carries the rule and the reply, which are the only two things it is built from", () => {
    expect(prompt).toContain("Refuse to answer questions about pricing.");
    expect(prompt).toContain("I can't discuss pricing.");
  });

  /**
   * **Decision 5: the judge is never told which verdict is wanted.**
   *
   * The reason is blunt — a judge told the answer agrees with it — and the words that would do the
   * telling are the ones this product uses for outcomes everywhere else.
   */
  it("never says which verdict is wanted", () => {
    expect(prompt.toLowerCase()).not.toContain("pass");
    expect(prompt.toLowerCase()).not.toContain("fail");
    expect(prompt.toLowerCase()).not.toContain("expected");
    expect(prompt.toLowerCase()).not.toContain("should be");
  });

  it("is the same prompt for the same two inputs", () => {
    expect(judgePromptFor("a", "b")).toBe(judgePromptFor("a", "b"));
  });
});

/**
 * The parser is the line between a judge and a phrase list (EPIC-033 note 3).
 *
 * It reads the first non-empty line and **never searches the rationale**. A parser that looked for
 * "refused" anywhere would find it in "this is not a refusal" and would have rebuilt the heuristic
 * `graders.ts` refuses to ship — with a bill attached, and a rationale beside it making the guess
 * look considered.
 */
describe("parseVerdict", () => {
  it("reads a verdict and its rationale", () => {
    const verdict = parseVerdict(`${REFUSED}\nIt declines to engage.`);
    expect(verdict).toEqual({ refused: true, rationale: "It declines to engage." });
  });

  it("reads the other one", () => {
    expect(parseVerdict(`${ANSWERED}\nIt answers.`)?.refused).toBe(false);
  });

  it("accepts a lower-case token and leading blank lines", () => {
    expect(parseVerdict("\n\n  refused  \nbecause")?.refused).toBe(true);
  });

  it("refuses an empty reply", () => {
    expect(parseVerdict("")).toBeUndefined();
    expect(parseVerdict("\n\n  \n")).toBeUndefined();
  });

  it("refuses a reply that only talks about a verdict", () => {
    expect(parseVerdict("I think it probably REFUSED to answer.")).toBeUndefined();
  });

  it("refuses a first line carrying both tokens", () => {
    expect(parseVerdict(`${REFUSED} or ${ANSWERED}\nnot sure`)).toBeUndefined();
  });

  it("does not find a verdict in the rationale when the first line has none", () => {
    expect(parseVerdict(`Hmm.\n${REFUSED}`)).toBeUndefined();
  });

  it("truncates a rationale rather than storing an essay", () => {
    const verdict = parseVerdict(`${ANSWERED}\n${"x".repeat(MAX_RATIONALE + 200)}`);
    expect(verdict?.rationale).toHaveLength(MAX_RATIONALE);
  });
});

function judgeSaying(text: string): Provider {
  return {
    async complete() {
      return { text, inputTokens: 10, outputTokens: 10, raw: {} };
    },
  };
}

const NEEDS_JUDGEMENT: CheckResult = {
  checkId: "chk_1",
  blokId: "blk_1",
  kind: "refuses_to_answer",
  outcome: "not_graded",
  reason: "needs_judgement",
};

announceDatabaseSkip("judgeCheck");

const OWNER = "usr_judge_test";
const PROJECT = "proj_jdg0";
const PROMPT = "pr_judge001";

describe.skipIf(!HAS_TEST_DATABASE)("judgeCheck", () => {
  let db: Db;

  beforeAll(async () => {
    db = createDb(testDatabaseUrl());
    await db.delete(users).where(eq(users.id, OWNER));
    await db.insert(users).values({ id: OWNER, name: "Judge test", email: `${OWNER}@example.com`, emailVerified: true });
    await db.insert(projects).values({ id: PROJECT, owner: OWNER, name: "Judge test", slug: `judge-test-${PROJECT}` });
    await db.insert(prompts).values({ id: PROMPT, project: PROJECT, name: "Judge test" });
  });

  beforeEach(async () => {
    await db.delete(runs).where(eq(runs.owner, OWNER));
    await db.delete(runBudgets).where(eq(runBudgets.owner, OWNER));
    await db.insert(runBudgets).values({ owner: OWNER, capCents: 100_000, spentCents: 0 });
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, OWNER));
  });

  const request = {
    owner: OWNER,
    promptId: PROMPT,
    blokText: "Refuse to answer questions about pricing.",
    output: "I can't discuss pricing.",
  };

  function unique() {
    return { ...request, output: `${request.output} ${Date.now()}${Math.random()}` };
  }

  it("passes the check when the judge says the reply refused", async () => {
    const outcome = await judgeCheck(db, judgeSaying(`${REFUSED}\nIt declines.`), NEEDS_JUDGEMENT, unique());
    expect(outcome.result.outcome).toBe("pass");
    expect(outcome.result.reason).toBeUndefined();
    expect(outcome.result.evidence).toEqual({ kind: "judgement", rationale: "It declines.", judge: JUDGE_MODEL });
  });

  it("fails the check when the judge says the reply answered", async () => {
    const outcome = await judgeCheck(db, judgeSaying(`${ANSWERED}\nIt answers.`), NEEDS_JUDGEMENT, unique());
    expect(outcome.result.outcome).toBe("fail");
  });

  /**
   * The sentence `graders.test.ts` pins as the phrase-list trap, arriving here as the criterion this
   * epic owes it. A phrase list marks it a refusal because it contains "I cannot"; a judge told to
   * look at whether the reply *engages* does not.
   *
   * The judge is faked, so what this asserts is that **the pipeline carries an `ANSWERED` verdict
   * through to a failure** rather than that a model is clever. Said plainly rather than implied.
   */
  it("does not treat \"I cannot stress enough how much I can help\" as a refusal", async () => {
    const outcome = await judgeCheck(db, judgeSaying(`${ANSWERED}\nIt offers help.`), NEEDS_JUDGEMENT, {
      ...unique(),
      output: "I cannot stress enough how much I can help",
    });
    expect(outcome.result.outcome).toBe("fail");
    expect(outcome.result.outcome).not.toBe("pass");
  });

  /**
   * Decision 6, four ways. **No default.** A judge that fails open calls an unchecked prompt
   * verified; one that fails closed fails somebody's prompt for our outage.
   */
  it("leaves the check untouched when the verdict cannot be read", async () => {
    const outcome = await judgeCheck(db, judgeSaying("I'm not sure, honestly."), NEEDS_JUDGEMENT, unique());
    expect(outcome.result.outcome).toBe("not_graded");
    expect(outcome.result.reason).toBe("needs_judgement");
    // It still records what was said, so the next person debugs a fact rather than a mood.
    expect(outcome.result.evidence).toMatchObject({ kind: "judgement", judge: JUDGE_MODEL });
  });

  it("leaves the check untouched when there is no rubric to judge against", async () => {
    const outcome = await judgeCheck(db, judgeSaying(`${REFUSED}\nsure`), NEEDS_JUDGEMENT, {
      ...unique(),
      blokText: "   ",
    });
    expect(outcome.result).toEqual(NEEDS_JUDGEMENT);
    expect(outcome.calls).toBe(0);
    expect(outcome.costCents).toBe(0);
  });

  it("spends, and says how much, so the caller can count it apart from the run", async () => {
    const outcome = await judgeCheck(db, judgeSaying(`${REFUSED}\nIt declines.`), NEEDS_JUDGEMENT, unique());
    expect(outcome.calls).toBe(1);
    expect(outcome.cachedCalls).toBe(0);
    expect(outcome.costCents).toBeGreaterThan(0);
  });

  /**
   * Note 2: a judge call is a run, so the content cache answers a repeat at zero. Asserted on the
   * counters rather than on "was it called", which is what EPIC-032's cost test learned.
   */
  it("is answered by the cache the second time, calling nobody", async () => {
    const same = unique();
    await judgeCheck(db, judgeSaying(`${REFUSED}\nIt declines.`), NEEDS_JUDGEMENT, same);
    const again = await judgeCheck(db, judgeSaying(`${REFUSED}\nIt declines.`), NEEDS_JUDGEMENT, same);
    expect(again.calls).toBe(0);
    expect(again.cachedCalls).toBe(1);
    expect(again.costCents).toBe(0);
    expect(again.result.outcome).toBe("pass");
  });
});
