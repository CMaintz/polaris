import { type FormEvent, useState } from "react";
import type { Cadence, PeerDto, ScheduleKind } from "../../../shared/intelligence-types";
import { post, tzOffset } from "../../lib/api";
import { useMutation } from "../../lib/hooks/mutation";
import { ErrorBox } from "../common/feedback";
import { Field, LabelOptions } from "../common/fields";
import { PeerField } from "./peer-field";
import { SCHEDULE_KINDS } from "./schedule-kinds";

export function NewSchedule({ peers, onDone }: { peers: PeerDto[]; onDone: () => void }) {
  const [kind, setKind] = useState<ScheduleKind>("feed_refresh");
  const [cadence, setCadence] = useState<Cadence>("daily");
  const [question, setQuestion] = useState("");
  const [peerId, setPeerId] = useState("");
  const [withAi, setWithAi] = useState(true);
  const save = useMutation(
    () =>
      post("/intelligence/schedules", {
        kind,
        cadence,
        params: { tz: tzOffset(), withAi, question, peerId: peerId || null },
      }),
    onDone,
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.run();
  };
  return (
    <form className="stack" onSubmit={submit}>
      <div className="form-grid">
        <Field label="What">
          <select value={kind} onChange={(e) => setKind(e.target.value as ScheduleKind)}>
            <LabelOptions labels={SCHEDULE_KINDS} />
          </select>
        </Field>
        <Field label="How often">
          <select value={cadence} onChange={(e) => setCadence(e.target.value as Cadence)}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </Field>
        {kind === "trend_digest" && (
          <Field label="AI summary">
            <input type="checkbox" checked={withAi} onChange={(e) => setWithAi(e.target.checked)} />
          </Field>
        )}
        {kind === "research_rerun" && (
          <PeerField label="About" peers={peers} value={peerId} onChange={setPeerId} />
        )}
      </div>
      {kind === "research_rerun" && (
        <Field label="Question">
          <textarea
            required
            maxLength={500}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
        </Field>
      )}
      <ErrorBox error={save.error} />
      <div>
        <button className="btn primary" disabled={save.busy}>
          Add schedule
        </button>
      </div>
    </form>
  );
}
