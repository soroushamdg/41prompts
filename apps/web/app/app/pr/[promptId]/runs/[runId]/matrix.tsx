import { StatusIcon, Tag } from "@41prompts/ui";
import type { MatrixColumn, MatrixRow } from "@/lib/runs/view";

/**
 * The provider matrix: a row per check, a column per run in this comparison.
 *
 * ## It is on the run page rather than on a page of its own
 *
 * Every run in a comparison is a real run with its own results, its own cost and its own history
 * row. Landing on any one of them is landing on the comparison, so the table appears on each —
 * which is also what makes it reachable from the Runs list without a second kind of link.
 *
 * ## No colour carries a verdict on its own
 *
 * `CLAUDE.md` rule 10. Every cell has a glyph and its counts in words, and a cell nothing could
 * grade has neither a colour nor a rate — painting it green would claim evidence that does not
 * exist, and red would fail a prompt for being simple.
 *
 * A server component: it renders rows that were computed on the server from rows that were read on
 * the server, and nothing here is interactive beyond a link.
 */
export function ProviderMatrix({
  promptId,
  columns,
  rows,
}: {
  promptId: string;
  columns: MatrixColumn[];
  rows: MatrixRow[];
}) {
  return (
    <section className="runs-panel" aria-label="Every provider, by check">
      <h2>Every provider</h2>
      <p className="runs-note">
        The same prompt and the same inputs, run once at each provider you have a key for. Each
        column is a run of its own.
      </p>
      <div className="matrix-scroll">
        <table className="matrix">
          <caption className="sr-only">
            Each check, and how it fared at each provider in this comparison
          </caption>
          <thead>
            <tr>
              <th scope="col">Check · owning blok</th>
              {columns.map((column) => (
                <th scope="col" key={column.runId}>
                  {column.isCurrent ? (
                    <span aria-current="true">
                      {column.providerTitle}
                      <span className="matrix-model">{column.modelName}</span>
                      <span className="matrix-here">this run</span>
                    </span>
                  ) : (
                    <a href={`/app/pr/${promptId}/runs/${column.runId}`}>
                      {column.providerTitle}
                      <span className="matrix-model">{column.modelName}</span>
                    </a>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.checkId}>
                <th scope="row">
                  <Tag>{row.blokKind}</Tag> <b>{row.phrase}</b>
                  <span className="matrix-blok">{row.blokText}</span>
                </th>
                {row.cells.map((cell) => (
                  <td key={cell.runId} data-status={cell.status ?? "not-checked"}>
                    {cell.status !== undefined && <StatusIcon status={cell.status} />}
                    <span>{cell.words}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
