import type { IndexStatusDto, SnippetSegment } from "../../../shared/knowledge-types";
import { formatNumber } from "../../lib/format";
import { useStartJob } from "../../lib/hooks/job";
import { ErrorBox, JobLine } from "../common/feedback";

/** Post text arrives as plain segments; React escapes it, and only <mark> is ours. */
export function Snippet({ segments }: { segments: SnippetSegment[] }) {
  if (segments.length === 0) return <span className="muted">Text not imported yet</span>;
  return (
    <span className="snippet">
      {segments.map((s, i) =>
        s.hit ? <mark key={i}>{s.text}</mark> : <span key={i}>{s.text}</span>,
      )}
    </span>
  );
}

export function IndexStatusCard({
  status,
  onDone,
}: {
  status: IndexStatusDto;
  onDone: () => void;
}) {
  const reindex = useStartJob(onDone);
  const { semantic } = status;
  return (
    <section className="card stack">
      <header>
        <h2>Search index</h2>
        <button
          className="btn"
          disabled={reindex.running}
          onClick={() => reindex.start("/knowledge/index", {})}
        >
          Re-index
        </button>
      </header>
      <p className="small">
        Keyword index: {formatNumber(status.keywordIndexed)} of {formatNumber(status.postsWithText)}{" "}
        posts with text. It updates itself whenever you search.
      </p>
      {semantic.available ? (
        <p className="small">
          Meaning index: {formatNumber(semantic.embedded)} of {formatNumber(status.postsWithText)}{" "}
          posts, embedded with {semantic.model} through your OpenAI key.
          {semantic.embedded < status.postsWithText && " Re-index to embed the rest."}
        </p>
      ) : (
        <p className="small secondary">{semantic.reason} Keyword search works without it.</p>
      )}
      <ErrorBox error={reindex.error} />
      <JobLine job={reindex.job ?? status.lastJob} />
    </section>
  );
}
