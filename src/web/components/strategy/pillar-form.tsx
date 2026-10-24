import { type FormEvent, useCallback } from "react";
import type { PillarDto } from "../../../shared/strategy-types";
import { patch, post } from "../../lib/api";
import { useFields } from "../../lib/hooks/form";
import { useMutation } from "../../lib/hooks/mutation";
import { ErrorBox } from "../common/feedback";
import { EditFormActions, Field } from "../common/fields";

type PillarDraft = {
  name: string;
  description: string;
  topics: string;
  targetPercent: string;
};

const EMPTY_DRAFT: PillarDraft = { name: "", description: "", topics: "", targetPercent: "" };

const toDraft = (p: PillarDto): PillarDraft => ({
  name: p.name,
  description: p.description,
  topics: p.topics.map((t) => `#${t}`).join(" "),
  targetPercent: String(Math.round(p.targetShare * 1000) / 10),
});

const fromDraft = (d: PillarDraft) => ({
  name: d.name,
  description: d.description,
  topics: d.topics.split(/[\s,]+/).filter(Boolean),
  targetShare: Number(d.targetPercent) / 100,
});

interface PillarFormProps {
  editing: PillarDto | null;
  onSaved: () => void;
  onCancel: () => void;
}

export function PillarForm({ editing, onSaved, onCancel }: PillarFormProps) {
  const {
    values: draft,
    setValues: setDraft,
    field,
  } = useFields(editing ? toDraft(editing) : EMPTY_DRAFT);
  const save = useCallback(
    (d: PillarDraft) =>
      editing
        ? patch(`/strategy/pillars/${editing.id}`, fromDraft(d))
        : post("/strategy/pillars", fromDraft(d)),
    [editing],
  );
  const done = useCallback(() => {
    setDraft(EMPTY_DRAFT);
    onSaved();
  }, [onSaved, setDraft]);
  const mutation = useMutation(save, done);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    mutation.run(draft);
  };
  return (
    <form className="stack" onSubmit={submit}>
      <h3>{editing ? `Edit ${editing.name}` : "New pillar"}</h3>
      <div className="form-grid">
        <Field label="Name">
          <input required maxLength={200} {...field("name")} placeholder="Leadership lessons" />
        </Field>
        <Field label="Hashtag topics">
          <input required {...field("topics")} placeholder="#leadership #management" />
        </Field>
        <Field label="Target share of posts (%)">
          <input required type="number" min="0" max="100" step="any" {...field("targetPercent")} />
        </Field>
      </div>
      <Field label="Description">
        <textarea maxLength={2000} {...field("description")} />
      </Field>
      <ErrorBox error={mutation.error} />
      <EditFormActions
        editing={editing !== null}
        busy={mutation.busy}
        saveLabel="Save pillar"
        addLabel="Add pillar"
        onCancel={onCancel}
      />
    </form>
  );
}
