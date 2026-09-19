import {
  CHECK_KIND_PHRASES,
  type CheckKind,
  type ColumnProblem,
  type CsvProblem,
  type Evidence,
  type NotGradedReason,
  type RunSummary,
} from "@41prompts/core";
import type { SuiteCheckRow, SuiteResultRow, SuiteRunRow } from "@41prompts/db";

/**
 * **Where the facts become English.**
 *
 * `packages/core` states what it found — an excerpt with offsets, a measurement with its unit, an
 * absence, a shape, a count, a reason — and deliberately writes no prose about a person's output
 * (EPIC-030 decision 5, and `CLAUDE.md` rule 3's reasoning applied to output rather than to bloks).
 * Turning those into sentences is this epic's job, it happens here, and it is pure so that every
 * sentence has a test rather than a screenshot.
 *
 * Two of the sentences arrived as inherited requirements and are the reason this file is separate
 * from the components that render it: the `fullyChecked: false` sentence, and the one that says
 * what the cost counts.
 */

/** One check, with every input's verdict for it rolled up. The unit the results list is made of. */
export interface CheckRowView {
  readonly suiteCheckId: string;
  readonly blokId: string;
  readonly blokKind: string;
  readonly blokText: string;
  /** ADR-003's plain phrase, or the sentence for a check no kind could be named for. */
  readonly phrase: string;
  readonly passed: number;
  readonly failed: number;
  readonly notGraded: number;
  readonly total: number;
  /**
   * Green or red, and **never amber** — amber is drift and nothing on this page is drift
   * (`CLAUDE.md` rule 10). `undefined` where there is nothing to colour, which is a check that
   * could not be graded at all: it is neither a pass nor a failure and must not be painted as one.
   */
  readonly status: "pass" | "fail" | undefined;
  /** 0–100 over the results that were **graded**. A check nothing could grade has no rate. */
  readonly meterValue: number;
  readonly firstFailure?: {
    readonly inputIndex: number;
    readonly runId: string | null;
    readonly evidence: Evidence | undefined;
  };
}

export function checkRows(checks: readonly SuiteCheckRow[], results: readonly SuiteResultRow[]): CheckRowView[] {
  return checks.map((check) => {
    const mine = results.filter((result) => result.suiteCheck === check.id);
    const passed = mine.filter((result) => result.outcome === "pass").length;
    const failed = mine.filter((result) => result.outcome === "fail").length;
    const notGraded = mine.filter((result) => result.outcome === "not_graded").length;
    const graded = passed + failed;

    const failure = mine
      .filter((result) => result.outcome === "fail")
      .sort((a, b) => a.inputIndex - b.inputIndex)[0];

    return {
      suiteCheckId: check.id,
      blokId: check.blokId,
      blokKind: check.blokKind,
      blokText: check.blokText,
      phrase: phraseFor(check.kind),
      passed,
      failed,
      notGraded,
      total: mine.length,
      status: graded === 0 ? undefined : failed > 0 ? "fail" : "pass",
      meterValue: graded === 0 ? 0 : Math.round((passed / graded) * 100),
      ...(failure === undefined
        ? {}
        : {
            firstFailure: {
              inputIndex: failure.inputIndex,
              runId: failure.run,
              evidence: (failure.evidence ?? undefined) as Evidence | undefined,
            },
          }),
    };
  });
}

/**
 * ADR-003's phrase, or a sentence for the checks that have no kind.
 *
 * The internal identifiers never reach a screen; `CHECK_KIND_PHRASES` is the only bridge, and this
 * is the only place that crosses it.
 */
function phraseFor(kind: string | null): string {
  if (kind === null) return "no check could be named from these words";
  return CHECK_KIND_PHRASES[kind as CheckKind] ?? "no check could be named from these words";
}

export function summaryOf(results: readonly SuiteResultRow[]): RunSummary {
  const passed = results.filter((result) => result.outcome === "pass").length;
  const failed = results.filter((result) => result.outcome === "fail").length;
  const notGraded = results.filter((result) => result.outcome === "not_graded").length;
  return {
    total: results.length,
    passed,
    failed,
    notGraded,
    noFailures: failed === 0,
    fullyChecked: results.length > 0 && passed === results.length,
  };
}

/**
 * Why a check could not be checked, in words a person can act on.
 *
 * Four different situations, and **two of them are things the author can fix** — which is why
 * `NotGradedReason` is typed rather than a string, and why this does not collapse them into "we
 * could not check this".
 */
const REASON_PHRASES: Readonly<Record<NotGradedReason, string>> = {
  no_kind: "we could not tell from the words what to check",
  params_not_derivable: "the rule does not say what to measure",
  pattern_rejected: "the pattern was refused as unsafe to run",
  needs_judgement: "it needs judgement, which no grader here can give yet",
};

/**
 * The three sentences about whether this run verified anything.
 *
 * **They are three and not one.** The inherited requirement is that `fullyChecked: false` gets its
 * own sentence, distinct from anything said about failures, and that it is never folded into a
 * pass — so "All checks passed" cannot appear when nothing was checked. Keeping them in separate
 * fields is what makes that structural rather than a rule the component has to remember.
 */
export interface Verification {
  /** Whether this was verified. Never says "passed" unless everything ran and everything passed. */
  readonly headline: string;
  /** Present exactly when something could not be checked. Its own sentence, by requirement. */
  readonly notChecked?: string;
  /** Present exactly when something failed. Separate, by requirement. */
  readonly failures?: string;
}

export function verification(summary: RunSummary, results: readonly SuiteResultRow[]): Verification {
  if (summary.total === 0) {
    return { headline: "Nothing here was verified: this prompt has no checks yet." };
  }

  const headline = summary.fullyChecked
    ? "Every check ran, and every one passed."
    : summary.notGraded === summary.total
      ? "Nothing here was verified."
      : summary.failed > 0
        ? "This prompt is not verified: something failed."
        : "Some of this was checked and some of it was not.";

  const counts = new Map<NotGradedReason, number>();
  for (const result of results) {
    if (result.outcome !== "not_graded") continue;
    const reason = (result.reason ?? "no_kind") as NotGradedReason;
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }

  const notChecked =
    summary.notGraded === 0
      ? undefined
      : `${summary.notGraded} of ${summary.total} could not be checked: ` +
        [...counts.entries()]
          .map(([reason, count]) => `${count} because ${REASON_PHRASES[reason]}`)
          .join("; ") +
        ".";

  const failures =
    summary.failed === 0 ? undefined : `${summary.failed} of ${summary.total} failed.`;

  return { headline, ...(notChecked === undefined ? {} : { notChecked }), ...(failures === undefined ? {} : { failures }) };
}

/**
 * What the cost counts, said out loud.
 *
 * **Inherited from EPIC-031, and the reason is a number that changes on its own.** A cache hit
 * calls nobody, so it costs nothing and reserves nothing — which is correct, and which means a
 * re-run is free. Somebody who runs 200 inputs, sees a number, edits one blok and re-runs will see
 * a much smaller number for what looks like the same work. Both are true. Neither is
 * self-explanatory, and a figure that silently means two different things on two consecutive
 * screens is the same class of problem as a pass that silently means two.
 */
export function costSentence(run: Pick<SuiteRunRow, "calls" | "cachedCalls" | "costCents">): string {
  const money = formatCents(run.costCents);

  if (run.calls === 0 && run.cachedCalls > 0) {
    return `This run spent nothing. Every input was answered from the cache of an earlier identical run, so no model was called.`;
  }
  if (run.calls === 0) {
    return `This run spent nothing, because no model was called.`;
  }

  const base = `This run spent ${money} — what its ${run.calls} ${run.calls === 1 ? "call" : "calls"} cost, not the cost of everything on this page.`;
  return run.cachedCalls === 0
    ? base
    : `${base} ${run.cachedCalls} more ${run.cachedCalls === 1 ? "input was" : "inputs were"} answered from the cache, which called nobody and cost nothing.`;
}

/**
 * What the judge cost, said **separately** from what the run cost (EPIC-033 decision 4).
 *
 * Two questions, two numbers: what it cost to run a prompt, and what it cost to check it. Somebody
 * deciding whether the checking is worth the money cannot decide it from one figure containing
 * both, and folding them would also make the run look more expensive than running it is.
 *
 * **Empty when nothing was judged**, rather than "$0.00 on the judge". A zero invites the reader to
 * work out why it is zero; silence about a thing that did not happen is the honest shape, and it is
 * the same reasoning that keeps `fullyChecked: false` out of a pass.
 */
export function judgeCostSentence(
  run: Pick<SuiteRunRow, "judgeCalls" | "judgeCachedCalls" | "judgeCostCents">
): string | undefined {
  if (run.judgeCalls === 0 && run.judgeCachedCalls === 0) return undefined;

  if (run.judgeCalls === 0) {
    const inputs = run.judgeCachedCalls === 1 ? "check was" : "checks were";
    return `Judging cost nothing: ${run.judgeCachedCalls} ${inputs} answered from the cache of an earlier identical judgement.`;
  }

  const calls = `${run.judgeCalls} ${run.judgeCalls === 1 ? "judgement" : "judgements"}`;
  const base = `Judging cost ${formatCents(run.judgeCostCents)} on top of that \u2014 ${calls}, counted apart from the run so each number says what it is.`;
  return run.judgeCachedCalls === 0
    ? base
    : `${base} ${run.judgeCachedCalls} more came from the cache and cost nothing.`;
}

/** Integer cents, as money. `costCents` is the same unit `run_budgets` uses, so there is no conversion. */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** What a run is doing, in the words the history and the page head both use. */
export function stateWords(run: Pick<SuiteRunRow, "state" | "completedInputs" | "totalInputs" | "refusalReason">): string {
  switch (run.state) {
    case "queued":
      return "Waiting to start";
    case "running":
      return `Running — ${run.completedInputs} of ${run.totalInputs} inputs`;
    case "refused":
      return `Refused — ${refusalWords(run.refusalReason)}`;
    default:
      return run.refusalReason === null
        ? `Finished — ${run.completedInputs} of ${run.totalInputs} inputs`
        : `Stopped after ${run.completedInputs} of ${run.totalInputs} inputs — ${refusalWords(run.refusalReason)}`;
  }
}

/**
 * Why a run did not happen, in words.
 *
 * `apps/worker`'s `RefusalReason` is typed so that this can say **which**, and three of the four are
 * things a person can act on. The fourth is ours, and it says so rather than implying the user did
 * something wrong.
 */
export function refusalWords(reason: string | null): string {
  switch (reason) {
    case "provider_not_configured":
      return "no model provider is configured here, so there was nothing honest to run against";
    case "budget_exhausted":
      return "this account's run budget for the month is used up";
    case "model_not_priced":
      return "we have no price for that model, and a run we cannot cost is a run we will not make";
    case "queue_unavailable":
      return "the queue that carries a run to the worker would not take it, so nothing was started";
    default:
      return "no reason was recorded, which is itself a defect";
  }
}

/**
 * One `Evidence`, as a sentence.
 *
 * Every variant is a fact with a shape: a slice with offsets, a measurement with its unit, a thing
 * looked for and not found, or a set of keys. None of them is advice, and none of them is a
 * paraphrase of what the person wrote.
 *
 * **`judgement` is the odd one out and is treated as such.** The other four can be re-derived from
 * the output by anybody; this one is a model's testimony, and presenting it in the same voice as a
 * character offset would claim an authority it does not have. So it is attributed — the reader is
 * told a model said it, and which model — and the words are the judge's own, never rewritten.
 */
export function evidenceSentence(evidence: Evidence | undefined): string | undefined {
  if (evidence === undefined) return undefined;
  switch (evidence.kind) {
    case "excerpt":
      return `Found “${evidence.text}” at character ${evidence.start}.`;
    case "measurement":
      return `Measured ${evidence.measured} ${evidence.counting} against a limit of ${evidence.limit}. Characters are counted as code points.`;
    case "absent":
      return `Looked for “${evidence.sought}” and it was not there.`;
    case "shape":
      return evidence.found.length === 0
        ? `Expected ${listOf(evidence.expected)}. The output was not an object.`
        : `Expected ${listOf(evidence.expected)}. Found ${listOf(evidence.found)}.`;
    case "judgement":
      return evidence.rationale === ""
        ? `Judged by ${evidence.judge}, which gave no reason.`
        : `Judged by ${evidence.judge}: “${evidence.rationale}”`;
  }
}

function listOf(values: readonly string[]): string {
  return values.length === 0 ? "nothing" : values.join(", ");
}

/**
 * The output split around the failing region, so the region can be marked up.
 *
 * **Offsets are code points**, because that is what `packages/core` counts and says it counts —
 * `"👩‍💻"` is 5 UTF-16 code units and 3 code points, so slicing the string directly would cut a
 * surrogate pair in half and highlight the wrong run of text. Spreading into an array gives code
 * points, which is the unit the number is in.
 */
export function highlightParts(
  output: string,
  evidence: Evidence | undefined
): { before: string; match: string; after: string } {
  if (evidence === undefined || evidence.kind !== "excerpt") return { before: output, match: "", after: "" };
  const points = [...output];
  return {
    before: points.slice(0, evidence.start).join(""),
    match: points.slice(evidence.start, evidence.end).join(""),
    after: points.slice(evidence.end).join(""),
  };
}

/** A CSV that could not be read, in words, with the place it went wrong. */
export function csvProblemWords(problem: CsvProblem): string {
  switch (problem.kind) {
    case "empty":
      return "That file has a header and no rows, or nothing at all.";
    case "unterminated_quote":
      return `A quoted value opens on line ${problem.line} and never closes.`;
    case "ragged_row":
      return `Line ${problem.line} has ${problem.found} ${problem.found === 1 ? "value" : "values"} where the header names ${problem.expected}.`;
    case "blank_column_name":
      return `Column ${problem.column} has no name, so nothing can say what it binds to.`;
    case "duplicate_column_name":
      return `The column “${problem.name}” appears twice, so a row's value for it would be ambiguous.`;
  }
}

/**
 * A header that does not bind, in words — and the rows are **not** stored.
 *
 * Decision 1: at upload, not at run time. The message names the column or the variable, because
 * "that file does not match" is a refusal nobody can act on.
 */
export function columnProblemWords(problems: readonly ColumnProblem[]): string {
  if (problems.length === 1 && problems[0]!.kind === "no_variables_declared") {
    return "This prompt declares no variables, so a column has nothing to bind to. Declare one on the Variables tab first.";
  }

  const unknown = problems.filter((problem) => problem.kind === "unknown_column").map((problem) => problem.name);
  const missing = problems.filter((problem) => problem.kind === "missing_required").map((problem) => problem.name);

  const parts: string[] = [];
  if (unknown.length > 0) {
    parts.push(
      `${unknown.length === 1 ? "The column" : "The columns"} ${quoteList(unknown)} ${unknown.length === 1 ? "matches" : "match"} no variable this prompt declares.`
    );
  }
  if (missing.length > 0) {
    parts.push(
      `${quoteList(missing)} ${missing.length === 1 ? "is a variable" : "are variables"} this prompt requires, and the file has no column for ${missing.length === 1 ? "it" : "them"}.`
    );
  }
  return `${parts.join(" ")} Nothing was saved.`;
}

function quoteList(names: readonly string[]): string {
  return names.map((name) => `“${name}”`).join(", ");
}

// ── EPIC-042: the two pivots ─────────────────────────────────────────────────────────────────
//
// Both are pure functions over rows that already exist. Neither derives a fact the database does
// not have; they only choose how it is arranged. That is deliberate — the matrix and the heatmap
// are two *views* of one run's results, and a view that computed its own verdicts would be a second
// grader nobody asked for.

/** One cell of the heatmap: what one check said about one input. */
export interface HeatCell {
  readonly inputIndex: number;
  /**
   * `pass`, `fail`, or `undefined` for a result that could not be graded **or does not exist**.
   *
   * The two are one value on purpose. A run that stopped at the budget cap has no rows at all for
   * the inputs it never reached, and a check nothing could grade has a row saying so; from the
   * heatmap's side both mean "there is no verdict here", and painting either of them green or red
   * would be claiming one.
   */
  readonly status: "pass" | "fail" | undefined;
  /**
   * The cell's accessible name. **`CLAUDE.md` rule 10: pass/fail is never shown by colour alone**,
   * and this is the form that rule takes for a 15px square — the word is in the name, and the cell
   * also carries a shape difference in CSS.
   *
   * `name` rather than the ADR-003 word, and it happens to be the right word anyway: this is what
   * WAI-ARIA calls an *accessible name*.
   */
  readonly name: string;
}

export interface HeatRow {
  readonly suiteCheckId: string;
  /** Names the row for a screen reader, so the cell's own name can stay "input 17, fail". */
  readonly phrase: string;
  readonly blokText: string;
  readonly cells: readonly HeatCell[];
}

/**
 * Results by **input** rather than by check — the mockup's "By input" pivot.
 *
 * `inputCount` comes from the input set, not from the results, because a run that stopped early has
 * fewer results than inputs and a heatmap that silently narrowed would hide exactly that. The
 * ungraded tail is rendered as absent, which is what it is.
 */
export function heatmapRows(
  checks: readonly SuiteCheckRow[],
  results: readonly SuiteResultRow[],
  inputCount: number,
): HeatRow[] {
  const byCheck = new Map<string, Map<number, SuiteResultRow>>();
  for (const result of results) {
    let row = byCheck.get(result.suiteCheck);
    if (row === undefined) {
      row = new Map();
      byCheck.set(result.suiteCheck, row);
    }
    row.set(result.inputIndex, result);
  }

  return checks.map((check) => {
    const mine = byCheck.get(check.id);
    const phrase = phraseFor(check.kind);
    return {
      suiteCheckId: check.id,
      phrase,
      blokText: check.blokText,
      cells: Array.from({ length: inputCount }, (_, inputIndex) => {
        const result = mine?.get(inputIndex);
        const status = result === undefined || result.outcome === "not_graded" ? undefined : (result.outcome as "pass" | "fail");
        return {
          inputIndex,
          status,
          // One-based, because "input 17" means the seventeenth row of a person's file.
          name: `input ${inputIndex + 1}, ${status ?? "not checked"}`,
        };
      }),
    };
  });
}

/** One column of the provider matrix: one run, of one model, at one provider. */
export interface MatrixColumn {
  readonly runId: string;
  /** "GPT-4.1 mini", from the catalogue. Never the raw id, which nobody reads as a provider. */
  readonly modelName: string;
  readonly providerTitle: string;
  /** True for the run whose page this is, so it can be marked rather than linked. */
  readonly isCurrent: boolean;
}

export interface MatrixCell {
  readonly runId: string;
  readonly passed: number;
  readonly graded: number;
  readonly status: "pass" | "fail" | undefined;
  /**
   * "38 of 40 passed", or the honest sentence when there is no verdict yet.
   *
   * **A run that has not finished says so, and does not say "nothing graded".** The browser drive
   * found this: three runs are queued together and the worker takes them one at a time, so the
   * moment the first one finishes its page renders the others as empty columns. "Nothing graded" is
   * a statement about a prompt — it means *no check here could be decided* — and reading it about a
   * run that simply has not got there yet is being told a verdict that does not exist.
   */
  readonly words: string;
}

export interface MatrixRow {
  readonly checkId: string;
  readonly phrase: string;
  readonly blokKind: string;
  readonly blokText: string;
  readonly cells: readonly MatrixCell[];
}

export interface MatrixInput {
  readonly runId: string;
  readonly model: string;
  /** `queued` · `running` · `done` · `refused`, from the row. A cell reads differently for each. */
  readonly state: string;
  readonly checks: readonly SuiteCheckRow[];
  readonly results: readonly SuiteResultRow[];
}

/** Whether a run has not answered yet — the two states in which a cell is a wait, not a verdict. */
export function runIsInFlight(state: string): boolean {
  return state === "queued" || state === "running";
}

/**
 * The provider matrix: a row per check, a column per run.
 *
 * ## Rows are matched on `check_id`, not on `suite_check.id`
 *
 * `suite_checks` is frozen per run, so three runs of one version have three rows for the same
 * check with three different primary keys. `checkId` is `compile()`'s **content-derived** id, so it
 * is the same across every run of the same blok text — which is exactly the identity a row of this
 * table needs. Matching on the primary key would produce a matrix with one filled cell per row.
 *
 * ## A check that only some columns have is still a row
 *
 * Runs in one comparison are normally of one version and have identical checks. They need not be:
 * an A/B of two versions is also a comparison, and a check added in v7 exists in one column only.
 * Such a row renders with an empty cell rather than being dropped, because dropping it would hide
 * the difference the comparison was made to show.
 */
export function matrixRows(runs: readonly MatrixInput[]): MatrixRow[] {
  const order: string[] = [];
  const seen = new Map<string, SuiteCheckRow>();
  for (const run of runs) {
    for (const check of run.checks) {
      if (seen.has(check.checkId)) continue;
      seen.set(check.checkId, check);
      order.push(check.checkId);
    }
  }

  return order.map((checkId) => {
    const first = seen.get(checkId)!;
    return {
      checkId,
      phrase: phraseFor(first.kind),
      blokKind: first.blokKind,
      blokText: first.blokText,
      cells: runs.map((run) => {
        const check = run.checks.find((candidate) => candidate.checkId === checkId);
        const mine = check === undefined ? [] : run.results.filter((result) => result.suiteCheck === check.id);
        const passed = mine.filter((result) => result.outcome === "pass").length;
        const failed = mine.filter((result) => result.outcome === "fail").length;
        const graded = passed + failed;
        return {
          runId: run.runId,
          passed,
          graded,
          status: graded === 0 ? undefined : failed > 0 ? "fail" : "pass",
          words:
            check === undefined
              ? "not in this version"
              : graded > 0
                ? `${passed} of ${graded} passed`
                : runIsInFlight(run.state)
                  ? "still running"
                  : run.state === "refused"
                    ? "did not run"
                    : "nothing graded",
        };
      }),
    };
  });
}
