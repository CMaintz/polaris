import type { AudienceDto } from "../../shared/analytics-types";
import { formatDate, formatPercent } from "../lib/format";
import { TrendChart } from "../components/charts/trend-chart";
import { Pending } from "../components/common/feedback";
import { Empty, PageHead } from "../components/common/layout";
import { Meter } from "../components/common/meter";
import { useResource } from "../lib/hooks/resource";

export function AudiencePage() {
  const audience = useResource<AudienceDto>("/audience");
  const data = audience.data;
  if (!data) return <Pending error={audience.error} />;
  return (
    <div className="stack">
      <PageHead
        title="Audience"
        intro={
          data.observedOn
            ? `Who sees your content, as of ${formatDate(data.observedOn)}. Source: ${data.source}.`
            : "Who sees your content."
        }
      />
      <div className="grid two">
        <div className="card">
          <h2>Followers by week</h2>
          <TrendChart points={data.followers} label="Followers" />
        </div>
        <div className="card">
          <h2>New followers by week</h2>
          <TrendChart points={data.newFollowers} label="New followers" />
        </div>
      </div>
      {data.dimensions.length === 0 ? (
        <Empty title="No audience breakdown yet">
          <p>
            Import the LinkedIn analytics export (.xlsx) to see your audience by job title,
            location, industry and more.
          </p>
        </Empty>
      ) : (
        <div className="grid two">
          {data.dimensions.map((d) => (
            <div className="card" key={d.dimension}>
              <h2>{d.dimension}</h2>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }} className="stack">
                {d.segments.map((s) => (
                  <li key={s.value}>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <span>{s.value}</span>
                      <strong>{formatPercent(s.share)}</strong>
                    </div>
                    <Meter value={s.share} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
