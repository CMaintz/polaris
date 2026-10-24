import { useState } from "react";
import type { ConnectionDto, DraftDto, PublicationDto } from "../../shared/action-types";
import { useResource } from "../lib/hooks";
import { usePost } from "./action";
import { ErrorBox, Field } from "./ui";

const PUBLICATION_STATUS: Record<PublicationDto["status"], string> = {
  scheduled: "Scheduled",
  publishing: "Posting",
  awaiting_confirmation: "Ready for you to post",
  published: "Published",
  failed: "Failed",
  cancelled: "Cancelled",
};

export function PublicationCard({
  publication: p,
  onChange,
}: {
  publication: PublicationDto;
  onChange: () => void;
}) {
  const [url, setUrl] = useState("");
  const cancel = usePost(`/action/publications/${p.id}/cancel`, onChange);
  const confirm = usePost(`/action/publications/${p.id}/confirm`, onChange);
  const needsConfirm = p.status === "awaiting_confirmation" || p.status === "failed";
  return (
    <article className="stack small" style={{ borderTop: "1px solid var(--grid)", paddingTop: 8 }}>
      <div>
        <strong>{PUBLICATION_STATUS[p.status]}</strong> via {p.provider}, for{" "}
        {new Date(p.scheduledFor).toLocaleString()}
        {p.status === "published" && p.url && (
          <>
            {" - "}
            <a href={p.url} target="_blank" rel="noreferrer">
              view on LinkedIn
            </a>
          </>
        )}
      </div>
      {p.error && <div className="muted">{p.error}</div>}
      {p.status === "awaiting_confirmation" && <Handoff publication={p} />}
      {needsConfirm && (
        <div className="row">
          <input
            aria-label="Link to the published post (optional)"
            placeholder="https://www.linkedin.com/feed/update/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button
            className="btn small primary"
            disabled={confirm.busy}
            onClick={() => confirm.run({ url: url || null })}
          >
            I published it
          </button>
        </div>
      )}
      {(p.status === "scheduled" || p.status === "awaiting_confirmation") && (
        <div>
          <button className="btn small" disabled={cancel.busy} onClick={() => cancel.run()}>
            Cancel
          </button>
        </div>
      )}
      <ErrorBox error={cancel.error ?? confirm.error} />
    </article>
  );
}

function Handoff({ publication: p }: { publication: PublicationDto }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="stack">
      <div className="post-text">{p.text}</div>
      <div className="row">
        <button
          className="btn small"
          onClick={() => void navigator.clipboard.writeText(p.text).then(() => setCopied(true))}
        >
          {copied ? "Copied" : "Copy text"}
        </button>
        {p.url && (
          <a className="btn small" href={p.url} target="_blank" rel="noreferrer">
            Open LinkedIn to post
          </a>
        )}
      </div>
    </div>
  );
}

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
