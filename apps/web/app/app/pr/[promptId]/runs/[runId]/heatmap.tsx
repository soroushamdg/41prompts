"use client";

import { StatusIcon } from "@41prompts/ui";
import { useRef, useState, type KeyboardEvent } from "react";
import type { HeatRow } from "@/lib/runs/view";

/**
 * Results **by input**: one row per check, one cell per input.
 *
 * ## Every cell is a real `button`
 *
 * `docs/design/README.md` lists this among the things the prototypes get wrong and the build must
 * get right: "heatmap cells as focusable, labelled buttons with a shape difference". So they are
 * `<button>` elements with an accessible name of the form `input 17, fail`, and **not**
 * `role="gridcell"` — which would override the very role that sentence names.
 *
 * Row context comes from a `role="group"` per row carrying the check's phrase, so a screen-reader
 * user hears which rule a cell belongs to without the cell's own name having to repeat it.
 *
 * ## One tab stop, arrows inside
 *
 * A hundred inputs by six checks is six hundred cells. Six hundred tab stops is not keyboard access,
 * it is a keyboard trap with extra steps. So the grid is a roving tabindex: Tab reaches it once,
 * arrows move within and between rows, Home and End go to the ends of a row, and Enter or Space
 * opens the cell — which is what a `button` does natively.
 *
 * ## `CLAUDE.md` rule 10
 *
 * Green and red mean pass and fail, and **pass/fail is never shown by colour alone**. Three ways
 * here: the word is in every cell's accessible name, the cell carries a shape difference in CSS (a
 * failure is hatched, a pass is solid, an ungraded cell is hollow), and the opened detail says it in
 * words with a glyph. Amber appears nowhere; nothing in a heatmap is drift.
 */
export function Heatmap({
  rows,
  columns,
  inputRows,
}: {
  rows: HeatRow[];
  columns: string[];
  inputRows: string[][];
}) {
  const [focused, setFocused] = useState<{ row: number; cell: number }>({ row: 0, cell: 0 });
  const [open, setOpen] = useState<{ row: number; cell: number } | undefined>();
  const cellRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());

  if (rows.length === 0 || (rows[0]?.cells.length ?? 0) === 0) {
    return (
      <p className="app-empty">
        There is nothing to lay out by input: this run has no checks, or no input produced a result.
      </p>
    );
  }

  const width = rows[0]!.cells.length;

  function move(row: number, cell: number) {
    const nextRow = Math.max(0, Math.min(rows.length - 1, row));
    const nextCell = Math.max(0, Math.min(width - 1, cell));
    setFocused({ row: nextRow, cell: nextCell });
    cellRefs.current.get(`${nextRow}:${nextCell}`)?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, row: number, cell: number) {
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        move(row, cell + 1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        move(row, cell - 1);
        break;
      case "ArrowDown":
        event.preventDefault();
        move(row + 1, cell);
        break;
      case "ArrowUp":
        event.preventDefault();
        move(row - 1, cell);
        break;
      case "Home":
        event.preventDefault();
        move(row, 0);
        break;
      case "End":
        event.preventDefault();
        move(row, width - 1);
        break;
      default:
        break;
    }
  }

  const opened = open === undefined ? undefined : rows[open.row]?.cells[open.cell];

  return (
    <div className="heat-wrap">
      <p className="runs-note">
        {width} {width === 1 ? "input" : "inputs"} across {rows.length}{" "}
        {rows.length === 1 ? "check" : "checks"}. Move with the arrow keys; press Enter on a cell to
        see that input.
      </p>

      <div className="heat" data-testid="heatmap">
        {rows.map((row, rowIndex) => (
          <div className="heat-row" key={row.suiteCheckId} role="group" aria-label={row.phrase}>
            <span className="heat-rowlabel" title={row.blokText}>
              {row.phrase}
            </span>
            <div className="heat-cells">
              {row.cells.map((cell, cellIndex) => (
                <button
                  key={cell.inputIndex}
                  type="button"
                  ref={(node) => {
                    cellRefs.current.set(`${rowIndex}:${cellIndex}`, node);
                  }}
                  className="heat-cell"
                  data-status={cell.status ?? "not-checked"}
                  aria-label={cell.name}
                  aria-pressed={open?.row === rowIndex && open.cell === cellIndex}
                  // The roving tabindex: exactly one cell is in the tab order at a time.
                  tabIndex={focused.row === rowIndex && focused.cell === cellIndex ? 0 : -1}
                  onFocus={() => setFocused({ row: rowIndex, cell: cellIndex })}
                  onKeyDown={(event) => onKeyDown(event, rowIndex, cellIndex)}
                  onClick={() =>
                    setOpen(
                      open?.row === rowIndex && open.cell === cellIndex
                        ? undefined
                        : { row: rowIndex, cell: cellIndex },
                    )
                  }
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {opened !== undefined && open !== undefined && (
        <div className="heat-detail" data-testid="heat-detail">
          <h3>Input {opened.inputIndex + 1}</h3>
          <p className="heat-detail-verdict" data-status={opened.status ?? "not-checked"}>
            {opened.status !== undefined && <StatusIcon status={opened.status} />}
            <span>
              {rows[open.row]!.phrase}
              {" — "}
              {opened.status === undefined ? "nothing could be checked here" : opened.status === "pass" ? "passed" : "failed"}
            </span>
          </p>
          <p className="runs-note">{rows[open.row]!.blokText}</p>
          <dl className="runs-input">
            {columns.map((column, index) => (
              <div key={column}>
                <dt>{column}</dt>
                <dd>{inputRows[opened.inputIndex]?.[index] ?? ""}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
