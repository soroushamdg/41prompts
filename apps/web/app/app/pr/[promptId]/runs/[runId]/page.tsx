import { KpiStrip } from "@41prompts/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { catalogueModel, claimPassedNotification, PROVIDER_TITLES, users } from "@41prompts/db";
import { eq } from "drizzle-orm";
import { captureAccountEvent } from "@/lib/analytics/visitor";
import { secondsFromSignup } from "@/lib/activation/progress";
import { getDb } from "@/lib/db";
import { comparisonDetailFor, outputFor, runDetailFor } from "@/lib/runs/queries";
import {
  checkRows,
  costSentence,
  formatCents,
  heatmapRows,
  judgeCostSentence,
  matrixRows,
  runIsInFlight,
  stateWords,
  summaryOf,
  verification,
  type MatrixColumn,
} from "@/lib/runs/view";
import { runVersionWords } from "@/lib/versions/view";
import { requireSession } from "@/lib/session";
import { Heatmap } from "./heatmap";
import { ProviderMatrix } from "./matrix";
import { Pivots } from "./pivots";
import { Progress } from "./progress";
import { Results } from "./results";

export const metadata: Metadata = { title: "Run · 41Prompts", robots: { index: false, follow: false } };

/**
 * One run: what it cost, what it checked, and what failed.
 *
 * ## Results are by check, not by input (decision 2)
 *
 * The question a person has is "which of my rules is failing", not "how did row 7 do". Row detail
 * is one level down, inside the failing check.
 *
 * ## The two sentences
 *
 * The cost says **what it counts**, because a cache hit is free and a re-run therefore shows a
 * smaller number for the same work. And `fullyChecked: false` gets **its own sentence**, never
 * folded into a pass — EPIC-030 removed the `passed` field from `RunSummary` so that no caller
 * could read one boolean as the answer, and this page is where that care either survives or is
 * thrown away in a heading.
 */
export default async function RunPage({ params }: { params: Promise<{ promptId: string; runId: string }> }) {
  const { promptId, runId } = await params;
  const session = await requireSession(`/app/pr/${promptId}/runs/${runId}`);

  const detail = await runDetailFor(getDb(), runId, session.user.id);
  if (detail === undefined || detail.run.prompt !== promptId) notFound();

  const { run, checks, results, inputSet, versionsByN, partners } = detail;
  const rows = checkRows(checks, results);
  const summary = summaryOf(results);
  const said = verification(summary, results);

  // One read per failing check, bounded by the number of checks a prompt has. The output lives on
  // the `runs` row and is not copied here, so rule 6's twelve-month purge stays its only clock.
  const outputs = new Map<string, string | undefined>();
  for (const row of rows) {
    const failure = row.firstFailure;
    if (failure?.runId === undefined || failure.runId === null) continue;
    if (outputs.has(failure.runId)) continue;
    outputs.set(failure.runId, await outputFor(getDb(), failure.runId, session.user.id));
  }

  const graded = summary.passed + summary.failed;
  const inFlight = run.state === "queued" || run.state === "running";

  /**
   * ── EPIC-042 ────────────────────────────────────────────────────────────────────────────────
   *
   * The matrix, when this run is one of several made together. Two rows is an A/B of two versions
   * (EPIC-041) and reads perfectly well as a two-column matrix, so there is no threshold beyond
   * "there is more than one run in this comparison".
   *
   * The extra reads happen only in that case: an ordinary run pays for none of them.
   */
  const comparison =
    run.comparison === null || partners.length === 0
      ? undefined
      : await comparisonDetailFor(getDb(), run.comparison, session.user.id);

  const matrixColumns: MatrixColumn[] = (comparison ?? []).map((entry) => {
    const model = catalogueModel(entry.run.model);
    return {
      runId: entry.run.id,
      modelName: model?.name ?? entry.run.model,
      providerTitle: model === undefined ? "Model" : PROVIDER_TITLES[model.provider],
      isCurrent: entry.run.id === run.id,
    };
  });

  /**
   * **The other columns are still arriving, and the page has to wait for them too.**
   *
   * Runs in a comparison are queued together and the worker takes them one at a time, so the first
   * one to finish renders a matrix whose other columns are empty. Polling only on *this* run's state
   * would leave that matrix frozen until somebody reloaded — and an empty column that never fills is
   * indistinguishable from a provider that failed everything.
   */
  const partnersInFlight = (comparison ?? []).filter(
    (entry) => entry.run.id !== run.id && runIsInFlight(entry.run.state),
  ).length;

  const heat = heatmapRows(checks, results, inputSet?.rowCount ?? run.totalInputs);

  /**
   * `run_passed` (EPIC-034), at the moment the person could first see that they had passed.
   *
   * **`noFailures`, not `state === "done"`.** EPIC-030 deleted `passed` from `RunSummary` precisely
   * so that no caller could read one boolean as the answer; a run that finished having graded
   * nothing is not a pass, and an activation metric that counted one would be measuring the wrong
   * thing forever.
   *
   * `claimPassedNotification` is a conditional UPDATE, so reloading this page — or opening it in a
   * second tab, or two containers rendering it at once — sends exactly one event.
   */
  if (!inFlight && summary.noFailures && summary.total > 0 && run.passedNotifiedAt === null) {
    await notePassed(run.id, session.user.id, run.finishedAt ?? new Date());
  }

  return (
    <main className="app-page">
      <header className="app-pagehead">
        <p className="app-crumb">
          <a href={`/app/pr/${promptId}/runs`}>Runs</a>
        </p>
        {/* **Which run this is, not merely that it is one.** Every run detail page read `Run`,
            so a person with three runs of two input sets had the URL and nothing else to tell them
            apart — on a page whose whole argument is that it says honestly what happened. The
            timestamp is the same UTC shape the history list uses, formatted on the server from a
            fixed slice so it cannot differ between render and hydration. */}
        <h1>{inputSet === undefined ? "Run" : `Run of ${inputSet.name}`}</h1>
        <p className="app-state" data-state={run.state}>
          {stateWords(run)}
        </p>
        <p className="runs-when">Triggered {run.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC</p>
        {/* **Which version this ran, and its A/B partner if it has one** (EPIC-041).

            A run made before EPIC-040 has no version at all, and `suite_runs.version` stays nullable
            because backfilling one would invent a historical fact. So this says so in words rather
            than rendering a blank or, worse, a version it guessed at. */}
        {/* **Every partner, not the first one** (EPIC-042). A comparison used to be two runs of
            two versions; it is now also N runs at N providers, and naming one of three would drop
            the rest silently. Each is named by what distinguishes it — the model, where the
            comparison is across providers; the version, where it is across versions. */}
        <p className="runs-when" data-testid="run-version">
          {runVersionWords(run, versionsByN)}
          {partners.length > 0 && (
            <>
              {" · compared with "}
              {partners.map((other, index) => (
                <span key={other.id}>
                  {index > 0 && ", "}
                  <a href={`/app/pr/${promptId}/runs/${other.id}`}>
                    {other.model === run.model
                      ? runVersionWords(other, versionsByN).replace("Ran ", "")
                      : (catalogueModel(other.model)?.name ?? other.model)}
                  </a>
                </span>
              ))}
            </>
          )}
        </p>
      </header>

      {/* Asks the server for this page again while the run is in flight. No reload, no navigation. */}
      <Progress
        inFlight={inFlight}
        completed={run.completedInputs}
        total={run.totalInputs}
        partnersInFlight={partnersInFlight}
      />

      <KpiStrip
        items={[
          {
            key: "pass",
            title: "Pass rate",
            value: graded === 0 ? "—" : `${Math.round((summary.passed / graded) * 100)}%`,
            sub: graded === 0 ? "nothing graded" : `${summary.passed} of ${graded} graded`,
          },
          {
            key: "inputs",
            title: "Inputs",
            value: `${run.completedInputs}`,
            sub: `of ${run.totalInputs}`,
          },
          { key: "calls", title: "Calls", value: `${run.calls}`, sub: `${run.cachedCalls} from cache` },
          { key: "cost", title: "Cost", value: formatCents(run.costCents), sub: "spend on this run" },
          {
            key: "model",
            title: "Model",
            // The name a person reads, with the raw pinned id beneath it — rule 7 is about the id
            // being answerable, not about it being the thing on screen.
            value: catalogueModel(run.model)?.name ?? run.model,
            sub: run.model,
          },
        ]}
      />

      <section className="runs-said" aria-label="What this run verified">
        <p className="runs-headline">{said.headline}</p>
        {said.failures !== undefined && <p className="runs-sentence">{said.failures}</p>}
        {/* Its own sentence, by requirement. Never folded into a pass, and never shown by colour. */}
        {said.notChecked !== undefined && (
          <p className="runs-sentence" data-testid="not-checked">
            {said.notChecked}
          </p>
        )}
        <p className="runs-sentence" data-testid="cost-sentence">
          {costSentence(run)}
        </p>
        {/* The judge's spend, next to the cost it qualifies rather than as a sixth KPI tile — it is
            a caveat on that number, not a number of its own. Absent entirely when nothing was
            judged, because "$0.00 on the judge" invites a reader to work out why. */}
        {judgeCostSentence(run) !== undefined && (
          <p className="runs-sentence" data-testid="judge-cost-sentence">
            {judgeCostSentence(run)}
          </p>
        )}
      </section>

      {comparison !== undefined && (
        <ProviderMatrix
          promptId={promptId}
          columns={matrixColumns}
          rows={matrixRows(
            comparison.map((entry) => ({
              runId: entry.run.id,
              model: entry.run.model,
              state: entry.run.state,
              checks: entry.checks,
              results: entry.results,
            })),
          )}
        />
      )}

      {/* The two pivots (EPIC-042). "By check" is what this page has always shown and stays the
          default: the question a person arrives with is "which of my rules is failing", and "by
          input" is the one they reach for once they know. */}
      <Pivots
        byCheck={
          <Results
            promptId={promptId}
            rows={rows}
            columns={inputSet?.columns ?? []}
            inputRows={inputSet?.rows ?? []}
            outputs={Object.fromEntries([...outputs].map(([id, text]) => [id, text ?? null]))}
          />
        }
        byInput={<Heatmap rows={heat} columns={inputSet?.columns ?? []} inputRows={inputSet?.rows ?? []} />}
      />
    </main>
  );
}

/**
 * Send `run_passed` once, carrying how long it took from signup.
 *
 * Failures here are swallowed on purpose: a page that would not render because an analytics write
 * went wrong is a worse product than one whose funnel has a hole. `captureAccountEvent` already
 * refuses without consent, and honours `DNT` and `Sec-GPC`.
 */
async function notePassed(suiteRunId: string, owner: string, at: Date): Promise<void> {
  try {
    const db = getDb();
    if (!(await claimPassedNotification(db, suiteRunId, owner, at))) return;

    const [user] = await db
      .select({ createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, owner))
      .limit(1);
    if (user === undefined) return;

    await captureAccountEvent(owner, "run_passed", {
      // The roadmap defines "activated" as a first passing run within five minutes of signup, so
      // this is the number that definition needs. Computed from `users.createdAt` rather than from
      // anything a client could be wrong about.
      secondsFromSignup: secondsFromSignup(user.createdAt, at),
    });
  } catch {
    // See above.
  }
}
