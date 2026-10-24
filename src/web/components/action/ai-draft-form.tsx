import { useState } from "react";
import { useFields } from "../../lib/hooks/form";
import { useStartJob } from "../../lib/hooks/job";
import { Field } from "../common/fields";
import { JobFormCard } from "./job-form-card";

export function AiDraftForm(props: {
  draftId: string | null;
  onDone: () => void;
  onCreated: (id: string) => void;
}) {
  const { values: brief, field } = useFields({ topic: "", angle: "", tone: "" });
  const [rewrite, setRewrite] = useState(false);
  const { onDone, onCreated } = props;
  const job = useStartJob((finished) => {
    onDone();
    const id = (finished.result as { draftId?: string } | null)?.draftId;
    if (finished.status === "completed" && id) onCreated(id);
  });
  const rewriting = rewrite && props.draftId !== null;
  return (
    <JobFormCard
      title="Write with AI"
      intro="Uses your best-performing posts as examples of your voice. The result is a draft for you to edit."
      job={job}
      submitLabel={rewriting ? "Rewrite draft" : "Write draft"}
      onSubmit={() =>
        job.start("/action/drafts/ai", { ...brief, draftId: rewriting ? props.draftId : null })
      }
    >
      <Field label="Topic">
        <input required maxLength={500} {...field("topic")} />
      </Field>
      <div className="form-grid">
        <Field label="Angle">
          <input maxLength={500} {...field("angle")} placeholder="What I learned the hard way" />
        </Field>
        <Field label="Tone">
          <input maxLength={500} {...field("tone")} placeholder="Candid, practical" />
        </Field>
      </div>
      {props.draftId && (
        <label className="small">
          <input type="checkbox" checked={rewrite} onChange={(e) => setRewrite(e.target.checked)} />{" "}
          Rewrite the open draft as a new version
        </label>
      )}
    </JobFormCard>
  );
}
