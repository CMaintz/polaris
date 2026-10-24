import { useState } from "react";
import type { CampaignDto, CampaignFunnelDto } from "../../../shared/strategy-types";
import { formatPeriod } from "../../lib/format";
import { useResource } from "../../lib/hooks/resource";
import { Empty } from "../common/layout";
import { ResourceView } from "../common/resource-view";
import { FunnelStep } from "./funnel-step";

export function CampaignFunnel() {
  const campaigns = useResource<{ items: CampaignDto[] }>("/strategy/campaigns");
  const [id, setId] = useState("");
  const funnel = useResource<CampaignFunnelDto>(id ? `/strategy/campaigns/${id}/funnel` : null);
  const items = campaigns.data?.items ?? [];
  if (campaigns.data && items.length === 0) {
    return (
      <Empty title="No campaigns yet">
        Create a campaign to see its funnel over the campaign window.
      </Empty>
    );
  }
  return (
    <section className="card stack" aria-label="Campaign funnel">
      <header className="row">
        <h2>Campaign funnel</h2>
        <select aria-label="Campaign" value={id} onChange={(e) => setId(e.target.value)}>
          <option value="">Choose a campaign</option>
          {items.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </header>
      {id && (
        <ResourceView resource={funnel}>
          {(f) =>
            f.step ? (
              <>
                <p className="small secondary">{formatPeriod(f.step)}</p>
                <FunnelStep step={f.step} />
              </>
            ) : (
              <p className="muted">
                This campaign has not started yet, so there is nothing to measure.
              </p>
            )
          }
        </ResourceView>
      )}
    </section>
  );
}
