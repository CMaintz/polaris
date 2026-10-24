import { type Clock } from "../clock";
import type { ContentStore } from "../content/ports";
import { NotFoundError } from "../errors";
import { RECENT_DAYS, lastDays, todayUtc } from "../../domain/dates";
import { listingProviders, postingTimes, segmentPerformance } from "../../domain/posts";
import type { Granularity } from "../../domain/timeseries";
import type {
  AudienceDto,
  BreakdownsDto,
  DashboardDto,
  DataStatusDto,
} from "../../../shared/analytics-types";
import type { PostDetailDto, PostPageDto } from "../../../shared/post-types";
import type { ContentQueries } from "./ports";
import {
  type Loaded,
  type SeriesMetric,
  accountRuleInsights,
  accountSeries,
  dailyValues,
  providersOf,
} from "./account-series";
import { holdsDataset, loadAccountData } from "./account-data";
import { toAudience, toDashboard, toPostDetail } from "./page-views";
import { type PostQuery, byMetric, byPublished, matchesQuery } from "./post-selection";
import { ruleInsightDto, sourceLabel, toPostSummary, toSegmentDto } from "./presenters";

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
    return toDashboard(data, { status, asOf, periodDays, tzOffsetMinutes });
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
    return toPostDetail(data, post, await this.queries.observations(data.account.id, post.id));
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
    return toAudience(data, snapshot, data.asOf ?? todayUtc(this.clock()));
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
