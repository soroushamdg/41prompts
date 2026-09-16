import {
  inputSetForPrompt,
  inputSetsForPrompt,
  outputForRun,
  promptForOwner,
  suiteChecksFor,
  suiteResultsFor,
  suiteRunForOwner,
  suiteRunsForPrompt,
  variablesForPrompt,
  versionsForPrompt,
  comparisonRuns,
  type Db,
} from "@41prompts/db";
import { canvasForOwner, compiledForBloks } from "@/lib/canvas/queries";

/**
 * Reads for the runs routes. **Every one takes an owner**, and there is no variant that does not.
 *
 * The same shape `lib/canvas/queries.ts` established: resolve the prompt for this owner first, and
 * return `undefined` when it does not resolve, which the route turns into **404, not 403** — a 403
 * confirms the id is real.
 */

export async function runsPageFor(db: Db, promptId: string, owner: string) {
  const prompt = await promptForOwner(db, promptId, owner);
  if (prompt === undefined) return undefined;

  const [inputSets, declarations, history] = await Promise.all([
    inputSetsForPrompt(db, promptId),
    variablesForPrompt(db, promptId),
    suiteRunsForPrompt(db, promptId),
  ]);

  return { prompt, inputSets, declarations, history };
}

/**
 * The compiled prompt and its checks, as they stand **right now**.
 *
 * Read at trigger time and frozen onto the run, never read again while a run is in flight: an edit
 * made mid-run must not change what the later inputs receive. The canvas rows are read once and
 * compiled once here, for the same reason the prompt page reads them once — compilation and
 * variable extraction cannot agree if they are looking at two snapshots.
 */
export async function compiledNow(db: Db, promptId: string, owner: string) {
  const found = await canvasForOwner(db, promptId, owner);
  if (found === undefined) return undefined;
  const { compiled, bloks } = compiledForBloks(found.bloks);
  const kindById = new Map(bloks.map((blok) => [blok.id, blok.kind]));
  const textById = new Map(bloks.map((blok) => [blok.id, blok.text]));
  return { compiled, kindById, textById };
}

export async function runDetailFor(db: Db, suiteRunId: string, owner: string) {
  const run = await suiteRunForOwner(db, suiteRunId, owner);
  if (run === undefined) return undefined;

  const [checks, results, inputSet, versions, pair] = await Promise.all([
    suiteChecksFor(db, suiteRunId),
    suiteResultsFor(db, suiteRunId),
    inputSetForPrompt(db, run.prompt, run.inputSet),
    // For "Ran Draft vN": the page needs the ordinal, and the run row carries only the id.
    versionsForPrompt(db, run.prompt),
    // EPIC-041. The other half of an A/B, so each run can name the one it is being compared with.
    run.comparison === null ? Promise.resolve([]) : comparisonRuns(db, run.comparison, owner),
  ]);

  return {
    run,
    checks,
    results,
    inputSet,
    versionsByN: new Map(versions.map((version) => [version.id, version.n])),
    // The partner, never this run itself. A comparison is two rows and one of them is the one asked
    // about, so "the other" is the whole of what this is for.
    partner: pair.find((other) => other.id !== suiteRunId),
  };
}

/**
 * The model output behind one result, read through the owner.
 *
 * Scoped even though the run row was already resolved for this owner: the `runs` row is a different
 * table with its own owner column, and a read that trusts a resolution done three calls ago is the
 * shape of a leak that nobody notices until it is one.
 */
export async function outputFor(db: Db, runId: string, owner: string): Promise<string | undefined> {
  return outputForRun(db, runId, owner);
}
