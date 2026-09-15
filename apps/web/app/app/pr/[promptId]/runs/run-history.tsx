import type { SuiteRunRow } from "@41prompts/db";
import { NoRunsIllustration, StatusIcon } from "@41prompts/ui";
import { formatCents, stateWords } from "@/lib/runs/view";

/**
 * Run history: newest first, with what each run is or was.
 *
 * **A refused run is legible as refused**, in words, on the row — not by its absence from a list of
 * successes and not by a colour. The icon is beside the words rather than instead of them
 * (`CLAUDE.md` rule 10); a run still in flight has neither, because it is not yet either thing.
 */
export function RunHistory({
  promptId,
  runs,
  verdicts,
}: {
  promptId: string;
  runs: SuiteRunRow[];
  /** Per run: whether every check that ran passed, and whether anything was graded at all. */
  verdicts: Record<string, { total: number; failed: number }>;
}) {
  return (
    <section className="runs-panel" aria-label="Run history">
      <h2>Run history</h2>

      {runs.length === 0 ? (
        <div className="app-empty runs-empty">
          <NoRunsIllustration />
          <p>Nothing has been run yet. Upload a CSV above and run it.</p>
        </div>
      ) : (
        <ul className="runs-history">
          {runs.map((run) => (
            <li key={run.id} data-state={run.state}>
              <a href={`/app/pr/${promptId}/runs/${run.id}`}>
                <span className="runs-history-when">{run.createdAt.toISOString().slice(0, 16).replace("T", " ")}</span>
                <span className="runs-history-state">
                  {/* **The icon is about the checks, not about the job finishing** (EPIC-034).
                      This row used to show a pass tick for any run that reached `done` without a
                      refusal — so a run where a rule failed was decorated with a ✓, on a product
                      whose entire argument is that it tells you when something failed. A run that
                      graded nothing gets no icon at all rather than a tick it did not earn. */}
                  {run.state === "refused" && <StatusIcon status="fail" />}
                  {run.state === "done" && (verdicts[run.id]?.failed ?? 0) > 0 && <StatusIcon status="fail" />}
                  {run.state === "done" &&
                    (verdicts[run.id]?.failed ?? 0) === 0 &&
                    (verdicts[run.id]?.total ?? 0) > 0 && <StatusIcon status="pass" />}
                  {stateWords(run)}
                </span>
                <span className="runs-history-meta">
                  {run.model} · {formatCents(run.costCents)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
