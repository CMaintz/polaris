import { useState } from "react";
import type { CampaignDto } from "../../../shared/strategy-types";
import { del } from "../../lib/api";
import { formatPeriod } from "../../lib/format";
import { useMutation } from "../../lib/hooks/mutation";
import { ErrorBox } from "../common/feedback";
import { LinkPicker } from "./campaign-links";
import { CampaignPerformance } from "./campaign-performance";
import { CAMPAIGN_STATUS } from "./campaign-status";

type Panel = "links" | "performance" | null;

export function CampaignCard(props: {
  campaign: CampaignDto;
  onEdit: () => void;
  onChange: () => void;
}) {
  const { campaign: c, onEdit, onChange } = props;
  const [panel, setPanel] = useState<Panel>(null);
  const remove = useMutation(() => del(`/strategy/campaigns/${c.id}`), onChange);
  const linked = c.links.postIds.length + c.links.planItemIds.length + c.links.goalIds.length;
  const show = (p: Panel) => setPanel(panel === p ? null : p);
  return (
    <article className="card stack">
      <header>
        <h2>{c.name}</h2>
        <span className="badge">{CAMPAIGN_STATUS[c.status]}</span>
      </header>
      <div className="small secondary">
        {formatPeriod({ from: c.startDate, to: c.endDate })}. {linked} links.
        {c.objective && ` Objective: ${c.objective}`}
      </div>
      <div className="row">
        <button className="btn small" onClick={() => show("performance")}>
          Performance
        </button>
        <button className="btn small" onClick={() => show("links")}>
          Links
        </button>
        <button className="btn small" onClick={onEdit}>
          Edit
        </button>
        <button className="btn small danger" disabled={remove.busy} onClick={() => remove.run()}>
          Delete
        </button>
      </div>
      <ErrorBox error={remove.error} />
      {panel === "links" && <LinkPicker campaign={c} onSaved={onChange} />}
      {panel === "performance" && <CampaignPerformance campaignId={c.id} />}
    </article>
  );
}
