import type { PostDetailDto } from "../../../shared/post-types";
import { formatNumber, formatPercent } from "../../lib/format";

export function PerformanceCard({ post: p, baseline }: Pick<PostDetailDto, "post" | "baseline">) {
  return (
    <div className="card">
      <h2>Performance</h2>
      <table>
        <tbody>
          <MetricRow
            label="Impressions"
            value={formatNumber(p.metrics.impressions)}
            baseline={formatNumber(baseline.medianImpressions)}
          />
          <MetricRow
            label="Engagements"
            value={formatNumber(p.metrics.engagements)}
            baseline={formatNumber(baseline.medianEngagements)}
          />
          <MetricRow
            label="Engagement rate"
            value={formatPercent(p.metrics.engagementRate)}
            baseline={formatPercent(baseline.medianEngagementRate)}
          />
          <MetricRow label="Reactions" value={formatNumber(p.metrics.reactions)} />
          <MetricRow label="Comments" value={formatNumber(p.metrics.comments)} />
          <MetricRow label="Reposts" value={formatNumber(p.metrics.reposts)} />
        </tbody>
      </table>
      <p className="muted small">
        Typical is the median of your other {baseline.withMetrics} posts with metrics.
      </p>
    </div>
  );
}

function MetricRow({
  label,
  value,
  baseline,
}: {
  label: string;
  value: string;
  baseline?: string;
}) {
  return (
    <tr>
      <th>{label}</th>
      <td className="num">
        <strong>{value}</strong>
      </td>
      <td className="num muted small">{baseline ? `typical ${baseline}` : ""}</td>
    </tr>
  );
}
