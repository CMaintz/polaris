import { useState } from "react";
import { del, patch, post } from "../lib/api";
import { formatDate } from "../lib/format";
import { useForm } from "../lib/forms";
import { useResource } from "../lib/hooks";
import { Empty, ErrorBox, Field, Loading, PageHead } from "../components/ui";

interface PlanItem {
  id: string;
  title: string;
  concept: string;
  targetTopic: string;
  plannedDate: string | null;
  status: Status;
  draft: string;
  postId: string | null;
}

type Status = "idea" | "drafting" | "planned" | "published" | "dropped";

const COLUMNS: [Status, string][] = [
  ["idea", "Ideas"],
  ["drafting", "Drafting"],
  ["planned", "Planned"],
  ["published", "Published"],
];

const NEXT: Partial<Record<Status, Status>> = {
  idea: "drafting",
  drafting: "planned",
  planned: "published",
};

export function PlannerPage() {
  const list = useResource<{ items: PlanItem[] }>("/plan");
  const form = useForm({ title: "", concept: "", targetTopic: "", plannedDate: "" }, async (v) => {
    await post("/plan", {
      ...v,
      plannedDate: v.plannedDate || null,
      targetTopic: v.targetTopic.replace(/^#/, ""),
    });
    list.reload();
  });
  const items = list.data?.items ?? [];
  return (
    <div className="stack">
      <PageHead
        title="Planner"
        intro="Ideas, drafts and planned posts. Planning is not publishing: Polaris never posts to LinkedIn for you."
      />
      <form className="card stack" onSubmit={form.submit}>
        <h2>New idea</h2>
        <div className="form-grid">
          <Field label="Title">
            <input required maxLength={200} {...form.field("title")} />
          </Field>
          <Field label="Topic">
            <input maxLength={100} {...form.field("targetTopic")} placeholder="#leadership" />
          </Field>
          <Field label="Planned for">
            <input type="date" {...form.field("plannedDate")} />
          </Field>
        </div>
        <Field label="Concept">
          <textarea maxLength={5000} {...form.field("concept")} />
        </Field>
        <ErrorBox error={form.error} />
        <div>
          <button className="btn primary" disabled={form.busy}>
            Add
          </button>
        </div>
      </form>
      {!list.data ? (
        <Loading />
      ) : items.length === 0 ? (
        <Empty title="Nothing planned yet" />
      ) : (
        <div className="grid two">
          {COLUMNS.map(([status, label]) => (
            <section key={status} className="card stack" aria-label={label}>
              <h2>
                {label} ({items.filter((i) => i.status === status).length})
              </h2>
              {items
                .filter((i) => i.status === status)
                .map((item) => (
                  <PlanCard key={item.id} item={item} onChange={list.reload} />
                ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function PlanCard({ item, onChange }: { item: PlanItem; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.draft);
  const update = (values: Partial<PlanItem>) =>
    void patch(`/plan/${item.id}`, values).then(onChange);
  const next = NEXT[item.status];
  return (
    <article style={{ borderTop: "1px solid var(--grid)", paddingTop: 10 }}>
      <strong>{item.title}</strong>
      <div className="small muted">
        {item.plannedDate ? formatDate(item.plannedDate) : "No date"}
        {item.targetTopic && ` · #${item.targetTopic}`}
      </div>
      {item.concept && (
        <p className="small secondary" style={{ whiteSpace: "pre-wrap" }}>
          {item.concept}
        </p>
      )}
      {editing ? (
        <div className="stack">
          <textarea
            value={draft}
            maxLength={10000}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="Draft"
          />
          <div className="row">
            <button
              className="btn small primary"
              onClick={() => {
                update({ draft });
                setEditing(false);
              }}
            >
              Save draft
            </button>
            <button className="btn small" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        item.draft && <div className="post-text small">{item.draft}</div>
      )}
      <div className="row" style={{ marginTop: 8 }}>
        {next && (
          <button className="btn small" onClick={() => update({ status: next })}>
            Move to {next}
          </button>
        )}
        {!editing && (
          <button className="btn small" onClick={() => setEditing(true)}>
            {item.draft ? "Edit draft" : "Write draft"}
          </button>
        )}
        <button className="btn small" onClick={() => update({ status: "dropped" })}>
          Drop
        </button>
        <button
          className="btn small danger"
          onClick={() => void del(`/plan/${item.id}`).then(onChange)}
        >
          Delete
        </button>
      </div>
    </article>
  );
}
