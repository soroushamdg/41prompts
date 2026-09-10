"use client";

import { Tag } from "@41prompts/ui";
import type { FindingView } from "@/lib/decompile/view-model";

/**
 * The findings panel.
 *
 * Two things govern its shape:
 *
 * **Epic decision 5 / EPIC-012b ruling 4.** `rule_without_check` is the call to action, not one
 * finding among many. It sits in its own section at the foot, headed by a single line naming how many
 * rules nothing checks — which is `uncheckedRuleTotal`, not the number of rows below it, because the
 * detector caps what it lists. It closes the panel; it does not crowd it.
 *
 * **Epic decision 4.** Severity carries no colour. Green, red and amber mean pass, fail and drift and
 * appear nowhere in this epic — findings are not pass/fail. The decompiler prototype paints `high`
 * with `--fail` and `med` with `--warn`; that is the one place its visual design is not followed.
 * Severity travels by position (the panel is already in `detect()`'s order, severity first), by
 * weight, and by a word.
 */

export interface FindingsPanelProps {
  readonly findings: readonly FindingView[];
  readonly uncheckedRules: readonly FindingView[];
  readonly uncheckedRuleTotal: number;
  readonly activeBlokId: string | null;
  readonly pinnedBlokId: string | null;
  readonly onHover: (blokId: string | null) => void;
  readonly onPin: (blokId: string) => void;
  readonly onUnpin: () => void;
}

function FindingRow({
  finding,
  active,
  pinned,
  onHover,
  onPin,
  onUnpin
}: {
  finding: FindingView;
  active: boolean;
  pinned: boolean;
  onHover: (blokId: string | null) => void;
  onPin: (blokId: string) => void;
  onUnpin: () => void;
}) {
  const target = finding.blokIds[0];
  return (
    <li>
      <button
        type="button"
        className="finding"
        data-severity={finding.severity}
        data-selected={active || pinned ? "true" : undefined}
        aria-pressed={pinned}
        onMouseEnter={() => target && onHover(target)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => target && onHover(target)}
        onBlur={() => onHover(null)}
        onClick={() => {
          if (!target) return;
          if (pinned) onUnpin();
          else onPin(target);
        }}
      >
        <span className="finding-top">
          <span className="finding-severity">{finding.severity}</span>
          {/*
            EPIC-012a's presentation debt. A `repeated` finding reports the pair clustering
            *refused*, which by construction is a pair whose kinds differ — so "these two bloks say
            the same thing" reads as a mistake unless the card shows that one is context and the
            other a constraint.
          */}
          {finding.blokKinds.map((kind) => (
            <Tag key={kind}>{kind}</Tag>
          ))}
        </span>
        <span className="finding-message">{finding.message}</span>
        {finding.suggestion && <span className="finding-suggestion">{finding.suggestion}</span>}
      </button>
    </li>
  );
}

function uncheckedHeading(total: number): string {
  return total === 1 ? "One rule here has no check." : `${total} rules here have no check.`;
}

export function FindingsPanel({
  findings,
  uncheckedRules,
  uncheckedRuleTotal,
  activeBlokId,
  pinnedBlokId,
  onHover,
  onPin,
  onUnpin
}: FindingsPanelProps) {
  const rowProps = (finding: FindingView) => ({
    finding,
    active: activeBlokId !== null && finding.blokIds.includes(activeBlokId),
    pinned: pinnedBlokId !== null && finding.blokIds.includes(pinnedBlokId),
    onHover,
    onPin,
    onUnpin
  });

  if (findings.length === 0 && uncheckedRules.length === 0) {
    return (
      <section className="findings" aria-labelledby="findings-heading">
        <h2 id="findings-heading" className="eyebrow decompile-section-heading">
          Findings
        </h2>
        <p className="findings-none">Nothing to report. Six checks ran over this prompt and none of them fired.</p>
      </section>
    );
  }

  return (
    <section className="findings" aria-labelledby="findings-heading">
      <h2 id="findings-heading" className="eyebrow decompile-section-heading">
        Findings
      </h2>

      {findings.length > 0 && (
        <ul className="finding-list">
          {findings.map((finding) => (
            <FindingRow key={finding.id} {...rowProps(finding)} />
          ))}
        </ul>
      )}

      {uncheckedRules.length > 0 && (
        <section className="findings-closing" aria-labelledby="unchecked-heading">
          <h3 id="unchecked-heading" className="findings-closing-heading">
            {uncheckedHeading(uncheckedRuleTotal)}
          </h3>
          <ul className="finding-list">
            {uncheckedRules.map((finding) => (
              <FindingRow key={finding.id} {...rowProps(finding)} />
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
