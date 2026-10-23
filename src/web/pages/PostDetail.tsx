import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { InsightDto, JobDto, PostDetailDto } from "../../shared/api-types";
import { post, tzOffset } from "../lib/api";
import {
  contentTypeLabel,
  formatDate,
  formatNumber,
  formatPercent,
  formatPeriod,
} from "../lib/format";
import { useJob, useResource } from "../lib/hooks";
import { linkedInUrl } from "../lib/links";
import { InsightCard, PostTable } from "../components/content";
import { ErrorBox, JobLine, Loading, PageHead } from "../components/ui";

export function PostDetailPage() {
  const { id = "" } = useParams();
  const detail = useResource<PostDetailDto>(`/posts/${id}`);
  const insights = useResource<{ insights: InsightDto[] }>(`/ai/insights?scope=post&postId=${id}`);
  if (!detail.data) return detail.error ? <ErrorBox error={detail.error} /> : <Loading />;
  const { post: p, observations, baseline, comparable } = detail.data;
  return (
    <div className="stack">
      <PageHead
        title={`${contentTypeLabel(p.contentType)} post, ${formatDate(p.publishedAt, p.timeKnown)}`}
        intro={p.topics.length ? p.topics.map((t) => `#${t}`).join(" ") : undefined}
        actions={
          <>
            {linkedInUrl(p.url) && (
              <a
                className="btn"
                href={linkedInUrl(p.url) ?? undefined}
                target="_blank"
                rel="noreferrer noopener"
              >
                Open on LinkedIn
              </a>
            )}
            <Link className="btn" to="/content">
              Back to content
            </Link>
          </>
        }
      />
      <div className="grid two">
        <div className="card">
          <h2>Post</h2>
          {p.text ? (
            <div className="post-text">{p.text}</div>
          ) : (
            <p className="muted">
              The text of this post has not been imported. Import your data archive (Shares.csv) to
              add it.
            </p>
          )}
        </div>
        <div className="card">
          <h2>Performance</h2>
          <table>
            <tbody>
              <MetricRow
                label="Impressions"
                value={formatNumber(p.metrics.impressions)}
                baseline={formatNumber(baseline.medianImpressions)}
              />
              <MetricRow
                label="Engagements"
                value={formatNumber(p.metrics.engagements)}
                baseline={formatNumber(baseline.medianEngagements)}
              />
              <MetricRow
                label="Engagement rate"
                value={formatPercent(p.metrics.engagementRate)}
                baseline={formatPercent(baseline.medianEngagementRate)}
              />
              <MetricRow label="Reactions" value={formatNumber(p.metrics.reactions)} />
              <MetricRow label="Comments" value={formatNumber(p.metrics.comments)} />
              <MetricRow label="Reposts" value={formatNumber(p.metrics.reposts)} />
            </tbody>
          </table>
          <p className="muted small">
            Typical is the median of your other {baseline.withMetrics} posts with metrics.
          </p>
        </div>
      </div>
      <PostReview postId={p.id} insights={insights.data?.insights ?? []} onDone={insights.reload} />
      <div className="card">
        <h2>Measurement history and provenance</h2>
        <p className="small secondary">
          Sources: {p.providers.join(", ") || "None"}. LinkedIn id: {p.externalId}
        </p>
        {observations.length === 0 ? (
          <p className="muted">No metrics have been imported for this post.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Observed</th>
                  <th>Covers</th>
                  <th>Source</th>
                  <th className="num">Impressions</th>
                  <th className="num">Engagements</th>
                </tr>
              </thead>
              <tbody>
                {observations.map((o) => (
                  <tr key={`${o.observedOn}-${o.source}`}>
                    <td>{formatDate(o.observedOn)}</td>
                    <td className="small">
                      {o.period ? formatPeriod(o.period) : "Lifetime to date"}
                    </td>
                    <td className="small">{o.source}</td>
                    <td className="num">{formatNumber(o.metrics.impressions)}</td>
                    <td className="num">{formatNumber(o.metrics.engagements)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="card">
        <h2>Comparable posts</h2>
        <PostTable posts={comparable} />
      </div>
    </div>
  );
}

function MetricRow({
  label,
  value,
  baseline,
}: {
  label: string;
  value: string;
  baseline?: string;
}) {
  return (
    <tr>
      <th>{label}</th>
      <td className="num">
        <strong>{value}</strong>
      </td>
      <td className="num muted small">{baseline ? `typical ${baseline}` : ""}</td>
    </tr>
  );
}

function PostReview({
  postId,
  insights,
  onDone,
}: {
  postId: string;
  insights: InsightDto[];
  onDone: () => void;
}) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const job = useJob(jobId, onDone);
  const start = () => {
    setError(null);
    post<{ job: JobDto }>(`/ai/reviews/posts/${postId}`, { tz: tzOffset() })
      .then((r) => setJobId(r.job.id))
      .catch(setError);
  };
  const running = job !== null && !["completed", "failed"].includes(job.status);
  return (
    <div className="card">
      <header>
        <h2>AI review</h2>
        <button className="btn primary" onClick={start} disabled={running}>
          Review this post
        </button>
      </header>
      <p className="small secondary">
        Sends this post's text and metrics, and a few comparable posts, to your AI provider.
      </p>
      <ErrorBox error={error} />
      <JobLine job={job} />
      <div className="stack" style={{ marginTop: 12 }}>
        {insights.map((i) => (
          <InsightCard key={i.id} insight={i} />
        ))}
      </div>
    </div>
  );
}
