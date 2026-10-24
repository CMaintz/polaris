import { useState } from "react";
import type { PostPageDto } from "../../../shared/post-types";
import type { CampaignDto, CampaignLinksDto } from "../../../shared/strategy-types";
import { put } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { useMutation } from "../../lib/hooks/mutation";
import { useResource } from "../../lib/hooks/resource";
import { ErrorBox } from "../common/feedback";

type Kind = keyof CampaignLinksDto;

function toggle(links: CampaignLinksDto, kind: Kind, id: string): CampaignLinksDto {
  const current = links[kind];
  const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
  return { ...links, [kind]: next };
}

interface Option {
  id: string;
  label: string;
}

function Checklist(props: {
  title: string;
  options: Option[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const { title, options, selected, onToggle } = props;
  return (
    <fieldset className="stack">
      <legend>
        {title} ({selected.length} linked)
      </legend>
      {options.length === 0 && <p className="small muted">Nothing to link here yet.</p>}
      {options.map((o) => (
        <label key={o.id} className="row small">
          <input
            type="checkbox"
            checked={selected.includes(o.id)}
            onChange={() => onToggle(o.id)}
          />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}

const savelinks = (id: string, links: CampaignLinksDto) =>
  put(`/strategy/campaigns/${id}/links`, links);

function useLinkOptions(campaign: CampaignDto) {
  const posts = useResource<PostPageDto>(
    `/posts?from=${campaign.startDate}&to=${campaign.endDate}&sort=published&dir=asc&limit=100`,
  );
  const plan = useResource<{ items: { id: string; title: string }[] }>("/plan");
  const goals = useResource<{ items: { id: string; name: string }[] }>("/goals");
  return {
    error: posts.error ?? plan.error ?? goals.error,
    posts: (posts.data?.items ?? []).map((p) => ({
      id: p.id,
      label: `${formatDate(p.publishedAt, p.timeKnown)}: ${p.excerpt ?? "(no text)"}`.slice(0, 140),
    })),
    plan: (plan.data?.items ?? []).map((i) => ({ id: i.id, label: i.title })),
    goals: (goals.data?.items ?? []).map((g) => ({ id: g.id, label: g.name })),
  };
}

/** Posts are offered from the campaign window; a linked post outside it stays linked. */
export function LinkPicker({ campaign, onSaved }: { campaign: CampaignDto; onSaved: () => void }) {
  const [links, setLinks] = useState(campaign.links);
  const options = useLinkOptions(campaign);
  const mutation = useMutation(savelinks, onSaved);
  const flip = (kind: Kind) => (id: string) => setLinks(toggle(links, kind, id));
  return (
    <div className="stack">
      <ErrorBox error={options.error} />
      <Checklist
        title="Posts in the campaign window"
        options={options.posts}
        selected={links.postIds}
        onToggle={flip("postIds")}
      />
      <Checklist
        title="Plan items"
        options={options.plan}
        selected={links.planItemIds}
        onToggle={flip("planItemIds")}
      />
      <Checklist
        title="Goals"
        options={options.goals}
        selected={links.goalIds}
        onToggle={flip("goalIds")}
      />
      <ErrorBox error={mutation.error} />
      <div>
        <button
          className="btn primary"
          disabled={mutation.busy}
          onClick={() => mutation.run(campaign.id, links)}
        >
          Save links
        </button>
      </div>
    </div>
  );
}
