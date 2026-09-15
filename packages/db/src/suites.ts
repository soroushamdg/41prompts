import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "./client";
import { inputSets, runs, suiteChecks, suiteResults, suiteRuns } from "./schema";

/**
 * Owner-scoped reads and writes for input sets and the runs over them (EPIC-032).
 *
 * Same rule as `canvas.ts` and `variables.ts`: **the caller has already resolved the prompt for
 * this owner** through `promptForOwner`, and every function here is scoped by `promptId` or by
 * `owner`, so a row is reachable only through something that resolved. A miss returns `undefined`
 * and the route turns that into **404, not 403** — a 403 confirms the id exists.
 */

export interface InputSetRow {
  id: string;
  name: string;
  columns: string[];
  rowCount: number;
  createdAt: Date;
}

export interface InputSetWithRows extends InputSetRow {
  rows: string[][];
}

export type SuiteRunState = "queued" | "running" | "done" | "refused";

export interface SuiteRunRow {
  id: string;
  owner: string;
  prompt: string;
  inputSet: string;
  model: string;
  params: Record<string, unknown>;
  promptHash: string;
  promptText: string;
  state: string;
  refusalReason: string | null;
  totalInputs: number;
  completedInputs: number;
  calls: number;
  cachedCalls: number;
  costCents: number;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export interface SuiteCheckRow {
  id: string;
  checkId: string;
  blokId: string;
  blokKind: string;
  blokText: string;
  kind: string | null;
  position: number;
}

export interface SuiteResultRow {
  id: string;
  suiteCheck: string;
  inputIndex: number;
  run: string | null;
  outcome: string;
  reason: string | null;
  evidence: unknown;
}

const INPUT_SET_COLUMNS = {
  id: inputSets.id,
  name: inputSets.name,
  columns: inputSets.columns,
  rowCount: inputSets.rowCount,
  createdAt: inputSets.createdAt,
};

/** This prompt's input sets, newest first. The rows blob is deliberately not read here. */
export async function inputSetsForPrompt(db: Db, promptId: string): Promise<InputSetRow[]> {
  const rows = await db
    .select(INPUT_SET_COLUMNS)
    .from(inputSets)
    .where(and(eq(inputSets.prompt, promptId), isNull(inputSets.deletedAt)))
    .orderBy(desc(inputSets.createdAt));
  return rows.map((row) => ({ ...row, columns: row.columns as string[] }));
}

/**
 * One input set **with** its rows, scoped by prompt.
 *
 * Takes `promptId` as well as the id for the same reason every function in `canvas.ts` does: an id
 * on its own would be reachable by anyone who guessed it, and the scoping is then a check somebody
 * has to remember rather than a shape that cannot be got wrong.
 */
export async function inputSetForPrompt(
  db: Db,
  promptId: string,
  inputSetId: string,
): Promise<InputSetWithRows | undefined> {
  const [row] = await db
    .select({ ...INPUT_SET_COLUMNS, rows: inputSets.rows })
    .from(inputSets)
    .where(and(eq(inputSets.id, inputSetId), eq(inputSets.prompt, promptId), isNull(inputSets.deletedAt)))
    .limit(1);
  if (row === undefined) return undefined;
  return { ...row, columns: row.columns as string[], rows: row.rows as string[][] };
}

/** One INSERT. The rows go in exactly as parsed — no trim, no normalisation, like every write here. */
export async function addInputSet(
  db: Db,
  promptId: string,
  set: { name: string; columns: readonly string[]; rows: readonly (readonly string[])[] },
): Promise<InputSetRow> {
  const [row] = await db
    .insert(inputSets)
    .values({
      prompt: promptId,
      name: set.name,
      columns: set.columns as string[],
      rows: set.rows as string[][],
      rowCount: set.rows.length,
    })
    .returning(INPUT_SET_COLUMNS);
  return { ...row!, columns: row!.columns as string[] };
}

/** Soft delete: a removed set is still what some run in the history ran against. */
export async function removeInputSet(db: Db, promptId: string, inputSetId: string): Promise<void> {
  await db
    .update(inputSets)
    .set({ deletedAt: new Date() })
    .where(and(eq(inputSets.id, inputSetId), eq(inputSets.prompt, promptId)));
}

/**
 * Create a run and freeze its checks, in one transaction.
 *
 * **The two writes are one decision.** A run whose checks were written separately could exist with
 * none — and a run with no checks is indistinguishable, on the page, from a prompt that asserts
 * nothing. The transaction is what makes that state unreachable rather than unlikely.
 */
export async function createSuiteRun(
  db: Db,
  run: {
    owner: string;
    prompt: string;
    inputSet: string;
    model: string;
    params: Record<string, unknown>;
    promptHash: string;
    promptText: string;
    totalInputs: number;
  },
  checks: readonly { checkId: string; blokId: string; blokKind: string; blokText: string; kind?: string }[],
): Promise<string> {
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(suiteRuns).values(run).returning({ id: suiteRuns.id });
    const id = row!.id;
    if (checks.length > 0) {
      await tx.insert(suiteChecks).values(
        checks.map((check, position) => ({
          suiteRun: id,
          checkId: check.checkId,
          blokId: check.blokId,
          blokKind: check.blokKind,
          blokText: check.blokText,
          kind: check.kind ?? null,
          position,
        })),
      );
    }
    return id;
  });
}

/** This prompt's runs, newest first. The run history. */
export async function suiteRunsForPrompt(db: Db, promptId: string, limit = 30): Promise<SuiteRunRow[]> {
  const rows = await db
    .select()
    .from(suiteRuns)
    .where(eq(suiteRuns.prompt, promptId))
    .orderBy(desc(suiteRuns.createdAt))
    .limit(limit);
  return rows.map(asSuiteRunRow);
}

/** One run, scoped by owner. `undefined` is a 404. */
export async function suiteRunForOwner(db: Db, suiteRunId: string, owner: string): Promise<SuiteRunRow | undefined> {
  const [row] = await db
    .select()
    .from(suiteRuns)
    .where(and(eq(suiteRuns.id, suiteRunId), eq(suiteRuns.owner, owner)))
    .limit(1);
  return row === undefined ? undefined : asSuiteRunRow(row);
}

/** One run by id alone — for the worker, which has no session and owns the job it was handed. */
export async function suiteRunById(db: Db, suiteRunId: string): Promise<SuiteRunRow | undefined> {
  const [row] = await db.select().from(suiteRuns).where(eq(suiteRuns.id, suiteRunId)).limit(1);
  return row === undefined ? undefined : asSuiteRunRow(row);
}

function asSuiteRunRow(row: typeof suiteRuns.$inferSelect): SuiteRunRow {
  return { ...row, params: row.params as Record<string, unknown> };
}

/** The frozen checks for a run, in compiled order. */
export async function suiteChecksFor(db: Db, suiteRunId: string): Promise<SuiteCheckRow[]> {
  return db
    .select({
      id: suiteChecks.id,
      checkId: suiteChecks.checkId,
      blokId: suiteChecks.blokId,
      blokKind: suiteChecks.blokKind,
      blokText: suiteChecks.blokText,
      kind: suiteChecks.kind,
      position: suiteChecks.position,
    })
    .from(suiteChecks)
    .where(eq(suiteChecks.suiteRun, suiteRunId))
    .orderBy(asc(suiteChecks.position));
}

/** Every graded result for a run, in input order within each check. */
export async function suiteResultsFor(db: Db, suiteRunId: string): Promise<SuiteResultRow[]> {
  return db
    .select({
      id: suiteResults.id,
      suiteCheck: suiteResults.suiteCheck,
      inputIndex: suiteResults.inputIndex,
      run: suiteResults.run,
      outcome: suiteResults.outcome,
      reason: suiteResults.reason,
      evidence: suiteResults.evidence,
    })
    .from(suiteResults)
    .where(eq(suiteResults.suiteRun, suiteRunId))
    .orderBy(asc(suiteResults.inputIndex));
}

export async function addSuiteResults(
  db: Db,
  suiteRunId: string,
  results: readonly {
    suiteCheck: string;
    inputIndex: number;
    run: string | null;
    outcome: string;
    reason?: string;
    evidence?: unknown;
  }[],
): Promise<void> {
  if (results.length === 0) return;
  await db.insert(suiteResults).values(
    results.map((result) => ({
      suiteRun: suiteRunId,
      suiteCheck: result.suiteCheck,
      inputIndex: result.inputIndex,
      run: result.run,
      outcome: result.outcome,
      reason: result.reason ?? null,
      evidence: result.evidence ?? null,
    })),
  );
}

export async function setSuiteRunState(
  db: Db,
  suiteRunId: string,
  patch: {
    state?: SuiteRunState;
    refusalReason?: string | null;
    startedAt?: Date;
    finishedAt?: Date;
  },
): Promise<void> {
  await db.update(suiteRuns).set(patch).where(eq(suiteRuns.id, suiteRunId));
}

/**
 * Record what one input cost, as it happens.
 *
 * **Incremented in SQL, not read-modify-written**, so the counters cannot lose an update — and so
 * the page polling them sees the run advance rather than jump from 0 to done.
 */
export async function recordSuiteProgress(
  db: Db,
  suiteRunId: string,
  delta: { calls: number; cachedCalls: number; costCents: number },
): Promise<void> {
  await db
    .update(suiteRuns)
    .set({
      completedInputs: sql`${suiteRuns.completedInputs} + 1`,
      calls: sql`${suiteRuns.calls} + ${delta.calls}`,
      cachedCalls: sql`${suiteRuns.cachedCalls} + ${delta.cachedCalls}`,
      costCents: sql`${suiteRuns.costCents} + ${delta.costCents}`,
    })
    .where(eq(suiteRuns.id, suiteRunId));
}

/**
 * The model output behind one result, read from the `runs` row rather than from a second copy.
 *
 * Rule 6's payload is the only copy, so the twelve-month purge stays the only clock on it.
 * `undefined` means the row is gone or its payload has been purged, and the surface says so rather
 * than showing an empty box.
 */
export async function outputForRun(db: Db, runId: string, owner: string): Promise<string | undefined> {
  const [row] = await db
    .select({ payload: runs.payload })
    .from(runs)
    .where(and(eq(runs.id, runId), eq(runs.owner, owner)))
    .limit(1);
  const payload = row?.payload as { text?: string } | undefined;
  return typeof payload?.text === "string" ? payload.text : undefined;
}
