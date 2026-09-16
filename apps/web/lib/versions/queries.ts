import { readSnapshot, type VersionSnapshot } from "@41prompts/core";
import {
  inputSetsForPrompt,
  passRateForVersions,
  promptForOwner,
  suiteRunsForPrompt,
  versionsForPrompt,
  type Db,
  type VersionPassRate,
  type VersionRow,
} from "@41prompts/db";

/**
 * Reads for the Versions page. **Every one takes an owner**, like every other query module here, and
 * a miss returns `undefined` which the route turns into **404, not 403** — a 403 confirms the id.
 */

/** How many versions the page will show. Nothing prunes, so this is a page size, not a retention rule. */
export const VERSIONS_SHOWN = 50;

export interface VersionsPage {
  prompt: { id: string; name: string; project: string };
  versions: VersionRow[];
  /** Keyed by version id. Absent means nothing has finished running against that version. */
  rates: Map<string, VersionPassRate>;
  /** Version ids with a run that has not finished — "running", which is not "no run yet". */
  running: Set<string>;
  inputSets: { id: string; name: string; rowCount: number }[];
  /** True when the history is longer than one page, so the page can say what it is not showing. */
  truncated: boolean;
}

export async function versionsPageFor(db: Db, promptId: string, owner: string): Promise<VersionsPage | undefined> {
  const prompt = await promptForOwner(db, promptId, owner);
  if (prompt === undefined) return undefined;

  // One more than the page size, so "there are more" is a fact rather than an inference from the
  // count happening to equal the limit.
  const rows = await versionsForPrompt(db, promptId, VERSIONS_SHOWN + 1);
  const versions = rows.slice(0, VERSIONS_SHOWN);

  const [rates, history, inputSets] = await Promise.all([
    passRateForVersions(db, versions.map((version) => version.id)),
    suiteRunsForPrompt(db, promptId),
    inputSetsForPrompt(db, promptId),
  ]);

  // A version whose only run is queued or running has no rate yet, and that is a different sentence
  // from "nothing has ever been run against this". Saying "no run yet" while one is in flight is the
  // kind of small lie that makes somebody press the button twice.
  const running = new Set(
    history
      .filter((run) => run.version !== null && (run.state === "queued" || run.state === "running"))
      .map((run) => run.version as string),
  );

  return {
    prompt,
    versions,
    rates,
    running,
    inputSets: inputSets.map((set) => ({ id: set.id, name: set.name, rowCount: set.rowCount })),
    truncated: rows.length > VERSIONS_SHOWN,
  };
}

/**
 * One version, scoped through its prompt's owner.
 *
 * `prompt_versions` has no owner column — ownership is the prompt's — so this resolves the prompt
 * first and then reads the version **within that prompt**. Reading the version by id alone and
 * checking its `prompt` afterwards would work too and is the shape that eventually forgets the
 * second half.
 */
export async function versionForOwner(
  db: Db,
  promptId: string,
  versionId: string,
  owner: string,
): Promise<VersionRow | undefined> {
  const prompt = await promptForOwner(db, promptId, owner);
  if (prompt === undefined) return undefined;
  const versions = await versionsForPrompt(db, promptId, VERSIONS_SHOWN + 1);
  return versions.find((version) => version.id === versionId);
}

/**
 * A stored version as the pair `diff()` takes, or `undefined` if the row cannot be read.
 *
 * `undefined` is a real outcome the page renders, not an error: `readSnapshot` refuses a shape it
 * does not recognise rather than repairing it, and a history that says "this version cannot be read"
 * is more honest than one that quietly diffs against a guess.
 */
export function snapshotOf(version: VersionRow): VersionSnapshot | undefined {
  return readSnapshot(version.snapshot, version.compiledText);
}
