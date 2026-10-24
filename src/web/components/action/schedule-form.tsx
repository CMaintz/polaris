import { useState } from "react";
import type { ConnectionDto, DraftDto } from "../../../shared/action-types";
import { usePost } from "../../lib/hooks/mutation";
import { useResource } from "../../lib/hooks/resource";
import { ErrorBox } from "../common/feedback";
import { Field } from "../common/fields";

export function ScheduleForm({ draft, onScheduled }: { draft: DraftDto; onScheduled: () => void }) {
  const connections = useResource<{ connections: ConnectionDto[] }>("/action/connections");
  const usable = (connections.data?.connections ?? []).filter((c) => c.state === "connected");
  const [provider, setProvider] = useState("manual");
  const [at, setAt] = useState("");
  const schedule = usePost(`/action/drafts/${draft.id}/schedule`, onScheduled);
  if (!draft.approved) {
    return <p className="card small muted">Approve this version to schedule it.</p>;
  }
  const submit = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    schedule.run({ provider, at: new Date(at).toISOString() });
  };
  return (
    <form className="card stack" aria-label="Schedule" onSubmit={submit}>
      <h2>Schedule</h2>
      <div className="form-grid">
        <Field label="Publish with">
          <select value={provider} onChange={(e) => setProvider(e.target.value)}>
            {usable.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="When (your local time)">
          <input
            required
            type="datetime-local"
            value={at}
            onChange={(e) => setAt(e.target.value)}
          />
        </Field>
      </div>
      <p className="small muted">
        To post through LinkedIn directly, connect it under Settings, Publishing connections.
      </p>
      <ErrorBox error={schedule.error} />
      <div>
        <button className="btn primary" disabled={schedule.busy}>
          Schedule
        </button>
      </div>
    </form>
  );
}
