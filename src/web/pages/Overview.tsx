import { Link } from "react-router-dom";
import type { DashboardDto, InsightDto } from "../../shared/api-types";
import { tzOffset } from "../lib/api";
import { formatDate, formatNumber } from "../lib/format";
import { useResource } from "../lib/hooks";
import { TrendChart } from "../components/charts";
import { InsightCard, PostTable } from "../components/content";
import { ErrorBox, KpiTile, Loading, NeedsData, PageHead } from "../components/ui";

export function OverviewPage() {
  const dashboard = useResource<DashboardDto>(`/dashboard?days=28&tz=${tzOffset()}`);
  const ai = useResource<{ insights: InsightDto[] }>("/ai/insights?scope=account");
  const data = dashboard.data;
  if (!data) return dashboard.error ? <ErrorBox error={dashboard.error} /> : <Loading />;
  if (!data.status.asOf) {
    return (
      <>
        <PageHead title="Overview" />
        <NeedsData />
      </>
    );
  }
  const insights = [...(ai.data?.insights.slice(0, 2) ?? []), ...data.insights];
  return (
    <div className="stack">
      <PageHead
        title="Overview"
        intro={`Last ${data.periodDays} days up to ${formatDate(data.status.asOf)}, the latest day in your imported data. ${data.status.postsWithMetrics} of ${data.status.posts} posts have metrics.`}
      />
      <section className="grid kpis" aria-label="Key figures">
        {data.kpis.map((kpi) => (
          <KpiTile key={kpi.key} kpi={kpi} />
        ))}
      </section>
      <section className="grid two">
        <div className="card">
          <header>
            <h2>Impressions, last 90 days</h2>
            <Link to="/analytics" className="small">
              More analytics
            </Link>
          </header>
          <TrendChart
            points={data.impressionsTrend}
            label="Impressions"
            rollingLabel="7-day average"
          />
        </div>
        <div className="card">
          <h2>Followers</h2>
          <TrendChart points={data.followersTrend} label="Followers" />
        </div>
      </section>
      <section className="stack" aria-label="What deserves attention">
        <div className="page-head" style={{ marginBottom: 0 }}>
          <h2>What deserves attention</h2>
          <Link to="/insights" className="small">
            AI review and questions
          </Link>
        </div>
        <ErrorBox error={ai.error} />
        {insights.length === 0 ? (
          <p className="muted">
            No clear patterns yet. Rule insights appear once there is enough data to support them.
          </p>
        ) : (
          <div className="grid two">
            {insights.map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </div>
        )}
      </section>
      <section className="grid two">
        <div className="card">
          <h2>Top posts, last 90 days</h2>
          <PostTable posts={data.topPosts} />
        </div>
        <div className="card">
          <h2>Recent posts</h2>
          <PostTable posts={data.recentPosts} />
        </div>
      </section>
      {data.themes.length > 0 && (
        <section className="card">
          <h2>Themes</h2>
          <div className="row">
            {data.themes.map((t) => (
              <Link
                key={t.key}
                className="badge"
                to={`/content?topic=${encodeURIComponent(t.key)}`}
              >
                #{t.key}: {t.posts} posts, median {formatNumber(t.medianEngagements)} engagements
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
