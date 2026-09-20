import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db, DbOrTx } from "./client";
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
  /** The judge's own three, never folded into the three above (EPIC-033 decision 4). */
  judgeCalls: number;
  judgeCachedCalls: number;
  judgeCostCents: number;
  passedNotifiedAt: Date | null;
  /** The version this run was pinned to (EPIC-040), or null for a run that predates versions. */
  version: string | null;
  /** The A/B this run is half of (EPIC-041), or null. Its partner carries the same value. */
  comparison: string | null;
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
  db: DbOrTx,
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

/**
 * How many runs reference each of these input sets (EPIC-032a).
 *
 * **One query for the whole list, not one per row** — the same rule `resultCountsFor` below is
 * shaped by, and the reason `runsPageFor` can render a page of sets without N+1.
 *
 * ## What the number decides
 *
 * Whether a set may be edited in place. A `suite_run` freezes its compiled prompt onto its own row
 * but **not its inputs** — it keeps `input_set` as a foreign key and the detail page reads the rows
 * live through `inputSetForPrompt`. So editing a set that has been run would change what a finished
 * run appears to have run against, silently and with nothing to notice it. EPIC-032a decision 3:
 * a set with no runs is editable, a set with runs is duplicated instead.
 *
 * Sets with no runs are **absent from the map rather than present as 0**, which is what `?? 0` at
 * every call site is for. Returning a dense map would mean this function had to be told the full
 * list twice — once to query and once to pad.
 */
export async function runCountsForInputSets(
  db: Db,
  inputSetIds: readonly string[],
): Promise<Map<string, number>> {
  if (inputSetIds.length === 0) return new Map();
  const rows = await db
    .select({ inputSet: suiteRuns.inputSet, n: sql<number>`count(*)::int` })
    .from(suiteRuns)
    .where(inArray(suiteRuns.inputSet, inputSetIds as string[]))
    .groupBy(suiteRuns.inputSet);
  return new Map(rows.map((row) => [row.inputSet, row.n]));
}

/**
 * Replace a set's rows in place (EPIC-032a).
 *
 * **The caller has already established that no run references this set.** That check is not made
 * here on purpose: this module's functions are scoped by prompt and owner, and a rule about what a
 * *run* has done belongs with the action that knows why it matters — `apps/web/lib/runs/actions.ts`,
 * where the refusal message is written. Putting it here would put half of decision 3 in a place with
 * no way to say why.
 *
 * `columns` is not a parameter. The columns are the prompt's declared variables and the Variables
 * tab is where those change; letting an edit rewrite them would let a set drift away from the
 * prompt it belongs to without either surface noticing.
 */
export async function replaceInputSetRows(
  db: Db,
  promptId: string,
  inputSetId: string,
  next: { name: string; rows: readonly (readonly string[])[] },
): Promise<void> {
  await db
    .update(inputSets)
    .set({ name: next.name, rows: next.rows as string[][], rowCount: next.rows.length })
    .where(and(eq(inputSets.id, inputSetId), eq(inputSets.prompt, promptId), isNull(inputSets.deletedAt)));
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
    /** The version this run was triggered against (EPIC-040). Absent for a prompt with no versions. */
    version?: string;
    /** The A/B both runs of a comparison share (EPIC-041). Absent for an ordinary run. */
    comparison?: string;
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

/**
 * Both runs of one A/B, oldest first, scoped by owner (EPIC-041).
 *
 * Two rows is what a comparison is: there is no `comparisons` table, because the relationship has no
 * attributes beyond the rows that already carry the version, the input set and the results.
 *
 * **Owner-scoped like every other read here**, even though the caller reached this id through a run
 * that already resolved: a `comparison` is written on a row, and a read that trusts a resolution done
 * two calls ago is the shape of a leak nobody notices until it is one.
 */
export async function comparisonRuns(db: Db, comparison: string, owner: string): Promise<SuiteRunRow[]> {
  const rows = await db
    .select()
    .from(suiteRuns)
    .where(and(eq(suiteRuns.comparison, comparison), eq(suiteRuns.owner, owner)))
    .orderBy(asc(suiteRuns.createdAt));
  return rows.map(asSuiteRunRow);
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
  delta: {
    calls: number;
    cachedCalls: number;
    costCents: number;
    judgeCalls?: number;
    judgeCachedCalls?: number;
    judgeCostCents?: number;
  },
): Promise<void> {
  await db
    .update(suiteRuns)
    .set({
      completedInputs: sql`${suiteRuns.completedInputs} + 1`,
      calls: sql`${suiteRuns.calls} + ${delta.calls}`,
      cachedCalls: sql`${suiteRuns.cachedCalls} + ${delta.cachedCalls}`,
      costCents: sql`${suiteRuns.costCents} + ${delta.costCents}`,
      // The judge's three move independently of the three above (EPIC-033 decision 4). Defaulted to
      // zero rather than made required, so every existing caller stays correct without edit.
      judgeCalls: sql`${suiteRuns.judgeCalls} + ${delta.judgeCalls ?? 0}`,
      judgeCachedCalls: sql`${suiteRuns.judgeCachedCalls} + ${delta.judgeCachedCalls ?? 0}`,
      judgeCostCents: sql`${suiteRuns.judgeCostCents} + ${delta.judgeCostCents ?? 0}`,
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

/**
 * Claim the right to send this run's `run_passed` event. True exactly once, ever.
 *
 * ## Why a conditional UPDATE rather than a read and then a write
 *
 * The obvious version — read `passedNotifiedAt`, and if it is null send the event and write the
 * timestamp — has a race between the read and the write that two open tabs will find immediately,
 * and two web containers will find constantly. `update … where passed_notified_at is null
 * returning id` resolves it in the database: both statements run, one returns a row, and the loser
 * returns nothing and sends nothing.
 *
 * ## Why the event is sent from the web at all
 *
 * The worker finishes the run, which is the natural place. It cannot send it: `captureAccountEvent`
 * is built on Next's request context — it reads the consent cookie, `DNT` and `Sec-GPC` from the
 * incoming request — and the worker has no request. Sending from the first render of a finished,
 * passing run is also the more honest instant for what this measures: the moment the person could
 * *see* that they had passed, which is what the five minutes is about.
 */
export async function claimPassedNotification(db: Db, suiteRunId: string, owner: string, at: Date): Promise<boolean> {
  const claimed = await db
    .update(suiteRuns)
    .set({ passedNotifiedAt: at })
    .where(and(eq(suiteRuns.id, suiteRunId), eq(suiteRuns.owner, owner), isNull(suiteRuns.passedNotifiedAt)))
    .returning({ id: suiteRuns.id });
  return claimed.length > 0;
}

/**
 * How many results each of these runs has, and how many of them failed. **One query, not N.**
 *
 * The run history needs to know whether a finished run actually passed, and so does the activation
 * indicator. Both previously asked per run, which is a query per row of a list that holds thirty —
 * and the naive version of this function is exactly that loop with a nicer name.
 *
 * A run with `total: 0` graded nothing. That is **not** a pass, and the callers are written so that
 * it cannot be mistaken for one: EPIC-030 deleted `passed` from `RunSummary` so nobody could read a
 * single boolean as the answer, and the same care applies to a list row's icon.
 */
export async function resultCountsFor(
  db: Db,
  suiteRunIds: readonly string[],
): Promise<Map<string, { total: number; failed: number }>> {
  if (suiteRunIds.length === 0) return new Map();

  const rows = await db
    .select({
      suiteRun: suiteChecks.suiteRun,
      total: sql<number>`count(*)::int`,
      failed: sql<number>`count(*) filter (where ${suiteResults.outcome} = 'fail')::int`,
    })
    .from(suiteResults)
    .innerJoin(suiteChecks, eq(suiteResults.suiteCheck, suiteChecks.id))
    .where(inArray(suiteChecks.suiteRun, suiteRunIds as string[]))
    .groupBy(suiteChecks.suiteRun);

  return new Map(rows.map((row) => [row.suiteRun, { total: row.total, failed: row.failed }]));
}

/**
 * The newest finished run of one version **on one model** (EPIC-051's publish gate).
 *
 * The model is part of the question and not a detail: `CLAUDE.md` rule 9 blocks publishing when
 * checks fail *on the target model*, so a run that passed on Claude says nothing about publishing
 * against Gemini. A caller that filtered only by version would be answering a different question and
 * would pass the gate with evidence about a model nobody is publishing to.
 *
 * `state = 'done'` rather than "not refused": a run that is still going has results that will change.
 */
export async function newestFinishedRunFor(
  db: Db,
  where: { prompt: string; version: string; model: string },
): Promise<SuiteRunRow | undefined> {
  const [row] = await db
    .select()
    .from(suiteRuns)
    .where(
      and(
        eq(suiteRuns.prompt, where.prompt),
        eq(suiteRuns.version, where.version),
        eq(suiteRuns.model, where.model),
        eq(suiteRuns.state, "done"),
      ),
    )
    .orderBy(desc(suiteRuns.createdAt))
    .limit(1);
  return row === undefined ? undefined : asSuiteRunRow(row);
}

/**
 * How many checks a run had, and how each of its results came out.
 *
 * Three counts rather than two, because EPIC-030's third outcome is not a rounding error:
 * `not_graded` is "nobody can tell yet" and folding it into either of the others is the one thing
 * that whole epic refused to do. `resultCountsFor` above answers a list row's icon; this answers a
 * gate, which needs to tell "all six passed" from "four passed and two nobody could grade".
 */
export async function outcomeCountsFor(
  db: Db,
  suiteRunId: string,
): Promise<{ passed: number; failed: number; notGraded: number }> {
  const rows = await db
    .select({ outcome: suiteResults.outcome, n: sql<number>`count(*)::int` })
    .from(suiteResults)
    .where(eq(suiteResults.suiteRun, suiteRunId))
    .groupBy(suiteResults.outcome);

  const of = (outcome: string) => rows.find((row) => row.outcome === outcome)?.n ?? 0;
  return { passed: of("pass"), failed: of("fail"), notGraded: of("not_graded") };
}
