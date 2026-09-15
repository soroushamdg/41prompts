import { KpiStrip } from "@41prompts/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { outputFor, runDetailFor } from "@/lib/runs/queries";
import {
  checkRows,
  costSentence,
  formatCents,
  judgeCostSentence,
  stateWords,
  summaryOf,
  verification,
} from "@/lib/runs/view";
import { requireSession } from "@/lib/session";
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

  const { run, checks, results, inputSet } = detail;
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
      </header>

      {/* Asks the server for this page again while the run is in flight. No reload, no navigation. */}
      <Progress inFlight={inFlight} completed={run.completedInputs} total={run.totalInputs} />

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
          { key: "model", title: "Model", value: run.model, sub: "pinned" },
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

      <Results
        promptId={promptId}
        rows={rows}
        columns={inputSet?.columns ?? []}
        inputRows={inputSet?.rows ?? []}
        outputs={Object.fromEntries([...outputs].map(([id, text]) => [id, text ?? null]))}
      />
    </main>
  );
}
