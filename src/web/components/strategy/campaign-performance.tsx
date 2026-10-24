import { Link } from "react-router-dom";
import type {
  CampaignPerformanceDto,
  MeasuredDto,
  PeriodPerformanceDto,
} from "../../../shared/strategy-types";
import {
  NOT_AVAILABLE,
  formatDate,
  formatNumber,
  formatPercent,
  formatPeriod,
} from "../../lib/format";
import { useResource } from "../../lib/hooks/resource";
import { DataTable } from "../common/data-table";
import { ResourceView } from "../common/resource-view";
import { coverage } from "./measures";

type Row = [string, (p: PeriodPerformanceDto) => string];

const PERFORMANCE_ROWS: Row[] = [
  ["Posts published", (p) => measured(p.postsPublished, formatNumber)],
  ["Median impressions", (p) => formatNumber(p.posts.medianImpressions)],
  ["Median engagement rate", (p) => formatPercent(p.posts.medianEngagementRate, 2)],
  ["Posts with metrics", (p) => `${p.posts.withMetrics} of ${p.posts.posts}`],
  ["Follower change", (p) => measured(p.followerChange, signed)],
];

function signed(value: number | null): string {
  return value !== null && value > 0 ? `+${formatNumber(value)}` : formatNumber(value);
}

function measured(m: MeasuredDto, format: (v: number | null) => string): string {
  if (m.value === null) return NOT_AVAILABLE;
  const days =
    m.observedDays < m.totalDays ? ` (data for ${coverage(m.observedDays, m.totalDays)})` : "";
  return `${format(m.value)}${days}`;
}

/** The campaign's linked posts against the account's posts from the same number of days before. */
export function CampaignPerformance({ campaignId }: { campaignId: string }) {
  const perf = useResource<CampaignPerformanceDto>(`/strategy/campaigns/${campaignId}/performance`);
  return (
    <ResourceView resource={perf}>
      {(data) =>
        !data.campaign || !data.baseline ? (
          <p className="muted">
            This campaign has not started yet, so there is nothing to compare.
          </p>
        ) : (
          <Comparison campaign={data.campaign} baseline={data.baseline} posts={data.posts} />
        )
      }
    </ResourceView>
  );
}

function Comparison({
  campaign,
  baseline,
  posts,
}: {
  campaign: PeriodPerformanceDto;
  baseline: PeriodPerformanceDto;
  posts: CampaignPerformanceDto["posts"];
}) {
  return (
    <div className="stack">
      {posts.length === 0 && (
        <p className="banner">
          No posts are linked yet. Link the campaign's posts to measure them.
        </p>
      )}
      <DataTable
        headers={[
          "",
          `Campaign (${formatPeriod(campaign.window)})`,
          `Before (${formatPeriod(baseline.window)})`,
        ]}
        rows={PERFORMANCE_ROWS.map(([label, value]) => [label, value(campaign), value(baseline)])}
      />
      <p className="small muted">
        Campaign posts are the posts you linked, directly or through a published plan item. The
        baseline is every other post published in the days before. Follower change needs a follower
        count on the day before and the last day of each window.
      </p>
      <ul className="small">
        {posts.map((p) => (
          <li key={p.id}>
            <Link to={`/posts/${p.id}`}>{formatDate(p.publishedAt, p.timeKnown)}</Link>:{" "}
            {p.excerpt ?? "(no text)"}
          </li>
        ))}
      </ul>
    </div>
  );
}
