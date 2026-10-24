import { RECENT_DAYS, addDays, lastDays } from "../../domain/dates";
import { type PostRecord, segmentPerformance } from "../../domain/posts";
import type { AudienceDto, DashboardDto, DataStatusDto } from "../../../shared/analytics-types";
import type { PostDetailDto } from "../../../shared/post-types";
import { type Loaded, accountKpis, accountRuleInsights, accountSeries } from "./account-series";
import type { AudienceSnapshot, MetricObservation } from "./ports";
import { baselineFor, comparablePosts, rankedRecentPosts } from "./post-selection";
import {
  ruleInsightDto,
  sourceLabel,
  toMetricsDto,
  toPostSummary,
  toSegmentDto,
} from "./presenters";

export interface DashboardView {
  status: DataStatusDto;
  asOf: string;
  periodDays: number;
  tzOffsetMinutes: number;
}

const summaryOf = (data: Loaded) => (p: PostRecord) =>
  toPostSummary(p, data.bands.get(p.id) ?? "unrated");

export function toDashboard(data: Loaded, view: DashboardView): DashboardDto {
  const { status, asOf, periodDays } = view;
  const summary = summaryOf(data);
  const ranked = rankedRecentPosts(data.posts, asOf);
  const recent = lastDays(asOf, RECENT_DAYS);
  return {
    status,
    periodDays,
    kpis: accountKpis(data, asOf, periodDays),
    impressionsTrend: accountSeries(data, "impressions", "day", recent, 7),
    followersTrend: accountSeries(data, "followers", "day", recent, 0),
    recentPosts: data.posts.slice(0, 5).map(summary),
    topPosts: ranked.top.map(summary),
    bottomPosts: ranked.bottom.map(summary),
    themes: segmentPerformance(data.posts, (p) => p.topics)
      .filter((s) => s.posts >= 2)
      .slice(0, 6)
      .map(toSegmentDto),
    insights: accountRuleInsights(data, asOf, view.tzOffsetMinutes).map((i) =>
      ruleInsightDto(i, status.hasDemoData),
    ),
  };
}

export function toPostDetail(
  data: Loaded,
  post: PostRecord,
  observations: MetricObservation[],
): PostDetailDto {
  const summary = summaryOf(data);
  return {
    post: {
      ...summary(post),
      text: post.text,
      providers: post.providers.map(sourceLabel),
      externalId: post.externalId,
    },
    observations: observations.map((o) => ({
      observedOn: o.observedOn,
      source: sourceLabel(o.provider),
      metrics: toMetricsDto(o.metrics),
      period: o.period,
    })),
    baseline: toSegmentDto(baselineFor(post, data.posts)),
    comparable: comparablePosts(post, data.posts).map(summary),
  };
}

/** The latest audience snapshot by dimension, beside a year of weekly follower series. */
export function toAudience(
  data: Loaded,
  snapshot: AudienceSnapshot | null,
  to: string,
): AudienceDto {
  const year = { from: addDays(to, -364), to };
  return {
    observedOn: snapshot?.observedOn ?? null,
    source: snapshot ? sourceLabel(snapshot.provider) : null,
    dimensions: byDimension(snapshot),
    followers: accountSeries(data, "followers", "week", year, 0),
    newFollowers: accountSeries(data, "new_followers", "week", year, 0),
  };
}

function byDimension(snapshot: AudienceSnapshot | null) {
  const dimensions = new Map<string, { value: string; share: number | null }[]>();
  for (const s of snapshot?.segments ?? []) {
    dimensions.set(s.dimension, [
      ...(dimensions.get(s.dimension) ?? []),
      { value: s.value, share: s.share },
    ]);
  }
  return [...dimensions.entries()].map(([dimension, segments]) => ({ dimension, segments }));
}
