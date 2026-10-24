import { useState } from "react";
import type { PublicationDto } from "../../../shared/action-types";
import { usePost } from "../../lib/hooks/mutation";
import { ErrorBox } from "../common/feedback";

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
