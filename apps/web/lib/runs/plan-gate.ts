import { planUsageFor, type Db, type PlanUsage } from "@41prompts/db";

/**
 * The run-count limit a plan buys, refused **in words, before a run exists** (EPIC-070, ADR-007 §2).
 *
 * ## Why the gate is at trigger and not in the worker
 *
 * `run_budgets`' cents cap is enforced in the worker, where the cost of a provider call becomes
 * known. **This one cannot be**, and the reason is arithmetic rather than taste: a run is counted
 * by its `suite_runs` row, and that row is written at trigger. A gate in the worker would let the
 * row be created, refuse it, and leave it counted — so the run that was refused would itself
 * consume the quota it was refused for. On a 50-run plan that is a customer who can trigger 50
 * refusals and then nothing.
 *
 * So the check happens **before `createSuiteRun`**, and the refusal is an `ActionResult.message`
 * the page already renders rather than a row state nobody sees.
 *
 * ## Two limits, two different sentences
 *
 * A customer at their run limit and a customer at their spend cap are in different situations with
 * different fixes, and telling them apart is the whole point of refusing in words. This module
 * writes the first; `apps/worker/src/budgets` writes the second. Neither says "over budget".
 */

/** Plan keys as a person reads them. Not derived from the key: "pro" is not a word on a page. */
const PLAN_TITLES: Readonly<Record<string, string>> = {
  free: "Free",
  pro: "Pro",
  team: "Team",
};

export function planTitle(key: string): string {
  return PLAN_TITLES[key] ?? key;
}

/**
 * When the period rolls over, as a person reads it.
 *
 * UTC, because the period boundary is UTC — showing it in the reader's local zone would put a date
 * on the page that is off by one for anybody west of Greenwich on the last day of a period, which
 * is exactly when somebody is looking at this sentence.
 */
export function periodResetWords(end: Date): string {
  return end.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
}

/**
 * The sentence to show, or `undefined` when there is room for another run.
 *
 * It names **the count, the plan and the reset date**, because the epic's criterion is a refusal
 * "in words that name the budget and the plan" and because those three are what somebody needs to
 * decide between waiting and upgrading.
 */
export function runLimitWords(usage: PlanUsage, needed = 1): string | undefined {
  if (usage.runsRemaining >= needed) return undefined;

  const limit = usage.plan.monthlyRunLimit;
  const plan = planTitle(usage.plan.key);
  const resets = periodResetWords(usage.period.end);

  // **`needed > 1` gets its own sentence**, because "Compare across providers" starts one run per
  // provider and a customer with two left and three providers is not out of runs — they are out of
  // *room for this action*. Telling them they have used all of them would be false, and they would
  // read it on a page that has just shown them a number greater than zero.
  if (needed > 1) {
    const left = usage.runsRemaining;
    return `This starts ${needed} runs and you have ${left === 0 ? "none" : left} left of the ${limit} on the ${plan} plan this period. It starts again on ${resets}.`;
  }

  const noun = limit === 1 ? "run" : "runs";
  return `You have used all ${limit} ${noun} on the ${plan} plan for this period. It starts again on ${resets}.`;
}

/**
 * The same check against the database. `undefined` means the run may go ahead.
 *
 * `needed` is how many `suite_runs` rows the action is about to write — one for a run, one per
 * provider for a comparison. Checking for 1 and then writing 3 is how a limit is exceeded by an
 * action that passed its own gate.
 */
export async function runLimitRefusal(
  db: Db,
  owner: string,
  needed = 1,
  now: Date = new Date()
): Promise<string | undefined> {
  return runLimitWords(await planUsageFor(db, owner, now), needed);
}
