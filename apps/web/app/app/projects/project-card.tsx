import type { ReactNode } from "react";
import type { ProjectListItem } from "@/lib/canvas/queries";

/**
 * One card in the mockup's project grid (lines 1090–1110).
 *
 * ## Every number is derived, and an em dash is a real answer
 *
 * The mockup draws `Pass 81.7% · Runs 482 · Cost $0.37` on all six of its cards, because all six
 * are invented. A project that has never been run has none of those, and `0%` beside `$0.00` reads
 * as *this was run and it went badly* rather than *this has not been run*. So the card prints `—`,
 * and `lib/canvas/metrics.ts` returns `undefined` rather than zeroes to make that the only thing it
 * can print.
 *
 * **Pass is three states, not two.** A finished run whose checks could none of them be graded
 * scored *nothing*, which EPIC-030 was careful to keep distinct from scoring zero — so
 * `passRate: null` says "not graded" in words rather than borrowing the em dash that means "never
 * run".
 *
 * ## The pass rate is the only coloured thing here, and it is not colour alone
 *
 * `CLAUDE.md` rule 10: green, red and amber mean pass, fail and drift, and pass/fail is never shown
 * by colour alone. The figure is the signal; the tint follows it. A reader who cannot see the tint
 * reads the same number.
 */

/** The mockup's own thresholds, read off its six cards: 96.4 and 99.1 green, 84.0 amber, 62.0 red. */
function rateTone(rate: number): "pass" | "drift" | "fail" {
  if (rate >= 0.95) return "pass";
  if (rate >= 0.8) return "drift";
  return "fail";
}

// `caption`, not `label`: ADR-003 forbids that word and `pnpm forbidden-words` reads identifiers
// as well as strings, which is the point — a name leaks into a class, a test and a conversation.
function Metric({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <span className="proj-metric">
      <span className="proj-metric-key">{caption}</span>
      <span className="proj-metric-value">{children}</span>
    </span>
  );
}

export function ProjectCard({ project }: { project: ProjectListItem }) {
  const { runs, costCents, passRate } = project.metrics;

  return (
    <li className="proj">
      {/* The whole card is not a link: a link wrapping a metric row reads every number as part of
          the link's name. The heading carries it, and the card's padding makes the target big. */}
      <h2 className="proj-name">
        <a href={`/app/p/${project.id}`}>{project.name}</a>
      </h2>
      <p className="proj-sub">
        {project.prompts === 1 ? "1 prompt" : `${project.prompts} prompts`}
      </p>

      <div className="proj-metrics">
        <Metric caption="Pass">
          {passRate === undefined ? (
            <span className="proj-metric-none">—</span>
          ) : passRate === null ? (
            <span className="proj-metric-none">not graded</span>
          ) : (
            <span data-tone={rateTone(passRate)}>{(passRate * 100).toFixed(1)}%</span>
          )}
        </Metric>
        <Metric caption="Runs">
          {runs === undefined ? (
            <span className="proj-metric-none">—</span>
          ) : (
            runs.toLocaleString("en-US")
          )}
        </Metric>
        <Metric caption="Cost">
          {costCents === undefined ? (
            <span className="proj-metric-none">—</span>
          ) : (
            `$${(costCents / 100).toFixed(2)}`
          )}
        </Metric>
      </div>
    </li>
  );
}
