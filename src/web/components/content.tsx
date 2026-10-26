import { Link, useNavigate } from "react-router-dom";
import type { InsightDto, PostSummaryDto } from "../../shared/api-types";
import {
  contentTypeLabel,
  formatDate,
  formatNumber,
  formatPercent,
  formatPeriod,
  formatValue,
} from "../lib/format";

const CONFIDENCE: Record<string, string> = {
  low: "Low confidence",
  medium: "Medium confidence",
  high: "High confidence",
};

/**
 * docs/03 s5 and docs/08: an insight shows its observation, interpretation and suggested
 * action, and its evidence is always one click away, with sources. Never an opaque "AI says".
 */
export function InsightCard({ insight }: { insight: InsightDto }) {
  return (
    <article className="card insight">
      <header>
        <h3>{insight.title}</h3>
        <div className="row">
          <span className={`badge${insight.origin === "ai" ? " ai" : ""}`}>
            {insight.origin === "ai" ? "AI interpretation" : "Rule"}
          </span>
          <span className="badge">{CONFIDENCE[insight.confidence]}</span>
          {insight.basedOnDemoData && <span className="badge">Demo data</span>}
        </div>
      </header>
      <p style={{ margin: 0 }}>{insight.observation}</p>
      <dl>
        <dt>Why it may matter</dt>
        <dd>{insight.interpretation}</dd>
        <dt>Could try</dt>
        <dd>{insight.action}</dd>
        <dt>Watch</dt>
        <dd>{insight.signal}</dd>
      </dl>
      <details>
        <summary>Evidence ({insight.evidence.length})</summary>
        {insight.evidence.length === 0 ? (
          <p className="muted small">No measured evidence supports this. Treat it as a guess.</p>
        ) : (
          <ul className="small">
            {insight.evidence.map((e) => (
              <li key={e.id}>
                {e.label}: <strong>{formatValue(e.value, e.unit)}</strong>
                {e.period && ` (${formatPeriod(e.period)})`}{" "}
                <span className="muted">from {e.source}</span>
                {e.postId && (
                  <>
                    {" "}
                    <Link to={`/content/${e.postId}`}>open post</Link>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </details>
    </article>
  );
}

export function PostTable({ posts }: { posts: PostSummaryDto[] }) {
  const navigate = useNavigate();
  if (posts.length === 0) return <p className="muted">No posts.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Post</th>
            <th>Published</th>
            <th className="num">Impressions</th>
            <th className="num">Engagements</th>
            <th className="num">Rate</th>
          </tr>
        </thead>
        <tbody>
          {posts.map((p) => (
            <tr key={p.id} className="clickable" onClick={() => navigate(`/content/${p.id}`)}>
              <td style={{ maxWidth: 420 }}>
                <Link to={`/content/${p.id}`} onClick={(e) => e.stopPropagation()}>
                  {p.excerpt ? p.excerpt.slice(0, 90) : "Text not imported yet"}
                </Link>
                <div className="row small muted">
                  {contentTypeLabel(p.contentType)}
                  {p.band === "top" && <span className="badge top">Top 25%</span>}
                  {p.band === "bottom" && <span className="badge bottom">Bottom 25%</span>}
                  {p.dataset === "demo" && <span className="badge">Demo</span>}
                </div>
              </td>
              <td className="small">{formatDate(p.publishedAt, p.timeKnown)}</td>
              <td className="num">{formatNumber(p.metrics.impressions)}</td>
              <td className="num">{formatNumber(p.metrics.engagements)}</td>
              <td className="num">{formatPercent(p.metrics.engagementRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
