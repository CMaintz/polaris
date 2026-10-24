import { useState } from "react";
import type { DraftDetailDto } from "../../../shared/action-types";
import { formatDate } from "../../lib/format";
import { usePost } from "../../lib/hooks/mutation";
import { ErrorBox } from "../common/feedback";
import { LengthLine } from "./length-line";

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
