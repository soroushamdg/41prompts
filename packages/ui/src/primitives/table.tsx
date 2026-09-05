import type { ReactNode } from "react";

export interface TableColumn<Row> {
  key: string;
  header: ReactNode;
  render: (row: Row) => ReactNode;
}

export interface TableProps<Row> {
  columns: TableColumn<Row>[];
  rows: Row[];
  getRowKey: (row: Row) => string;
  /** Rows with `status === "fail"` get the fail-tinted row background from the mockup's `.bad`. */
  getRowStatus?: (row: Row) => "fail" | undefined;
  caption: string;
}

/** Data surface: hairline border, no shadow, no radius (decision 2). */
export function Table<Row>({ columns, rows, getRowKey, getRowStatus, caption }: TableProps<Row>) {
  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getRowKey(row)} data-status={getRowStatus?.(row)}>
              {columns.map((column) => (
                <td key={column.key}>{column.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
