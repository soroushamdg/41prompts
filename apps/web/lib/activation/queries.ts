import type { SuiteRunRow } from "@41prompts/db";
import { EXAMPLE_PROMPT_NAME } from "./example";
import { activationSteps, runFacts, type ActivationStep } from "./progress";

/**
 * The activation steps for a prompt, or `undefined` if this is not the example.
 *
 * **Recognised by name**, which is the cheapest honest test available and deliberately not a stored
 * flag: a column marking a prompt "the example" would be a third thing to keep true, and a person
 * who renames their example has plainly stopped treating it as one — at which point the checklist
 * going away is the right behaviour rather than a bug.
 *
 * **Pure, and given its counts rather than fetching them.** The first version read the results of
 * every run in the history one run at a time, which is a query per row on a page that already knew
 * how to ask once. The caller now asks once (`resultCountsFor`) and shares the answer with the run
 * history, which needs exactly the same fact for its icons.
 *
 * "Passed" is `failed === 0 && total > 0`, never `state === "done"`. A run that graded nothing is
 * not an activation, and a metric that counted one would be wrong in the direction that flatters us.
 */
export function activationStateFor(
  promptName: string,
  runs: readonly Pick<SuiteRunRow, "id" | "state">[],
  counts: ReadonlyMap<string, { total: number; failed: number }>
): readonly ActivationStep[] | undefined {
  if (promptName !== EXAMPLE_PROMPT_NAME) return undefined;

  const noFailures = runs.map((run) => {
    const count = counts.get(run.id);
    return count !== undefined && count.total > 0 && count.failed === 0;
  });

  return activationSteps({ hasExample: true, ...runFacts(runs, noFailures) });
}

export { EXAMPLE_PROMPT_NAME };
