import { Link, useNavigate } from "react-router-dom";
import type { PostSummaryDto } from "../../../shared/post-types";
import { contentTypeLabel, formatDate, formatNumber, formatPercent } from "../../lib/format";

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
