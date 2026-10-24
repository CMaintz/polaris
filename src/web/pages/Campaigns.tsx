import { useCallback, useState } from "react";
import type { CampaignDto } from "../../shared/strategy-types";
import { useResource } from "../lib/hooks/resource";
import { Empty, PageHead } from "../components/common/layout";
import { ResourceView } from "../components/common/resource-view";
import { CampaignCard } from "../components/strategy/campaign-card";
import { CampaignForm } from "../components/strategy/campaign-form";

export function CampaignsPage() {
  const list = useResource<{ items: CampaignDto[] }>("/strategy/campaigns");
  const [editing, setEditing] = useState<CampaignDto | null>(null);
  const { reload } = list;
  const saved = useCallback(() => {
    setEditing(null);
    reload();
  }, [reload]);
  return (
    <div className="stack">
      <PageHead
        title="Campaigns"
        intro="Group posts, plan items and goals under one campaign and compare its posts with the same number of days before it."
      />
      <CampaignForm
        key={editing?.id ?? "new"}
        editing={editing}
        onSaved={saved}
        onCancel={() => setEditing(null)}
      />
      <ResourceView resource={list}>
        {({ items }) =>
          items.length === 0 ? (
            <Empty title="No campaigns yet">
              <p>Add a campaign above, then link the posts that belong to it to measure it.</p>
            </Empty>
          ) : (
            items.map((c) => (
              <CampaignCard
                key={c.id}
                campaign={c}
                onEdit={() => setEditing(c)}
                onChange={reload}
              />
            ))
          )
        }
      </ResourceView>
    </div>
  );
}
