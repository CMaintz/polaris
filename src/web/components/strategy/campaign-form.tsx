import { type FormEvent, useCallback } from "react";
import type { CampaignDto, CampaignInput } from "../../../shared/strategy-types";
import { patch, post } from "../../lib/api";
import { inDays, today } from "../../lib/dates";
import { useFields } from "../../lib/hooks/form";
import { useMutation } from "../../lib/hooks/mutation";
import { ErrorBox } from "../common/feedback";
import { DateRangeFields, EditFormActions, Field, LabelOptions } from "../common/fields";
import { CAMPAIGN_STATUS } from "./campaign-status";

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

export function CampaignForm({ editing, onSaved, onCancel }: FormProps) {
  const { values, field } = useFields(editing ? pick(editing) : blank());
  const save = useCallback(
    (v: CampaignInput) =>
      editing ? patch(`/strategy/campaigns/${editing.id}`, v) : post("/strategy/campaigns", v),
    [editing],
  );
  const mutation = useMutation(save, onSaved);
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
            <LabelOptions labels={CAMPAIGN_STATUS} />
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
      <EditFormActions
        editing={editing !== null}
        busy={mutation.busy}
        saveLabel="Save campaign"
        addLabel="Add campaign"
        onCancel={onCancel}
      />
    </form>
  );
}
