"use client";

import { Button, Input } from "@41prompts/ui";
import { useState } from "react";

/**
 * Inputs typed into the product, instead of uploaded as a file (EPIC-032a).
 *
 * ## The columns are given, never typed
 *
 * One per declared variable, in declaration order, handed down from the server. A grid whose
 * columns are derived cannot name a column that matches no variable and cannot omit a required one
 * — the two refusals that cost an upload its entire file become states this surface cannot reach
 * (decision 2). The server still checks, because the two writers must not be able to diverge.
 *
 * ## Plain inputs, no roving tabindex, no drag
 *
 * Every cell is a real `<input>` in document order, so Tab already walks the grid and a screen
 * reader already announces the column from the header association. A roving tabindex would make
 * this feel like a spreadsheet and would take the arrow keys away from text editing inside a cell,
 * which is the thing a person is actually doing here. `CLAUDE.md` rule 12: keyboard and touch, and
 * nothing that only works by dragging.
 *
 * ## It holds a rectangle, and it is the only thing that does
 *
 * Rows are always `columns.length` wide in state, so `ragged_row` cannot originate here. Core still
 * has the rule and a test for it, because "cannot happen" is a claim about today's caller.
 */
export function ByHandGrid({
  columns,
  initialName,
  initialRows,
  pending,
  submitWord,
  onCancel,
  onSubmit,
}: {
  columns: readonly string[];
  initialName: string;
  initialRows: readonly (readonly string[])[];
  pending: boolean;
  /** "Save" when creating, "Save changes" when editing — the caller knows which it is. */
  submitWord: string;
  onCancel?: () => void;
  onSubmit: (input: { name: string; rows: string[][] }) => void;
}) {
  const blank = (): string[] => columns.map(() => "");
  const [name, setName] = useState(initialName);
  const [rows, setRows] = useState<string[][]>(
    initialRows.length > 0 ? initialRows.map((row) => [...row]) : [blank()]
  );

  function setCell(rowIndex: number, columnIndex: number, value: string) {
    setRows((current) =>
      current.map((row, r) => (r === rowIndex ? row.map((cell, c) => (c === columnIndex ? value : cell)) : row))
    );
  }

  return (
    <div className="runs-byhand" data-testid="by-hand">
      <label className="runs-byhand-name">
        <span>Name</span>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="What these inputs are"
          data-testid="by-hand-name"
        />
      </label>

      <table className="runs-grid">
        <caption className="sr-only">
          One column per variable this prompt declares, and one row per input.
        </caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            // The index is the identity on purpose: these rows have no id, and a key derived from
            // the contents would remount a cell the moment somebody typed in it, losing the caret.
            <tr key={rowIndex}>
              {columns.map((column, columnIndex) => (
                <td key={column}>
                  <Input
                    aria-label={`${column}, row ${rowIndex + 1}`}
                    value={row[columnIndex] ?? ""}
                    onChange={(event) => setCell(rowIndex, columnIndex, event.target.value)}
                    data-testid={`cell-${rowIndex}-${columnIndex}`}
                  />
                </td>
              ))}
              <td>
                <Button
                  size="sm"
                  // A one-row grid keeps its row: removing it would leave nothing to type into and
                  // an "Add row" as the only way back, which is a dead end wearing a button.
                  disabled={pending || rows.length === 1}
                  onClick={() => setRows((current) => current.filter((_, r) => r !== rowIndex))}
                >
                  Remove row {rowIndex + 1}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="runs-byhand-actions">
        <Button size="sm" disabled={pending} onClick={() => setRows((current) => [...current, blank()])}>
          Add row
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={pending}
          onClick={() => onSubmit({ name, rows })}
          data-testid="by-hand-save"
        >
          {submitWord}
        </Button>
        {onCancel !== undefined && (
          <Button size="sm" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
