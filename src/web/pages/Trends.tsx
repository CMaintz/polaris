import { useState } from "react";
import type { DigestDto, FeedDto, TrendMatchDto, TrendsDto } from "../../shared/intelligence-types";
import { del, post } from "../lib/api";
import { formatDate } from "../lib/format";
import { useResource, useStartJob } from "../lib/hooks";
import { useMutation } from "../lib/mutation";
import { ExternalLink } from "../components/intelligence";
import { ResourceView } from "../components/resource";
import { Empty, ErrorBox, Field, JobLine, PageHead } from "../components/ui";

export function TrendsPage() {
  const feeds = useResource<{ items: FeedDto[] }>("/intelligence/feeds");
  const trends = useResource<TrendsDto>("/intelligence/trends");
  const refresh = useStartJob(() => {
    feeds.reload();
    trends.reload();
  });
  return (
    <div className="stack">
      <PageHead
        title="Trends"
        intro="News feeds you follow, matched against the topics of your own posts. Matching is plain keyword overlap, so every count can be checked against the items below."
        actions={
          <button
            className="btn"
            disabled={refresh.running}
            onClick={() => refresh.start("/intelligence/feeds/refresh", {})}
          >
            Refresh feeds
          </button>
        }
      />
      <ErrorBox error={refresh.error} />
      <JobLine job={refresh.job} />
      <Feeds feeds={feeds.data?.items ?? null} error={feeds.error} onChange={feeds.reload} />
      <ResourceView resource={trends}>{(data) => <TopicTable trends={data} />}</ResourceView>
      <Digest />
    </div>
  );
}

function Feeds({
  feeds,
  error,
  onChange,
}: {
  feeds: FeedDto[] | null;
  error: Error | null;
  onChange: () => void;
}) {
  const [url, setUrl] = useState("");
  const add = useMutation(
    () => post("/intelligence/feeds", { url }),
    () => {
      setUrl("");
      onChange();
    },
  );
  const remove = useMutation((id: string) => del(`/intelligence/feeds/${id}`), onChange);
  return (
    <section className="card stack">
      <h2>Feeds</h2>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          add.run();
        }}
      >
        <Field label="RSS or Atom feed URL">
          <input
            required
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://"
          />
        </Field>
        <button className="btn primary" disabled={add.busy}>
          Follow
        </button>
      </form>
      <ErrorBox error={error ?? add.error ?? remove.error} />
      {feeds && feeds.length === 0 && (
        <p className="muted">No feeds yet. Paste the URL of a news or blog feed above.</p>
      )}
      {feeds && feeds.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Feed</th>
                <th className="num">Items</th>
                <th>Last fetch</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {feeds.map((f) => (
                <tr key={f.id}>
                  <td>
                    {f.title ?? f.url}
                    <div className="small muted">{f.url}</div>
                  </td>
                  <td className="num">{f.itemCount}</td>
                  <td>
                    {f.lastFetchedAt ? formatDate(f.lastFetchedAt) : "Not fetched yet"}
                    {f.lastStatus === "error" && <div className="small">Failed: {f.lastError}</div>}
                  </td>
                  <td>
                    <button
                      className="btn small danger"
                      disabled={remove.busy}
                      onClick={() => remove.run(f.id)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function TopicTable({ trends }: { trends: TrendsDto }) {
  if (trends.topics.length === 0) {
    return (
      <Empty title="No topics to match yet">
        <p>Topics come from the hashtags in your posts. Import your LinkedIn data to see trends.</p>
      </Empty>
    );
  }
  return (
    <section className="card stack">
      <h2>Matched items per topic</h2>
      <p className="small secondary">
        {trends.trackedSince
          ? `Tracking since ${formatDate(trends.trackedSince)}; longer windows undercount before that.`
          : "No feed has been fetched yet, so no counts are available."}
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Topic</th>
              <th className="num">Last 7 days</th>
              <th className="num">Last 30 days</th>
              <th className="num">Last 90 days</th>
            </tr>
          </thead>
          <tbody>
            {trends.topics.map((t) => (
              <tr key={t.topic}>
                <td>#{t.topic}</td>
                <td className="num">{trends.trackedSince ? t.last7 : "Not available"}</td>
                <td className="num">{trends.trackedSince ? t.last30 : "Not available"}</td>
                <td className="num">{trends.trackedSince ? t.last90 : "Not available"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Recent matches</h3>
      <MatchList matches={trends.recent} />
    </section>
  );
}

function MatchList({
  matches,
  notes = new Map(),
}: {
  matches: TrendMatchDto[];
  notes?: Map<string, string>;
}) {
  if (matches.length === 0)
    return <p className="muted">No feed items mention your topics in this period.</p>;
  return (
    <ul>
      {matches.map((m) => (
        <li key={m.itemId}>
          <ExternalLink url={m.link}>{m.title || "Untitled item"}</ExternalLink>{" "}
          <span className="small muted">
            {m.feedTitle ?? "Feed"} - {formatDate(m.day)} - {m.topics.map((t) => `#${t}`).join(" ")}
          </span>
          {notes.get(m.itemId) && <div className="small">{notes.get(m.itemId)}</div>}
        </li>
      ))}
    </ul>
  );
}

function Digest() {
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
      <ErrorBox error={job.error} />
      <JobLine job={job.job} />
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
