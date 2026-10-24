import { type FormEvent, useCallback, useState } from "react";
import type { PostPageDto } from "../../shared/api-types";
import type {
  CampaignDto,
  CampaignInput,
  CampaignLinksDto,
  CampaignStatusDto,
} from "../../shared/strategy-types";
import { del, patch, post, put } from "../lib/api";
import { formatDate, formatPeriod } from "../lib/format";
import { inDays, today } from "../lib/forms";
import { useResource } from "../lib/hooks";
import { useMutation } from "../lib/mutation";
import { ResourceView } from "../components/resource";
import { CampaignPerformance } from "../components/strategy";
import { DateRangeFields, Empty, ErrorBox, Field, LabelOptions, PageHead } from "../components/ui";

const STATUS: Record<CampaignStatusDto, string> = {
  planned: "Planned",
  active: "Active",
  done: "Done",
  cancelled: "Cancelled",
};

const blank = (): CampaignInput => ({
  name: "",
  objective: "",
  startDate: today(),
  endDate: inDays(30),
  status: "planned",
  notes: "",
});

function pick({
  name,
  objective,
  startDate,
  endDate,
  status,
  notes,
}: CampaignInput): CampaignInput {
  return { name, objective, startDate, endDate, status, notes };
}

interface FormProps {
  editing: CampaignDto | null;
  onSaved: () => void;
  onCancel: () => void;
}

function CampaignForm({ editing, onSaved, onCancel }: FormProps) {
  const [values, setValues] = useState(editing ? pick(editing) : blank());
  const save = useCallback(
    (v: CampaignInput) =>
      editing ? patch(`/strategy/campaigns/${editing.id}`, v) : post("/strategy/campaigns", v),
    [editing],
  );
  const mutation = useMutation(save, onSaved);
  const field = (key: keyof CampaignInput) => ({
    value: values[key],
    onChange: (e: { target: { value: string } }) => setValues({ ...values, [key]: e.target.value }),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    mutation.run(values);
  };
  return (
    <form className="card stack" onSubmit={submit}>
      <h2>{editing ? `Edit ${editing.name}` : "New campaign"}</h2>
      <div className="form-grid">
        <Field label="Name">
          <input required maxLength={200} {...field("name")} placeholder="Spring launch" />
        </Field>
        <Field label="Status">
          <select {...field("status")}>
            <LabelOptions labels={STATUS} />
          </select>
        </Field>
        <DateRangeFields start={field("startDate")} end={field("endDate")} />
      </div>
      <Field label="Objective">
        <input maxLength={2000} {...field("objective")} placeholder="Reach product leads" />
      </Field>
      <Field label="Notes">
        <textarea maxLength={5000} {...field("notes")} />
      </Field>
      <ErrorBox error={mutation.error} />
      <div className="row">
        <button className="btn primary" disabled={mutation.busy}>
          {editing ? "Save campaign" : "Add campaign"}
        </button>
        {editing && (
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

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

/** Posts are offered from the campaign window; a linked post outside it stays linked. */
function LinkPicker({ campaign, onSaved }: { campaign: CampaignDto; onSaved: () => void }) {
  const [links, setLinks] = useState(campaign.links);
  const posts = useResource<PostPageDto>(
    `/posts?from=${campaign.startDate}&to=${campaign.endDate}&sort=published&dir=asc&limit=100`,
  );
  const plan = useResource<{ items: { id: string; title: string }[] }>("/plan");
  const goals = useResource<{ items: { id: string; name: string }[] }>("/goals");
  const mutation = useMutation(savelinks, onSaved);
  const flip = (kind: Kind) => (id: string) => setLinks(toggle(links, kind, id));
  const postOptions = (posts.data?.items ?? []).map((p) => ({
    id: p.id,
    label: `${formatDate(p.publishedAt, p.timeKnown)}: ${p.excerpt ?? "(no text)"}`.slice(0, 140),
  }));
  return (
    <div className="stack">
      <ErrorBox error={posts.error ?? plan.error ?? goals.error} />
      <Checklist
        title="Posts in the campaign window"
        options={postOptions}
        selected={links.postIds}
        onToggle={flip("postIds")}
      />
      <Checklist
        title="Plan items"
        options={(plan.data?.items ?? []).map((i) => ({ id: i.id, label: i.title }))}
        selected={links.planItemIds}
        onToggle={flip("planItemIds")}
      />
      <Checklist
        title="Goals"
        options={(goals.data?.items ?? []).map((g) => ({ id: g.id, label: g.name }))}
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

type Panel = "links" | "performance" | null;

function CampaignCard(props: { campaign: CampaignDto; onEdit: () => void; onChange: () => void }) {
  const { campaign: c, onEdit, onChange } = props;
  const [panel, setPanel] = useState<Panel>(null);
  const remove = useMutation(() => del(`/strategy/campaigns/${c.id}`), onChange);
  const linked = c.links.postIds.length + c.links.planItemIds.length + c.links.goalIds.length;
  const show = (p: Panel) => setPanel(panel === p ? null : p);
  return (
    <article className="card stack">
      <header>
        <h2>{c.name}</h2>
        <span className="badge">{STATUS[c.status]}</span>
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
