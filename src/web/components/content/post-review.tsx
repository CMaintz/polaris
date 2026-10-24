import type { InsightDto } from "../../../shared/ai-types";
import { useStartJob } from "../../lib/hooks/job";
import { JobStatus } from "../common/feedback";
import { InsightCard } from "./insight-card";

export function PostReview({
  postId,
  insights,
  onDone,
}: {
  postId: string;
  insights: InsightDto[];
  onDone: () => void;
}) {
  const review = useStartJob(onDone);
  return (
    <div className="card">
      <header>
        <h2>AI review</h2>
        <button
          className="btn primary"
          onClick={() => review.start(`/ai/reviews/posts/${postId}`, {})}
          disabled={review.running}
        >
          Review this post
        </button>
      </header>
      <p className="small secondary">
        Sends this post's text and metrics, and a few comparable posts, to your AI provider.
      </p>
      <JobStatus job={review} />
      <div className="stack" style={{ marginTop: 12 }}>
        {insights.map((i) => (
          <InsightCard key={i.id} insight={i} />
        ))}
      </div>
    </div>
  );
}
