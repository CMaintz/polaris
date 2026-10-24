import { type Clock } from "../clock";
import type { ContentStore } from "../content/ports";
import { NotFoundError } from "../errors";
import { RECENT_DAYS, addDays, lastDays, todayUtc } from "../../domain/dates";
import {
  type PostRecord,
  listingProviders,
  postingTimes,
  segmentPerformance,
} from "../../domain/posts";
import type { Granularity } from "../../domain/timeseries";
import type {
  AudienceDto,
  BreakdownsDto,
  DashboardDto,
  DataStatusDto,
  PostDetailDto,
  PostPageDto,
} from "../../../shared/api-types";
import type { ContentQueries } from "./ports";
import {
  type Loaded,
  type SeriesMetric,
  accountKpis,
  accountRuleInsights,
  accountSeries,
  dailyValues,
  providersOf,
} from "./account-series";
import { holdsDataset, loadAccountData } from "./account-data";
import {
  type PostQuery,
  baselineFor,
  byMetric,
  byPublished,
  comparablePosts,
  matchesQuery,
  rankedRecentPosts,
} from "./post-selection";
import {
  ruleInsightDto,
  sourceLabel,
  toMetricsDto,
  toPostSummary,
  toSegmentDto,
} from "./presenters";

export class AnalyticsService {
  constructor(
    private readonly content: ContentStore,
    private readonly queries: ContentQueries,
    private readonly clock: Clock,
  ) {}

  async dashboard(
    userId: string,
    periodDays: number,
    tzOffsetMinutes: number,
  ): Promise<DashboardDto> {
    const data = await this.load(userId);
    const status = await this.status(data);
    const asOf = data.asOf ?? todayUtc(this.clock());
    const summary = (p: PostRecord) => toPostSummary(p, data.bands.get(p.id) ?? "unrated");
    const ranked = rankedRecentPosts(data.posts, asOf);
    return {
      status,
      periodDays,
      kpis: accountKpis(data, asOf, periodDays),
      impressionsTrend: accountSeries(data, "impressions", "day", lastDays(asOf, RECENT_DAYS), 7),
      followersTrend: accountSeries(data, "followers", "day", lastDays(asOf, RECENT_DAYS), 0),
      recentPosts: data.posts.slice(0, 5).map(summary),
      topPosts: ranked.top.map(summary),
      bottomPosts: ranked.bottom.map(summary),
      themes: segmentPerformance(data.posts, (p) => p.topics)
        .filter((s) => s.posts >= 2)
        .slice(0, 6)
        .map(toSegmentDto),
      insights: accountRuleInsights(data, asOf, tzOffsetMinutes).map((i) =>
        ruleInsightDto(i, status.hasDemoData),
      ),
    };
  }

  async insights(userId: string, tzOffsetMinutes: number) {
    const data = await this.load(userId);
    const status = await this.status(data);
    if (!data.asOf) return [];
    return accountRuleInsights(data, data.asOf, tzOffsetMinutes).map((i) =>
      ruleInsightDto(i, status.hasDemoData),
    );
  }

  async posts(userId: string, query: PostQuery): Promise<PostPageDto> {
    const data = await this.load(userId);
    const matches = data.posts
      .filter((p) => matchesQuery(p, query, data.bands))
      .sort(query.sort === "published" ? byPublished(query.dir) : byMetric(query.sort, query.dir));
    return {
      total: matches.length,
      items: matches
        .slice(query.offset, query.offset + query.limit)
        .map((p) => toPostSummary(p, data.bands.get(p.id) ?? "unrated")),
      topics: [...new Set(data.posts.flatMap((p) => p.topics))].sort(),
    };
  }

  async post(userId: string, postId: string): Promise<PostDetailDto> {
    const data = await this.load(userId);
    const post = data.posts.find((p) => p.id === postId);
    if (!post || !data.account) throw new NotFoundError("Post");
    const observations = await this.queries.observations(data.account.id, post.id);
    return {
      post: {
        ...toPostSummary(post, data.bands.get(post.id) ?? "unrated"),
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
      comparable: comparablePosts(post, data.posts).map((p) =>
        toPostSummary(p, data.bands.get(p.id) ?? "unrated"),
      ),
    };
  }

  async timeseries(
    userId: string,
    metric: SeriesMetric,
    granularity: Granularity,
    range: { from?: string; to?: string; days?: number },
    rollingWindow: number,
  ) {
    const data = await this.load(userId);
    const to = range.to ?? data.asOf ?? todayUtc(this.clock());
    const from = range.from ?? lastDays(to, range.days ?? RECENT_DAYS).from;
    return {
      metric,
      granularity,
      from,
      to,
      source: sourceLabel(
        metric === "posts" ? listingProviders(data.posts) : providersOf(data.days),
      ),
      points: accountSeries(data, metric, granularity, { from, to }, rollingWindow),
    };
  }

  async breakdowns(userId: string, tzOffsetMinutes: number): Promise<BreakdownsDto> {
    const { posts } = await this.load(userId);
    const times = postingTimes(posts, tzOffsetMinutes);
    return {
      contentTypes: segmentPerformance(posts, (p) => [p.contentType]).map(toSegmentDto),
      topics: segmentPerformance(posts, (p) => p.topics).map(toSegmentDto),
      weekdays: times.weekdays.map(toSegmentDto),
      hours: times.hours.map(toSegmentDto),
      postsWithTime: posts.filter((p) => p.timeKnown).length,
    };
  }

  async measurements(userId: string) {
    const data = await this.load(userId);
    return {
      asOf: data.asOf,
      posts: data.posts,
      inputs: {
        impressions: dailyValues(data, "impressions"),
        engagements: dailyValues(data, "engagements"),
        followers: dailyValues(data, "followers"),
        posts: dailyValues(data, "posts"),
      },
    };
  }

  async audience(userId: string): Promise<AudienceDto> {
    const data = await this.load(userId);
    const snapshot = data.account ? await this.queries.latestAudience(data.account.id) : null;
    const to = data.asOf ?? todayUtc(this.clock());
    const dimensions = new Map<string, { value: string; share: number | null }[]>();
    for (const s of snapshot?.segments ?? []) {
      dimensions.set(s.dimension, [
        ...(dimensions.get(s.dimension) ?? []),
        { value: s.value, share: s.share },
      ]);
    }
    return {
      observedOn: snapshot?.observedOn ?? null,
      source: snapshot ? sourceLabel(snapshot.provider) : null,
      dimensions: [...dimensions.entries()].map(([dimension, segments]) => ({
        dimension,
        segments,
      })),
      followers: accountSeries(data, "followers", "week", { from: addDays(to, -364), to }, 0),
      newFollowers: accountSeries(
        data,
        "new_followers",
        "week",
        { from: addDays(to, -364), to },
        0,
      ),
    };
  }

  private load(userId: string): Promise<Loaded> {
    return loadAccountData(this.content, this.queries, userId);
  }

  private async status(data: Loaded): Promise<DataStatusDto> {
    return {
      asOf: data.asOf,
      hasLinkedInData: await holdsDataset(this.content, data, "linkedin"),
      hasDemoData: await holdsDataset(this.content, data, "demo"),
      posts: data.posts.length,
      postsWithMetrics: data.posts.filter((p) => p.metricsObservedOn !== null).length,
    };
  }
}
