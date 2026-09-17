import {
  diff,
  isCompatible,
  publishGate,
  readSnapshot,
  type Artifact,
  type BlokDiffCounts,
  type ChecksState,
  type CostComparison,
  type GateReport,
} from "@41prompts/core";
import { newestFinishedRunFor, outcomeCountsFor, type Db, type VersionRow } from "@41prompts/db";

/**
 * Gathering the facts the gate decides on (EPIC-051).
 *
 * The decision itself is `publishGate()` in `packages/core` — `CLAUDE.md` rule 1 — and it is
 * deliberate that nothing in this file has an opinion about what an answer *means*. Everything here
 * is a query; every branch is about which query answers.
 *
 * ## Why the checks are resolved before the artifact exists
 *
 * `Artifact.checkSuiteId` is **inside `buildHash`** (ADR-005 §7), so the artifact cannot be
 * assembled until it is known which run proved it — and that is the same lookup the gate's first row
 * needs. So `checksStateFor` runs first and its answer is used twice: once to name the run in the
 * artifact, once as the gate's checks row. Passing the artifact into it instead would be a cycle.
 */

/**
 * Which of the three states this version's checks are in.
 *
 * The order of the branches is the order of the questions: does it assert anything at all, has
 * anybody run those assertions **on this model**, and what happened. Each is a different fact, and
 * `ChecksState` is the union that stops them collapsing into one another.
 */
export async function checksStateFor(input: {
  db: Db;
  promptId: string;
  version: VersionRow;
  /** How many checks a fresh compile of this version produces. Not `suite_checks`, which is what the
   * last run happened to check — the same number only when nothing changed since. */
  checkCount: number;
  targetModel: string;
}): Promise<ChecksState> {
  if (input.checkCount === 0) return { kind: "no_checks" };

  const run = await newestFinishedRunFor(input.db, {
    prompt: input.promptId,
    version: input.version.id,
    model: input.targetModel,
  });
  if (run === undefined) return { kind: "not_proved", model: input.targetModel };

  const counts = await outcomeCountsFor(input.db, run.id);

  // A finished run with no results at all is not a run that graded nothing — it is a run whose
  // results never arrived. `not_proved` is the honest answer, and it is the one a gate should want
  // if the worker died halfway: unknown, not permission.
  if (counts.passed + counts.failed + counts.notGraded === 0) {
    return { kind: "not_proved", model: input.targetModel };
  }

  return {
    kind: "proved",
    model: input.targetModel,
    suiteRunId: run.id,
    passed: counts.passed,
    graded: counts.passed + counts.failed,
    notGraded: counts.notGraded,
  };
}

export interface GateInput {
  db: Db;
  promptId: string;
  version: VersionRow;
  checks: ChecksState;
  /** The artifact about to be published. */
  next: Artifact;
  /** The artifact that is Live, or null when nothing is. */
  live: Artifact | null;
  /** The version row behind `live`. Null when nothing is Live, or when that row has been deleted. */
  liveVersion: VersionRow | null;
  targetModel: string;
}

export async function gateFor(input: GateInput): Promise<GateReport> {
  return publishGate({
    targetModel: input.targetModel,
    checks: input.checks,
    // Null when nothing is Live: there are then no callers in the field for this publish to break.
    compatibility: input.live === null ? null : isCompatible(input.live, input.next),
    cost: await costFor(input),
    diff: diffCountsFor(input),
  });
}

/**
 * Cents per call on each side, or null when either side is unknown.
 *
 * **Per call, not per run.** Two runs over input sets of different sizes cost different totals for
 * the same prompt, so a total is not a comparison. `costCents / calls` is, and `calls` excludes cache
 * hits by construction (`suite_runs.calls`'s own comment), so a cached run does not read as free
 * work.
 *
 * Null rather than zero when a side has no run or made no calls: the gate renders a null as
 * "unknown" and a zero as "free", and only one of those is true.
 */
async function costFor(input: GateInput): Promise<CostComparison | null> {
  if (input.liveVersion === null) return null;

  const [liveRun, nextRun] = await Promise.all([
    newestFinishedRunFor(input.db, {
      prompt: input.promptId,
      version: input.liveVersion.id,
      model: input.targetModel,
    }),
    newestFinishedRunFor(input.db, { prompt: input.promptId, version: input.version.id, model: input.targetModel }),
  ]);
  if (liveRun === undefined || nextRun === undefined) return null;
  if (liveRun.calls === 0 || nextRun.calls === 0) return null;

  return {
    liveCentsPerCall: liveRun.costCents / liveRun.calls,
    nextCentsPerCall: nextRun.costCents / nextRun.calls,
  };
}

/** What changed, as counts. Null when nothing is Live, or when either snapshot cannot be read. */
function diffCountsFor(input: GateInput): BlokDiffCounts | null {
  if (input.liveVersion === null) return null;

  const before = readSnapshot(input.liveVersion.snapshot, input.liveVersion.compiledText);
  const after = readSnapshot(input.version.snapshot, input.version.compiledText);
  if (before === undefined || after === undefined) return null;

  const result = diff(before, after);
  return {
    added: result.added.length,
    removed: result.removed.length,
    changed: result.changed.length,
    moved: result.moved.length,
  };
}
