import { useState } from "react";
import type { PlanItemDto, PlanStatusDto as Status } from "../../shared/planning-types";
import { del, patch, post } from "../lib/api";
import { formatDate } from "../lib/format";
import { AllAccountsPlan } from "../components/action/all-accounts-plan";
import { ErrorBox } from "../components/common/feedback";
import { Field } from "../components/common/fields";
import { Empty, PageHead } from "../components/common/layout";
import { ResourceView } from "../components/common/resource-view";
import { useForm } from "../lib/hooks/form";
import { useMutation } from "../lib/hooks/mutation";
import { useResource } from "../lib/hooks/resource";

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
  const [all, setAll] = useState(false);
  const toggle = (
    <label className="row small">
      <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
      All accounts
    </label>
  );
  return (
    <div className="stack">
      <PageHead
        title="Planner"
        intro="Ideas and planned posts. Planning is not publishing: a post goes out only when you approve and schedule its draft in Studio."
        actions={toggle}
      />
      {all ? <AllAccountsPlan /> : <AccountPlan />}
    </div>
  );
}

function AccountPlan() {
  const list = useResource<{ items: PlanItemDto[] }>("/plan");
  const form = useForm({ title: "", concept: "", targetTopic: "", plannedDate: "" }, async (v) => {
    await post("/plan", {
      ...v,
      plannedDate: v.plannedDate || null,
      targetTopic: v.targetTopic.replace(/^#/, ""),
    });
    list.reload();
  });
  return (
    <>
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
      <ResourceView resource={list}>
        {({ items }) =>
          items.length === 0 ? (
            <Empty title="Nothing planned yet" />
          ) : (
            <Board items={items} onChange={list.reload} />
          )
        }
      </ResourceView>
    </>
  );
}

function Board({ items, onChange }: { items: PlanItemDto[]; onChange: () => void }) {
  return (
    <div className="grid two">
      {COLUMNS.map(([status, label]) => (
        <section key={status} className="card stack" aria-label={label}>
          <h2>
            {label} ({items.filter((i) => i.status === status).length})
          </h2>
          {items
            .filter((i) => i.status === status)
            .map((item) => (
              <PlanCard key={item.id} item={item} onChange={onChange} />
            ))}
        </section>
      ))}
    </div>
  );
}

function PlanCard({ item, onChange }: { item: PlanItemDto; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.draft);
  const update = useMutation(
    (values: Partial<PlanItemDto>) => patch(`/plan/${item.id}`, values),
    () => {
      setEditing(false);
      onChange();
    },
  );
  const remove = useMutation(() => del(`/plan/${item.id}`), onChange);
  const busy = update.busy || remove.busy;
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
              disabled={busy}
              onClick={() => update.run({ draft })}
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
      <ErrorBox error={update.error ?? remove.error} />
      <div className="row" style={{ marginTop: 8 }}>
        {next && (
          <button
            className="btn small"
            disabled={busy}
            onClick={() => update.run({ status: next })}
          >
            Move to {next}
          </button>
        )}
        {!editing && (
          <button className="btn small" onClick={() => setEditing(true)}>
            {item.draft ? "Edit draft" : "Write draft"}
          </button>
        )}
        <button
          className="btn small"
          disabled={busy}
          onClick={() => update.run({ status: "dropped" })}
        >
          Drop
        </button>
        <button className="btn small danger" disabled={busy} onClick={() => remove.run()}>
          Delete
        </button>
      </div>
    </article>
  );
}
