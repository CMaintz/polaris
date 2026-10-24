import type { PostDetailDto } from "../../../shared/post-types";
import { formatDate, formatNumber, formatPeriod } from "../../lib/format";

export function ObservationTable({ observations }: Pick<PostDetailDto, "observations">) {
  if (observations.length === 0)
    return <p className="muted">No metrics have been imported for this post.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Observed</th>
            <th>Covers</th>
            <th>Source</th>
            <th className="num">Impressions</th>
            <th className="num">Engagements</th>
          </tr>
        </thead>
        <tbody>
          {observations.map((o) => (
            <tr key={`${o.observedOn}-${o.source}`}>
              <td>{formatDate(o.observedOn)}</td>
              <td className="small">{o.period ? formatPeriod(o.period) : "Lifetime to date"}</td>
              <td className="small">{o.source}</td>
              <td className="num">{formatNumber(o.metrics.impressions)}</td>
              <td className="num">{formatNumber(o.metrics.engagements)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
