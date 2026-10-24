import { useState } from "react";
import type { DraftDetailDto } from "../../shared/action-types";
import { formatDate } from "../lib/format";
import { useStartJob } from "../lib/hooks";
import { JobFormCard, LengthLine, usePost } from "./action";
import { ErrorBox, Field } from "./ui";

const ORIGIN: Record<string, string> = { user: "You", ai: "AI", restore: "Restored" };

/** Starts from the current version; the parent keys it by version so a new one resets it. */
export function TextEditor({ detail, onSaved }: { detail: DraftDetailDto; onSaved: () => void }) {
  const { draft } = detail;
  const [text, setText] = useState(draft.text);
  const save = usePost(`/action/drafts/${draft.id}/versions`, onSaved);
  const approve = usePost(`/action/drafts/${draft.id}/approve`, onSaved);
  const dirty = text !== draft.text;
  const length = { ...draft.length, length: text.length, over: text.length > draft.length.limit };
  return (
    <section className="card stack" aria-label="Editor">
      <h2>
        {draft.title} <span className="small muted">version {draft.version}</span>
      </h2>
      <textarea
        rows={14}
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="Post text"
      />
      <LengthLine length={length} />
      <ErrorBox error={save.error ?? approve.error} />
      <div className="row">
        <button className="btn" disabled={!dirty || save.busy} onClick={() => save.run({ text })}>
          Save version
        </button>
        <button
          className="btn primary"
          disabled={dirty || draft.approved || approve.busy}
          onClick={() => approve.run()}
        >
          {draft.approved ? "Approved" : "Approve for publishing"}
        </button>
      </div>
      {draft.approved && draft.approvedAt && (
        <p className="small muted">
          Approved {formatDate(draft.approvedAt)}. Editing withdraws the approval.
        </p>
      )}
    </section>
  );
}

export function Versions({
  detail,
  onRestored,
}: {
  detail: DraftDetailDto;
  onRestored: () => void;
}) {
  const restore = usePost(`/action/drafts/${detail.draft.id}/restore`, onRestored);
  return (
    <section className="card stack" aria-label="Versions">
      <h2>Versions</h2>
      <ErrorBox error={restore.error} />
      {detail.versions.map((v) => (
        <details key={v.version}>
          <summary>
            v{v.version} - {ORIGIN[v.origin]}, {formatDate(v.createdAt)}
            {v.basedOnDemo && <span className="badge"> Demo data</span>}
          </summary>
          <div className="post-text small">{v.text}</div>
          {v.notes && (
            <p className="small muted" style={{ whiteSpace: "pre-wrap" }}>
              {v.notes}
            </p>
          )}
          {v.version !== detail.draft.version && (
            <button
              className="btn small"
              disabled={restore.busy}
              onClick={() => restore.run({ version: v.version })}
            >
              Restore as new version
            </button>
          )}
        </details>
      ))}
    </section>
  );
}

export function AiDraftForm(props: {
  draftId: string | null;
  onDone: () => void;
  onCreated: (id: string) => void;
}) {
  const [brief, setBrief] = useState({ topic: "", angle: "", tone: "" });
  const [rewrite, setRewrite] = useState(false);
  const { onDone, onCreated } = props;
  const job = useStartJob((finished) => {
    onDone();
    const id = (finished.result as { draftId?: string } | null)?.draftId;
    if (finished.status === "completed" && id) onCreated(id);
  });
  const field = (name: keyof typeof brief) => ({
    value: brief[name],
    onChange: (e: { target: { value: string } }) => setBrief({ ...brief, [name]: e.target.value }),
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
