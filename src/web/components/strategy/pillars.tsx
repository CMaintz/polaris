import { useCallback, useState } from "react";
import type { PillarDto } from "../../../shared/strategy-types";
import { del } from "../../lib/api";
import { formatPercent } from "../../lib/format";
import { type Mutation, useMutation } from "../../lib/hooks/mutation";
import { useResource } from "../../lib/hooks/resource";
import { DataTable } from "../common/data-table";
import { ErrorBox } from "../common/feedback";
import { Empty } from "../common/layout";
import { ResourceView } from "../common/resource-view";
import { PillarForm } from "./pillar-form";

const removePillar = (id: string) => del(`/strategy/pillars/${id}`);

export function PillarsSection({ onChange }: { onChange?: () => void }) {
  const list = useResource<{ items: PillarDto[] }>("/strategy/pillars");
  const [editing, setEditing] = useState<PillarDto | null>(null);
  const { reload } = list;
  const refresh = useCallback(() => {
    setEditing(null);
    reload();
    onChange?.();
  }, [reload, onChange]);
  const remove = useMutation(removePillar, refresh);
  return (
    <section className="card stack" aria-label="Content pillars">
      <h2>Content pillars</h2>
      <p className="small secondary">
        Recurring themes you plan to post about, each a set of hashtags with a target share of your
        posts.
      </p>
      <ResourceView resource={list}>
        {({ items }) =>
          items.length === 0 ? (
            <Empty title="No pillars yet">
              <p>Add the themes you want to be known for, with the hashtags you use for them.</p>
            </Empty>
          ) : (
            <PillarTable items={items} remove={remove} onEdit={setEditing} />
          )
        }
      </ResourceView>
      <ErrorBox error={remove.error} />
      <PillarForm
        key={editing?.id ?? "new"}
        editing={editing}
        onSaved={refresh}
        onCancel={() => setEditing(null)}
      />
    </section>
  );
}

function PillarTable(props: {
  items: PillarDto[];
  remove: Mutation<[id: string]>;
  onEdit: (pillar: PillarDto) => void;
}) {
  const { remove, onEdit } = props;
  return (
    <DataTable
      headers={["Pillar", "Topics", "Target", ""]}
      rows={props.items.map((p) => [
        p.name,
        p.topics.map((t) => `#${t}`).join(" "),
        formatPercent(p.targetShare, 0),
        <span className="row" key={p.id}>
          <button className="btn small" onClick={() => onEdit(p)}>
            Edit
          </button>
          <button
            className="btn small danger"
            disabled={remove.busy}
            onClick={() => remove.run(p.id)}
          >
            Delete
          </button>
        </span>,
      ])}
    />
  );
}
