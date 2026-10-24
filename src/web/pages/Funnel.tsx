import { useState } from "react";
import type { FunnelDto } from "../../shared/strategy-types";
import { useResource } from "../lib/hooks/resource";
import { PageHead } from "../components/common/layout";
import { ResourceView } from "../components/common/resource-view";
import { CampaignFunnel } from "../components/strategy/campaign-funnel";
import { PeriodFunnel, PeriodTable } from "../components/strategy/funnel-periods";

export function FunnelPage() {
  const [granularity, setGranularity] = useState<"week" | "month">("week");
  const funnel = useResource<FunnelDto>(`/strategy/funnel?granularity=${granularity}`);
  return (
    <div className="stack">
      <PageHead
        title="Funnel"
        intro="From impressions to engagements to new followers, with the conversion between each step. Rates use only days that report both figures."
        actions={
          <select
            aria-label="Granularity"
            value={granularity}
            onChange={(e) => setGranularity(e.target.value as "week" | "month")}
          >
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
        }
      />
      <ResourceView resource={funnel}>
        {(f) => (
          <>
            <PeriodFunnel key={granularity} funnel={f} />
            <section className="card stack" aria-label="All periods">
              <h2>All periods</h2>
              <PeriodTable funnel={f} />
            </section>
          </>
        )}
      </ResourceView>
      <CampaignFunnel />
    </div>
  );
}
