import type { KpiDto } from "../../../shared/analytics-types";
import { changeDirection, formatChange, formatPeriod, formatValue } from "../../lib/format";

export function KpiTile({ kpi }: { kpi: KpiDto }) {
  const change = formatChange(kpi.change.percent);
  const { observedDays, totalDays } = kpi.coverage;
  return (
    <div className="card" title={`Source: ${kpi.source}`}>
      <div className="kpi-label">{kpi.label}</div>
      <div className={`kpi-value${kpi.value === null ? " unknown" : ""}`}>
        {formatValue(kpi.value, kpi.unit)}
      </div>
      {change && (
        <div className={`delta ${changeDirection(kpi.change.percent)}`}>
          {change} <span className="muted small">vs previous {totalDays} days</span>
        </div>
      )}
      <div className="muted small">
        {formatPeriod(kpi.period)}
        {kpi.value !== null &&
          observedDays < totalDays &&
          ` (data for ${observedDays} of ${totalDays} days)`}
      </div>
    </div>
  );
}
