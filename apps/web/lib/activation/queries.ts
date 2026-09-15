import { summarise, type CheckResult } from "@41prompts/core";
import { suiteResultsFor, suiteRunsForPrompt, type Db } from "@41prompts/db";
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
 * The run facts are read from the stored results through EPIC-030's `summarise`, so "passed" means
 * `noFailures` and never "the run finished". A run that graded nothing is not an activation, and a
 * metric that counted one would be wrong in the direction that flatters us.
 */
export async function activationStateFor(
  db: Db,
  promptId: string,
  owner: string,
  promptName: string
): Promise<readonly ActivationStep[] | undefined> {
  if (promptName !== EXAMPLE_PROMPT_NAME) return undefined;

  const runs = await suiteRunsForPrompt(db, promptId);
  const noFailures: boolean[] = [];
  for (const run of runs) {
    if (run.state !== "done") {
      noFailures.push(false);
      continue;
    }
    const results = await suiteResultsFor(db, run.id);
    noFailures.push(summarise(results.map(asCheckResult)).noFailures && results.length > 0);
  }

  return activationSteps({ hasExample: true, ...runFacts(runs, noFailures) });
}

/** The stored row, back in the shape `summarise` counts. Only the outcome is read. */
function asCheckResult(row: { outcome: string }): CheckResult {
  return { outcome: row.outcome } as CheckResult;
}

export { EXAMPLE_PROMPT_NAME };
