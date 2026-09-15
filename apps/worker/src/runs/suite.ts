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
import { executeRun, type Provider, type RunRequest } from "./execute";
import { judgeCheck } from "./judge";
import { providerFor } from "./provider";

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
 */
export async function runSuite(db: Db, suiteRunId: string, selected = providerFor()): Promise<void> {
  const run = await suiteRunById(db, suiteRunId);
  if (run === undefined) return;
  if (run.state !== "queued") return; // Already claimed. A retried job must not run it twice.

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

  let refusalReason: string | null = null;

  for (const [index, row] of set.rows.entries()) {
    const values = new Map(set.columns.map((column, i) => [column, row[i] ?? ""]));
    const bound = bindVariables(compiled, values, declarations);
    if (!bound.ok) {
      // Decision 1 refuses this at upload, so reaching it means the prompt changed after the set was
      // uploaded. It is this input's problem, not the run's: record it and carry on.
      await addSuiteResults(
        db,
        suiteRunId,
        checks.map((check) => ({
          suiteCheck: check.id,
          inputIndex: index,
          run: null,
          outcome: "not_graded",
          reason: "params_not_derivable",
        })),
      );
      await recordSuiteProgress(db, suiteRunId, { calls: 0, cachedCalls: 0, costCents: 0 });
      continue;
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

    if (outcome.status === "refused") {
      refusalReason = outcome.reason;
      break;
    }

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
      if (result.reason !== "needs_judgement") {
        judged.push(result);
        continue;
      }
      const verdict = await judgeCheck(db, selected.provider, result, {
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
      suiteRunId,
      judged.map((result, position) => toStoredResult(result, checks[position]!, index, outcome.runId)),
    );
    await recordSuiteProgress(db, suiteRunId, {
      calls: outcome.status === "ran" ? 1 : 0,
      cachedCalls: outcome.status === "cached" ? 1 : 0,
      costCents: outcome.costCents,
      judgeCalls: judgeSpend.calls,
      judgeCachedCalls: judgeSpend.cachedCalls,
      judgeCostCents: judgeSpend.costCents,
    });
  }

  const ranNothing = refusalReason !== null && (await suiteRunById(db, suiteRunId))?.completedInputs === 0;
  await setSuiteRunState(db, suiteRunId, {
    state: ranNothing ? "refused" : "done",
    refusalReason,
    finishedAt: new Date(),
  });
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
