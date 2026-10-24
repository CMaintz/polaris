import { useState } from "react";
import type { ComparisonDto } from "../../shared/account-types";
import type { KpiDto } from "../../shared/api-types";
import { PLATFORM_NAMES } from "../lib/accounts";
import { formatDate, formatPeriod, formatValue } from "../lib/format";
import { useResource } from "../lib/hooks";
import { ResourceView } from "../components/resource";
import { DataTable, Empty, PageHead } from "../components/ui";

const PERIODS = [7, 28, 90];

function KpiCell({ kpi }: { kpi: KpiDto | undefined }) {
  if (!kpi) return null;
  const { observedDays, totalDays } = kpi.coverage;
  return (
    <span title={`Source: ${kpi.source}`}>
      {formatValue(kpi.value, kpi.unit)}
      {kpi.value !== null && observedDays < totalDays && (
        <span className="muted small">
          {" "}
          ({observedDays}/{totalDays} days)
        </span>
      )}
    </span>
  );
}

function CompareTable({ data }: { data: ComparisonDto }) {
  const first = data.rows[0];
  if (!first) return <Empty title="No accounts yet" />;
  const keys = first.kpis.map((k) => k.key);
  const rows = data.rows.map(({ account, kpis }) => [
    <span key="account">
      {account.label} <span className="muted small">{PLATFORM_NAMES[account.platform]}</span>
    </span>,
    ...keys.map((key) => <KpiCell key={key} kpi={kpis.find((k) => k.key === key)} />),
  ]);
  return (
    <div className="card stack">
      <p className="small secondary">
        {formatPeriod(first.kpis[0]?.period)}, the same period for every account, ending on{" "}
        {formatDate(data.asOf)}. "Not available" means the account has no data for it, which is not
        the same as zero.
      </p>
      <DataTable headers={["Account", ...first.kpis.map((k) => k.label)]} rows={rows} />
    </div>
  );
}

export function ComparePage() {
  const [days, setDays] = useState(28);
  const data = useResource<ComparisonDto>(`/analytics/compare?days=${days}`);
  return (
    <div className="stack">
      <PageHead
        title="Compare accounts"
        intro="Headline figures for each of your accounts side by side."
        actions={
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            aria-label="Period"
          >
            {PERIODS.map((d) => (
              <option key={d} value={d}>
                Last {d} days
              </option>
            ))}
          </select>
        }
      />
      <ResourceView resource={data}>{(d) => <CompareTable data={d} />}</ResourceView>
    </div>
  );
}
