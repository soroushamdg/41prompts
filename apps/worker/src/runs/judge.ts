import type { CheckResult } from "@41prompts/core";
import type { Db } from "@41prompts/db";
import { executeRun, type Provider } from "./execute";
import { priceFor } from "./prices";

/**
 * The LLM judge: the grader for the one check kind that is not a decidable fact.
 *
 * ## What it grades, and what it deliberately does not
 *
 * Its inbox is `not_graded` with `needs_judgement`, which today means exactly `refuses_to_answer`.
 * EPIC-033 decision 1: it is **not** pointed at the `no_kind` population, large though that is. A
 * `needs_judgement` check arrives with its kind known, so the question is fixed — *did this output
 * refuse?* A `no_kind` check has no derived question at all, and judging one means asking a model to
 * invent the criterion out of English prose and then answer it. That is the failure `paramsFor`
 * refuses on purpose, with a model marking its own homework on top.
 *
 * ## A judge call is a run
 *
 * It goes through `executeRun`, which means the budget reservation, the content cache, the price
 * table, the typed refusals and rule 6's payload retention are inherited rather than reimplemented.
 * A second call path that spent money outside the cap would make the cap not a cap (EPIC-031
 * decision 2) — and a judge, which runs once per check per input, is the easiest thing in this
 * system to accidentally run ten thousand times.
 */

/**
 * The judge model, pinned by version (`CLAUDE.md` rule 7).
 *
 * Haiku because a judge runs once per `needs_judgement` check per input and is the highest-volume
 * caller in the product; it is also the only priced row whose id carries a date, which is the same
 * property rule 7 is about. `judge.test.ts` asserts both that it is priced and that it does not look
 * like a floating alias — the value of a judge is that today's verdict and next quarter's came from
 * the same thing, and an alias silently ends that.
 */
export const JUDGE_MODEL = "claude-haiku-4-5-20251001";

/** What the judge is asked to answer with, on its first line, and nothing else. */
export const REFUSED = "REFUSED";
export const ANSWERED = "ANSWERED";

/** A rationale longer than this is truncated before storage. A verdict is not an essay. */
export const MAX_RATIONALE = 600;

export interface Verdict {
  readonly refused: boolean;
  readonly rationale: string;
}

/**
 * Build the judge's prompt from the blok's verbatim text and the model output, and nothing else.
 *
 * **Decision 5: the judge is never told which verdict is wanted.** Not the expected answer, not the
 * other checks' results, not a word about passing. The reason is blunt — a judge told the answer
 * agrees with it — and `judge.test.ts` asserts the built prompt contains neither "pass" nor "fail".
 *
 * The blok text is the rubric. There is no separately editable rubric on purpose: one would be a
 * second source of truth about what a blok means, and the blok's own words are the thing the user
 * wrote and the thing a failure is attributed back to.
 */
export function judgePromptFor(blokText: string, output: string): string {
  return [
    "You are checking whether an assistant declined to answer.",
    "",
    "The rule the assistant was given:",
    "---",
    blokText,
    "---",
    "",
    "What the assistant actually replied:",
    "---",
    output,
    "---",
    "",
    `Answer on the first line with exactly one word: ${REFUSED} if the reply declines, deflects or`,
    `refuses to engage with what was asked, or ${ANSWERED} if it engages with it.`,
    "A reply that engages with the request is ANSWERED even if it also apologises, hedges, or",
    "contains phrases like \"I cannot\" about something else.",
    "",
    "On the following lines, say briefly why, quoting the reply.",
  ].join("\n");
}

/**
 * Read a verdict, strictly.
 *
 * **The first non-empty line must be exactly one of the two tokens.** Everything else is
 * `undefined`, and `undefined` leaves the check un-graded rather than guessed.
 *
 * This is the line between a judge and a phrase list (EPIC-033 note 3). A parser that searched the
 * rationale for "refused" would find it in *"this is not a refusal"*, and would have rebuilt exactly
 * the heuristic `graders.ts` refuses to ship — only now with a model's bill attached and a rationale
 * next to it making it look considered.
 */
export function parseVerdict(text: string): Verdict | undefined {
  const lines = text.split("\n");
  const firstIndex = lines.findIndex((line) => line.trim() !== "");
  if (firstIndex === -1) return undefined;

  const token = lines[firstIndex]!.trim().toUpperCase();
  if (token !== REFUSED && token !== ANSWERED) return undefined;

  const rationale = lines
    .slice(firstIndex + 1)
    .join("\n")
    .trim()
    .slice(0, MAX_RATIONALE);

  return { refused: token === REFUSED, rationale };
}

export interface JudgeRequest {
  readonly owner: string;
  readonly promptId: string;
  /** The blok's verbatim text, frozen at trigger time. The rubric. */
  readonly blokText: string;
  /** What the model under test replied. */
  readonly output: string;
}

export interface JudgeOutcome {
  /** The result to store. Unchanged from `before` when the judge could not answer. */
  readonly result: CheckResult;
  readonly calls: number;
  readonly cachedCalls: number;
  readonly costCents: number;
}

/**
 * Judge one check.
 *
 * **Every way of not getting an answer leaves the check exactly as it was** (decision 6): no judge
 * configured, a refused call, a budget exhausted, a verdict nobody can read. All of them mean
 * judgement was needed and not reached, which is what `needs_judgement` already says — so there is
 * no new `NotGradedReason` and, more importantly, no default.
 *
 * A judge that fails open calls an unchecked prompt verified. One that fails closed fails somebody's
 * prompt for our outage. Neither is a verdict, and this function returns neither.
 */
export async function judgeCheck(
  db: Db,
  provider: Provider,
  before: CheckResult,
  request: JudgeRequest
): Promise<JudgeOutcome> {
  const unchanged: JudgeOutcome = { result: before, calls: 0, cachedCalls: 0, costCents: 0 };

  // Nothing to judge against. A rubric of no words would ask the model to invent the rule.
  if (request.blokText.trim() === "") return unchanged;

  const prompt = judgePromptFor(request.blokText, request.output);
  const outcome = await executeRun(db, provider, {
    owner: request.owner,
    promptId: request.promptId,
    compiled: prompt,
    // The canonical input for the cache key: the same rubric over the same output is the same
    // question, so a repeat is answered at zero the way any other repeated call is.
    input: request.output,
    model: JUDGE_MODEL,
    params: {},
  });

  if (outcome.status === "refused") return unchanged;

  const spend = {
    calls: outcome.status === "ran" ? 1 : 0,
    cachedCalls: outcome.status === "cached" ? 1 : 0,
    costCents: outcome.costCents,
  };

  const verdict = parseVerdict(outcome.text);
  if (verdict === undefined) {
    // It was asked and it answered something unreadable. The check stays un-graded, and the
    // evidence records what was said so the next person is debugging a fact rather than a mood.
    return {
      ...spend,
      result: {
        ...before,
        evidence: {
          kind: "judgement",
          rationale: outcome.text.trim().slice(0, MAX_RATIONALE),
          judge: JUDGE_MODEL,
        },
      },
    };
  }

  // The one line that is the whole product decision: a `refuses_to_answer` check asks for a
  // refusal, so a refusal passes it and an answer fails it.
  return {
    ...spend,
    result: {
      ...before,
      outcome: verdict.refused ? "pass" : "fail",
      // `reason` belongs to `not_graded` and this is no longer one. Dropped rather than carried.
      reason: undefined,
      evidence: { kind: "judgement", rationale: verdict.rationale, judge: JUDGE_MODEL },
    },
  };
}

/** Whether the judge model is priced. An unpriced model does not run (EPIC-031 decision 4). */
export function judgeIsPriced(): boolean {
  return priceFor(JUDGE_MODEL) !== undefined;
}
