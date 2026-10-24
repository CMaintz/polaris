import { Link, useParams } from "react-router-dom";
import type { InsightDto } from "../../shared/ai-types";
import type { PostDetailDto } from "../../shared/post-types";
import { contentTypeLabel, formatDate } from "../lib/format";
import { useResource } from "../lib/hooks/resource";
import { linkedInUrl } from "../lib/links";
import { ErrorBox, Pending } from "../components/common/feedback";
import { PageHead } from "../components/common/layout";
import { ObservationTable } from "../components/content/observation-table";
import { PerformanceCard } from "../components/content/post-performance";
import { PostReview } from "../components/content/post-review";
import { PostTable } from "../components/content/post-table";

export function PostDetailPage() {
  const { id = "" } = useParams();
  const detail = useResource<PostDetailDto>(`/posts/${id}`);
  const insights = useResource<{ insights: InsightDto[] }>(`/ai/insights?scope=post&postId=${id}`);
  if (!detail.data) return <Pending error={detail.error} />;
  const { post: p, observations, baseline, comparable } = detail.data;
  return (
    <div className="stack">
      <PageHead
        title={`${contentTypeLabel(p.contentType)} post, ${formatDate(p.publishedAt, p.timeKnown)}`}
        intro={p.topics.length ? p.topics.map((t) => `#${t}`).join(" ") : undefined}
        actions={<PostActions url={p.url} />}
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
        <PerformanceCard post={p} baseline={baseline} />
      </div>
      <ErrorBox error={insights.error} />
      <PostReview postId={p.id} insights={insights.data?.insights ?? []} onDone={insights.reload} />
      <div className="card">
        <h2>Measurement history and provenance</h2>
        <p className="small secondary">
          Sources: {p.providers.join(", ") || "None"}. LinkedIn id: {p.externalId}
        </p>
        <ObservationTable observations={observations} />
      </div>
      <div className="card">
        <h2>Comparable posts</h2>
        <PostTable posts={comparable} />
      </div>
    </div>
  );
}

function PostActions({ url }: { url: string | null }) {
  const href = linkedInUrl(url);
  return (
    <>
      {href && (
        <a className="btn" href={href} target="_blank" rel="noreferrer noopener">
          Open on LinkedIn
        </a>
      )}
      <Link className="btn" to="/content">
        Back to content
      </Link>
    </>
  );
}
