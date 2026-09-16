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
    // EPIC-041. The other runs of a comparison, so each can name what it is being compared with.
    run.comparison === null ? Promise.resolve([]) : comparisonRuns(db, run.comparison, owner),
  ]);

  /**
   * **The other runs, plural** (EPIC-042).
   *
   * EPIC-041 built `comparison` for an A/B of two versions, so this was `pair.find(...)` — one
   * partner. A run at every provider is the same column holding three or more rows, and a `find`
   * would have silently named one of them and dropped the rest. The A/B case is now the
   * one-element case of this rather than a shape of its own.
   */
  const partners = pair.filter((other) => other.id !== suiteRunId);

  return {
    run,
    checks,
    results,
    inputSet,
    versionsByN: new Map(versions.map((version) => [version.id, version.n])),
    partners,
  };
}

/**
 * Every run of one comparison, with its checks and results, in the order they were created.
 *
 * Read only when there is a comparison with more than one run in it, because it is N queries and a
 * run with no comparison is the ordinary case. Ordered by creation so the columns are stable
 * between reloads — a matrix whose columns move is one nobody can compare across two screenshots.
 */
export async function comparisonDetailFor(db: Db, comparison: string, owner: string) {
  const runs = await comparisonRuns(db, comparison, owner);
  const sorted = [...runs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return Promise.all(
    sorted.map(async (run) => ({
      run,
      checks: await suiteChecksFor(db, run.id),
      results: await suiteResultsFor(db, run.id),
    })),
  );
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
