import { DataTable } from "../common/data-table";

export function ChartLegend({ items }: { items: [colour: string, label: string][] }) {
  return (
    <div className="legend" aria-hidden>
      {items.map(([colour, label]) => (
        <span key={label}>
          <i style={{ background: colour }} />
          {label}
        </span>
      ))}
    </div>
  );
}

/** Every chart has a table view, so no value is reachable only by hovering. */
export function TableView({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <details>
      <summary>View as table</summary>
      <DataTable headers={headers} rows={rows} />
    </details>
  );
}
