"use client";
import { useEffect, useRef } from "react";
import { Icon } from "@/components/icon";
import { cx } from "@/lib/cx";
import { drawPath, prepPath } from "../_motion/draw-path";
import { revealClass, useReveal } from "../_motion/use-reveal";
import s from "../landing.module.css";

/* The Free plan drawn as a bill of materials (Sheet 03). QTY ∞ = unlimited.
   On reveal the rows cascade every 55 ms and each ∞ mark draws itself.
   Item numbers match docs/FEATURES.md. */

const INF = "inf";
const ROWS: ReadonlyArray<readonly [item: string, part: string, qty: string, notes: string]> = [
  ["M01", "Account", "1", "Email link, Google or GitHub. No card."],
  ["M02", "Prompts", INF, "Paste one in or start blank."],
  ["M03", "Bloks per prompt", INF, "Context, constraint, example, expects."],
  ["M04", "Compiled prompt, one-click copy", INF, "As a template, or with variables filled."],
  ["M05", "Versions", INF, "Every save is a version. Restore in one click."],
  ["M06", "Run on one model", INF, "With your own key. The provider bills you directly."],
  ["M07", "Model keys", "3", "OpenAI, Anthropic, Google. Encrypted at rest."],
  ["M08", "Library with search by name", "1", "Private by default."],
  ["M09", "Export everything", INF, "Markdown and JSON in one .zip."],
  ["M10", "Delete account", "1", "Removes every prompt, version and key."],
];

type Vars = React.CSSProperties & Record<`--${string}`, string | number>;

export function Bom({ startHref, showPrice }: { startHref: string; showPrice: boolean }) {
  const tableRef = useRef<HTMLTableElement>(null);
  const { ref, revealed } = useReveal<HTMLDivElement>({
    onReveal: () => {
      tableRef.current?.querySelectorAll<SVGPathElement>(`.${s.inf} path`).forEach((p, i) => drawPath(p, 1300, 350 + i * 110));
    },
  });

  // Hide the ∞ strokes until the sheet is revealed.
  useEffect(() => {
    if (revealed) return;
    tableRef.current?.querySelectorAll<SVGPathElement>(`.${s.inf} path`).forEach((p) => prepPath(p));
  }, [revealed]);

  return (
    <div ref={ref} className={cx(s.bom, "frame frame--live", revealClass("scale", revealed))} data-reveal="scale">
      <div className={s.bomHead}>
        <span className="label">Bill of materials</span>
        <span className="label">Plan · Free</span>
        {showPrice && <span className="label">Price · $0</span>}
      </div>
      <div className={s.bomScroll}>
        <table className={s.bomTable} ref={tableRef}>
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">Part</th>
              <th scope="col">Qty</th>
              <th scope="col">Notes</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([item, part, qty, notes], r) => (
              <tr key={item} style={{ "--r": r } as Vars}>
                <td className="mono">{item}</td>
                <td>{part}</td>
                <td className={s.qty}>
                  {qty === INF ? (
                    <svg className={s.inf} viewBox="0 0 24 12" role="img" aria-label="Unlimited">
                      <path d="M12 6C9.5 2 3 2 3 6s6.5 4 9 0 9-4 9 0-6.5 4-9 0z" />
                    </svg>
                  ) : (
                    qty
                  )}
                </td>
                <td>{notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={s.bomFoot}>
        <span className="titleblock">
          <span>41prompts</span>
          <span>Sheet 03</span>
          <span>Free plan</span>
        </span>
        <a className="btn btn--primary btn--go" href={startHref}>
          Start free <Icon name="arrow-right" />
        </a>
      </div>
    </div>
  );
}
