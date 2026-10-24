import { Link } from "react-router-dom";
import type { InsightDto, RecommendationDto } from "../../shared/ai-types";
import { useStartJob } from "../lib/hooks/job";
import { useResource } from "../lib/hooks/resource";
import { ErrorBox, JobStatus } from "../components/common/feedback";
import { PageHead } from "../components/common/layout";
import { ResourceView } from "../components/common/resource-view";
import { InsightCard } from "../components/content/insight-card";
import { Ask } from "../components/intelligence/ask";
import { Recommendations } from "../components/intelligence/recommendations";

export function InsightsPage() {
  const insights = useResource<{ insights: InsightDto[] }>("/ai/insights?scope=account");
  const recs = useResource<{ recommendations: RecommendationDto[] }>("/ai/recommendations");
  const keys = useResource<{ credentials: unknown[] }>("/ai/credentials");
  const review = useStartJob(() => {
    insights.reload();
    recs.reload();
  });
  const hasKey = (keys.data?.credentials.length ?? 0) > 0;

  return (
    <div className="stack">
      <PageHead
        title="AI insights"
        intro="Interpretation by your own AI provider, grounded in your measured data. Every claim links to its evidence."
        actions={
          <button
            className="btn primary"
            disabled={!hasKey || review.running}
            onClick={() => review.start("/ai/reviews/account", {})}
          >
            Review my account
          </button>
        }
      />
      {keys.data && !hasKey && (
        <div className="banner error">
          <span>
            No AI key yet. <Link to="/settings">Add an OpenAI or Anthropic key in Settings</Link>.
          </span>
        </div>
      )}
      <p className="small secondary">
        A review sends aggregate metrics, your top and weakest posts (including their text) and
        segment medians to your provider. Nothing else leaves Polaris.
      </p>
      <ErrorBox error={keys.error} />
      <JobStatus job={review} />
      <Ask disabled={!hasKey} />
      <ResourceView resource={recs}>
        {(data) => <Recommendations items={data.recommendations} onChange={recs.reload} />}
      </ResourceView>
      <section className="stack">
        <h2>Account insights</h2>
        <ResourceView resource={insights}>
          {(data) => <AccountInsights insights={data.insights} />}
        </ResourceView>
      </section>
    </div>
  );
}

function AccountInsights({ insights }: { insights: InsightDto[] }) {
  if (insights.length === 0)
    return <p className="muted">No AI reviews yet. Rule-based insights are on the Overview.</p>;
  return (
    <div className="grid two">
      {insights.map((i) => (
        <InsightCard key={i.id} insight={i} />
      ))}
    </div>
  );
}
