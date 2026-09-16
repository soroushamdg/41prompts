import { bindVariables, gradeAll, serialiseRow, type Check, type CheckResult } from "@41prompts/core";
import {
  addSuiteResults,
  inputSetForPrompt,
  recordSuiteProgress,
  setSuiteRunState,
  suiteChecksFor,
  suiteRunById,
  variablesForPrompt,
  type Db,
  type SuiteCheckRow,
} from "@41prompts/db";
import { inBatches } from "./concurrency";
import { executeRun, type Provider, type RunRequest } from "./execute";
import { judgeCheck, JUDGE_MODEL } from "./judge";
import { concurrencyForModel } from "./prices";
import { providerForRun, type SelectedProvider, type SelectProvider } from "./provider";

/**
 * Run one triggered run: every input of one set, at one model, graded and stored.
 *
 * ## Why the checks come from the row and not from a recompile
 *
 * `suite_checks` was frozen when the run was triggered. Recompiling here would grade against
 * whatever the bloks say *now* — so a failure could be attributed to a blok that no longer says
 * that, which is worse than no attribution at all. Versions are EPIC-040's; not re-deriving is this
 * epic's, and this is where it is honoured.
 *
 * ## Progress is written as it happens
 *
 * The counters move after every input, because the page polls them. A job that reports only when it
 * finishes is a spinner with a database behind it.
 *
 * ## Stopping at the cap is not the same as being refused
 *
 * EPIC-031 decision 6 keeps what already ran. A run that completed forty of two hundred inputs and
 * then hit the budget is `done` **with a reason recorded** — calling it `refused` would discard a
 * true thing about forty inputs that were paid for and answered.
 *
 * ## The judge has its own provider, and that is new (EPIC-042)
 *
 * `JUDGE_MODEL` is a **pinned Anthropic model** (`CLAUDE.md` rule 7). Until this epic every run was
 * Anthropic's, so calling the judge through the run's own provider happened to work; with three
 * providers it would ask OpenAI for a Claude model. So two providers are resolved, one per model,
 * through the same selector — which also means the judge runs on the owner's own Anthropic key when
 * they have one, and its cost keeps landing in the separate column EPIC-033 built for it.
 *
 * **A run whose owner can reach no judge is not a failed run.** Judging is skipped and the checks
 * that needed it stay `not_graded` with `needs_judgement`, which is exactly what the page already
 * renders as "nothing here could be checked". Refusing the whole run would throw away every
 * deterministic verdict in it because one kind of check could not be reached.
 */
export async function runSuite(
  db: Db,
  suiteRunId: string,
  select: SelectProvider = (input) => providerForRun(db, input),
): Promise<void> {
  const run = await suiteRunById(db, suiteRunId);
  if (run === undefined) return;
  if (run.state !== "queued") return; // Already claimed. A retried job must not run it twice.

  const selected = await select({ owner: run.owner, model: run.model });
  if (selected === undefined) {
    // The fourth refusal. Nobody's mistake but ours, and it reaches the person as a sentence.
    await setSuiteRunState(db, suiteRunId, {
      state: "refused",
      refusalReason: "provider_not_configured",
      startedAt: new Date(),
      finishedAt: new Date(),
    });
    return;
  }

  await setSuiteRunState(db, suiteRunId, { state: "running", startedAt: new Date() });

  const set = await inputSetForPrompt(db, run.prompt, run.inputSet);
  if (set === undefined) {
    // The set was removed between trigger and run. Nothing to run, and nothing to blame the
    // provider for — so it finishes with no results rather than with a refusal it did not earn.
    await setSuiteRunState(db, suiteRunId, { state: "done", finishedAt: new Date() });
    return;
  }

  const declarations = await variablesForPrompt(db, run.prompt);
  const checks = await suiteChecksFor(db, suiteRunId);
  // The compiled prompt as it stood when this run was triggered, not as the bloks say now. An edit
  // made while a run is in flight must not change what the later inputs receive.
  const compiled = run.promptText;

  /**
   * The judge's provider, resolved **once** and only if something could need it.
   *
   * Once, because resolving it per input would open the same sealed key a hundred times and stamp
   * `last_used_at` a hundred times for one run. Only if needed, because a run with no
   * `refuses_to_answer` check should not open a key at all — and `suite_checks` already knows,
   * because the kind was frozen onto the row at trigger time.
   */
  const mightJudge = checks.some((check) => check.kind === "refuses_to_answer");
  const judge = mightJudge ? await select({ owner: run.owner, model: JUDGE_MODEL }) : undefined;

  let refusalReason: string | null = null;

  const { stopped } = await inBatches(
    set.rows,
    concurrencyForModel(run.model),
    async (row, index) => runOneInput(db, { run, set, declarations, checks, compiled, selected, judge }, row, index),
    (outcome) => {
      if (outcome.refusal === undefined) return false;
      refusalReason = outcome.refusal;
      return true;
    },
  );
  void stopped;

  const ranNothing = refusalReason !== null && (await suiteRunById(db, suiteRunId))?.completedInputs === 0;
  await setSuiteRunState(db, suiteRunId, {
    state: ranNothing ? "refused" : "done",
    refusalReason,
    finishedAt: new Date(),
  });
}

interface RunContext {
  readonly run: NonNullable<Awaited<ReturnType<typeof suiteRunById>>>;
  readonly set: NonNullable<Awaited<ReturnType<typeof inputSetForPrompt>>>;
  readonly declarations: Awaited<ReturnType<typeof variablesForPrompt>>;
  readonly checks: readonly SuiteCheckRow[];
  readonly compiled: string;
  readonly selected: SelectedProvider;
  readonly judge: SelectedProvider | undefined;
}

/**
 * One input: bind it, run it, grade it, judge what needs judging, store the lot.
 *
 * **The index is a parameter, not a loop position.** With a concurrency above one, several of these
 * are open at once, and `suite_results.input_index` is the number a person reads as "input 17" — it
 * has to keep meaning the seventeenth row of their file whatever order the answers come back in.
 */
async function runOneInput(
  db: Db,
  context: RunContext,
  row: readonly string[],
  index: number,
): Promise<{ readonly refusal: string | undefined }> {
  const { run, set, declarations, checks, compiled, selected, judge } = context;

  const values = new Map(set.columns.map((column, i) => [column, row[i] ?? ""]));
  const bound = bindVariables(compiled, values, declarations);
  if (!bound.ok) {
    // Decision 1 refuses this at upload, so reaching it means the prompt changed after the set was
    // uploaded. It is this input's problem, not the run's: record it and carry on.
    await addSuiteResults(
      db,
      run.id,
      checks.map((check) => ({
        suiteCheck: check.id,
        inputIndex: index,
        run: null,
        outcome: "not_graded",
        reason: "params_not_derivable",
      })),
    );
    await recordSuiteProgress(db, run.id, { calls: 0, cachedCalls: 0, costCents: 0 });
    return { refusal: undefined };
  }

  const request: RunRequest = {
    owner: run.owner,
    promptId: run.prompt,
    compiled: bound.text,
    input: serialiseRow(values),
    model: run.model,
    params: run.params,
  };

  const outcome = await executeRun(db, selected.provider, request);
  if (outcome.status === "refused") return { refusal: outcome.reason };

  const results = gradeAll(checks.map(asCheck), outcome.text);

  /**
   * The judge's turn (EPIC-033).
   *
   * **Only `needs_judgement`.** Every other result is already an answer — a pass, a failure, or an
   * honest "nothing here could be checked" — and handing any of them to a model would replace an
   * exact answer with an opinion. The selection is the typed reason rather than a list of kinds,
   * which is why EPIC-030 calling this reason into existence was the whole of the plumbing.
   *
   * Its spend is accumulated apart from the run's and stays apart all the way to the page.
   */
  const judged: CheckResult[] = [];
  const judgeSpend = { calls: 0, cachedCalls: 0, costCents: 0 };
  for (const [position, result] of results.entries()) {
    if (result.reason !== "needs_judgement" || judge === undefined) {
      judged.push(result);
      continue;
    }
    const verdict = await judgeCheck(db, judge.provider, result, {
      owner: run.owner,
      promptId: run.prompt,
      // The blok's verbatim text, frozen at trigger time — the same rubric a failure is
      // attributed back to, never a recompiled or paraphrased one.
      blokText: checks[position]!.blokText,
      output: outcome.text,
    });
    judged.push(verdict.result);
    judgeSpend.calls += verdict.calls;
    judgeSpend.cachedCalls += verdict.cachedCalls;
    judgeSpend.costCents += verdict.costCents;
  }

  await addSuiteResults(
    db,
    run.id,
    judged.map((result, position) => toStoredResult(result, checks[position]!, index, outcome.runId)),
  );
  await recordSuiteProgress(db, run.id, {
    calls: outcome.status === "ran" ? 1 : 0,
    cachedCalls: outcome.status === "cached" ? 1 : 0,
    costCents: outcome.costCents,
    judgeCalls: judgeSpend.calls,
    judgeCachedCalls: judgeSpend.cachedCalls,
    judgeCostCents: judgeSpend.costCents,
  });

  return { refusal: undefined };
}

/** The frozen row, back in the shape `gradeAll` takes. Verbatim text, exactly one blok. */
function asCheck(row: SuiteCheckRow): Check {
  return {
    id: row.checkId,
    blokId: row.blokId,
    text: row.blokText,
    ...(row.kind === null ? {} : { kind: row.kind as Check["kind"] }),
  };
}

function toStoredResult(result: CheckResult, check: SuiteCheckRow, inputIndex: number, runId: string) {
  return {
    suiteCheck: check.id,
    inputIndex,
    run: runId,
    outcome: result.outcome,
    ...(result.reason === undefined ? {} : { reason: result.reason }),
    ...(result.evidence === undefined ? {} : { evidence: result.evidence }),
  };
}

/** Exported for the queue wiring; kept here so the job body is one import. */
export type { Provider };
