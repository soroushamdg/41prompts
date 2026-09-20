import { projects, prompts, suiteResults, suiteRuns, type Db } from "@41prompts/db";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

/**
 * The three numbers the mockup puts on a project card: Pass, Runs, Cost.
 *
 * ## Every one is derived, and absent rather than zero
 *
 * `docs/design/41prompts-full-mockup.html` draws `Pass 81.7% · Runs 482 · Cost $0.37` on every card.
 * A project that has never been run has none of those, and printing `0%` would say it failed —
 * which is the honesty EPIC-030 refused to trade away when it made `not_graded` a third outcome
 * rather than folding it into a fail. So `undefined` means *nothing to report* and the card prints
 * an em dash.
 *
 * `passRate` is `null` where runs exist but nothing was gradable, which is a different statement
 * again and the card says so in words.
 *
 * ## Why "Pass" for a *project* is the newest finished run
 *
 * A project holds many prompts, so "the project's pass rate" is not a quantity that exists. The
 * choice here is the newest finished run anywhere in the project — *how did the last thing you ran
 * do* — because that is the question a card at the top of a list is being asked. Averaging across
 * prompts would invent a number nobody could act on, and summing would weight whichever prompt
 * happens to have the most inputs.
 *
 * ## A fixed number of queries, whatever the project count
 *
 * Three, never N+1: the per-project aggregate, the newest finished run per project, and the outcome
 * counts for exactly those runs. `metrics.test.ts` counts them with one project and with twelve and
 * asserts the number does not move — which is the property that actually matters, rather than
 * "one query", which a pass rate spanning two tables cannot honestly be.
 */
export interface ProjectMetrics {
  /** Runs started, ever. `undefined` when the project has never been run. */
  readonly runs?: number;
  /** Total cents across those runs, model and judge. `undefined` with no runs. */
  readonly costCents?: number;
  /**
   * Pass rate of the newest finished run, 0–1. `undefined` when no run has finished;
   * `null` when one has and nothing in it could be graded.
   */
  readonly passRate?: number | null;
}

export async function metricsForProjects(
  db: Db,
  owner: string,
  projectIds: readonly string[]
): Promise<Map<string, ProjectMetrics>> {
  const out = new Map<string, ProjectMetrics>();
  if (projectIds.length === 0) return out;

  // ── 1. runs and cost, per project ───────────────────────────────────────────────────────────
  //
  // Scoped by `projects.owner` and not only by the ids handed in: this is the layer that reads
  // somebody's numbers, and a helper that trusts its caller to have checked is one refactor away
  // from being called by something that did not.
  const totals = await db
    .select({
      projectId: prompts.project,
      runs: sql<number>`count(*)::int`,
      // Model spend and judge spend are separate columns because they answer different questions
      // (`schema.ts`). A card shows what the project cost, which is both.
      cents: sql<number>`coalesce(sum(${suiteRuns.costCents} + ${suiteRuns.judgeCostCents}), 0)::int`
    })
    .from(suiteRuns)
    .innerJoin(prompts, eq(suiteRuns.prompt, prompts.id))
    .innerJoin(projects, eq(prompts.project, projects.id))
    .where(
      and(
        inArray(prompts.project, [...projectIds]),
        eq(projects.owner, owner),
        isNull(projects.deletedAt)
      )
    )
    .groupBy(prompts.project);

  for (const row of totals) {
    out.set(row.projectId, { runs: row.runs, costCents: row.cents });
  }
  if (totals.length === 0) return out;

  // ── 2. the newest finished run per project ──────────────────────────────────────────────────
  //
  // `distinct on` is Postgres's own answer to "one row per group, chosen by an order", the same
  // shape `passRateForVersions` uses. `state = 'done'` because a queued or running suite has no
  // rate yet and reporting one mid-flight is how EPIC-042's drive found "nothing graded" rendering
  // as a result.
  const latest = await db
    .selectDistinctOn([prompts.project], { projectId: prompts.project, runId: suiteRuns.id })
    .from(suiteRuns)
    .innerJoin(prompts, eq(suiteRuns.prompt, prompts.id))
    .where(and(inArray(prompts.project, [...projectIds]), eq(suiteRuns.state, "done")))
    .orderBy(prompts.project, desc(suiteRuns.createdAt));

  const runIds = latest.map((row) => row.runId);
  if (runIds.length === 0) return out;

  // ── 3. outcome counts for exactly those runs ────────────────────────────────────────────────
  const counts = await db
    .select({
      runId: suiteResults.suiteRun,
      outcome: suiteResults.outcome,
      n: sql<number>`count(*)::int`
    })
    .from(suiteResults)
    .where(inArray(suiteResults.suiteRun, runIds))
    .groupBy(suiteResults.suiteRun, suiteResults.outcome);

  for (const row of latest) {
    const mine = counts.filter((count) => count.runId === row.runId);
    const of = (outcome: string) => mine.find((count) => count.outcome === outcome)?.n ?? 0;
    const passed = of("pass");
    const graded = passed + of("fail");
    out.set(row.projectId, {
      ...out.get(row.projectId),
      // `null`, not 0. A run in which nothing could be graded did not score zero — it scored
      // nothing, and those are different sentences on a card somebody is choosing what to open.
      passRate: graded === 0 ? null : passed / graded
    });
  }

  return out;
}
