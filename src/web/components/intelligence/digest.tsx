import { useState } from "react";
import type { DigestDto } from "../../../shared/intelligence-types";
import { formatDate } from "../../lib/format";
import { useStartJob } from "../../lib/hooks/job";
import { useResource } from "../../lib/hooks/resource";
import { JobStatus } from "../common/feedback";
import { ResourceView } from "../common/resource-view";
import { MatchList } from "./match-list";

export function Digest() {
  const digests = useResource<{ items: DigestDto[] }>("/intelligence/trends/digests");
  const [withAi, setWithAi] = useState(true);
  const job = useStartJob(digests.reload);
  return (
    <section className="card stack">
      <h2>Weekly digest</h2>
      <div className="row">
        <label className="small">
          <input type="checkbox" checked={withAi} onChange={(e) => setWithAi(e.target.checked)} />{" "}
          Add an AI summary of how this relates to my content (uses your API key)
        </label>
        <button
          className="btn"
          disabled={job.running}
          onClick={() => job.start("/intelligence/trends/digests", { withAi })}
        >
          Build digest
        </button>
      </div>
      <JobStatus job={job} />
      <ResourceView resource={digests}>
        {(data) => {
          const latest = data.items[0];
          if (!latest)
            return <p className="muted">No digest yet. Build one, or schedule it in Settings.</p>;
          return <DigestView digest={latest} />;
        }}
      </ResourceView>
    </section>
  );
}

function DigestView({ digest }: { digest: DigestDto }) {
  const ai = digest.ai;
  const notes = new Map(
    ai.status === "succeeded" ? ai.relations.map((r) => [r.itemId, r.relation]) : [],
  );
  return (
    <div className="stack">
      <p className="small muted">
        {formatDate(digest.from)} to {formatDate(digest.to)}
      </p>
      {ai.status === "succeeded" ? (
        <p style={{ margin: 0 }}>
          <span className="badge ai">AI summary</span> {ai.summary}
        </p>
      ) : (
        <p className="small muted">AI summary not available: {ai.reason}</p>
      )}
      <MatchList matches={digest.matches} notes={notes} />
    </div>
  );
}
