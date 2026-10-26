import { type Clock } from "../clock";
import type { ContentStore } from "../content/ports";
import { NotFoundError } from "../errors";
import { addDays, dayOf, todayUtc } from "../../domain/dates";
import { ruleInsights } from "../../domain/insights";
import { postMetricValue } from "../../domain/metrics";
import {
  type PostRecord,
  assignBands,
  postingTimes,
  segmentPerformance,
  summarisePosts,
} from "../../domain/posts";
import {
  type Aggregation,
  type Granularity,
  aggregate,
  comparePeriods,
  dropPartialEdges,
  fillPeriods,
  rollingAverage,
} from "../../domain/timeseries";
import type {
  AudienceDto,
  BreakdownsDto,
  DashboardDto,
  DataStatusDto,
  KpiDto,
  PostDetailDto,
  PostPageDto,
  SeriesPointDto,
} from "../../../shared/api-types";
import type { ContentQueries } from "./ports";
import {
  type Loaded,
  SERIES,
  type SeriesMetric,
  dailyValues,
  latestDay,
  providersOf,
  rateKpi,
} from "./account-series";
import {
  type PostQuery,
  byMetric,
  byPublished,
  comparablePosts,
  matchesQuery,
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
    const recent = data.posts.filter(
      (p) => p.publishedAt && dayOf(p.publishedAt) >= addDays(asOf, -89),
    );
    const ranked = recent
      .filter((p) => postMetricValue(p.metrics, "engagements") !== null)
      .sort(byMetric("engagements", "desc"));
    return {
      status,
      periodDays,
      kpis: this.kpis(data, asOf, periodDays),
      impressionsTrend: this.series(data, "impressions", "day", addDays(asOf, -89), asOf, 7),
      followersTrend: this.series(data, "followers", "day", addDays(asOf, -89), asOf, 0),
      recentPosts: data.posts.slice(0, 5).map(summary),
      topPosts: ranked.slice(0, 5).map(summary),
      bottomPosts: ranked.length >= 8 ? ranked.slice(-3).reverse().map(summary) : [],
      themes: segmentPerformance(data.posts, (p) => p.topics)
        .filter((s) => s.posts >= 2)
        .slice(0, 6)
        .map(toSegmentDto),
      insights: this.insightsFor(data, asOf, tzOffsetMinutes).map((i) =>
        ruleInsightDto(i, status.hasDemoData),
      ),
    };
  }

  async insights(userId: string, tzOffsetMinutes: number) {
    const data = await this.load(userId);
    const status = await this.status(data);
    if (!data.asOf) return [];
    return this.insightsFor(data, data.asOf, tzOffsetMinutes).map((i) =>
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
      baseline: toSegmentDto(
        summarisePosts(
          "all",
          data.posts.filter((p) => p.id !== post.id),
        ),
      ),
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
    const from = range.from ?? addDays(to, -((range.days ?? 90) - 1));
    return {
      metric,
      granularity,
      from,
      to,
      source: sourceLabel(metric === "posts" ? "linkedin-data-export" : providersOf(data.days)),
      points: this.series(data, metric, granularity, from, to, rollingWindow),
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

  /** Raw daily measurements and posts, for goals and experiments to evaluate against. */
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
      followers: this.series(data, "followers", "week", addDays(to, -364), to, 0),
      newFollowers: this.series(data, "new_followers", "week", addDays(to, -364), to, 0),
    };
  }

  private async load(userId: string): Promise<Loaded> {
    const account = await this.content.findAccount(userId);
    if (!account) return { account, posts: [], days: [], bands: new Map(), asOf: null };
    const [posts, days] = await Promise.all([
      this.queries.posts(account.id),
      this.queries.accountDays(account.id),
    ]);
    return { account, posts, days, bands: assignBands(posts), asOf: latestDay(posts, days) };
  }

  private async status(data: Loaded): Promise<DataStatusDto> {
    const has = async (dataset: "linkedin" | "demo") =>
      data.account ? this.content.hasDataset(data.account.id, dataset) : false;
    return {
      asOf: data.asOf,
      hasLinkedInData: await has("linkedin"),
      hasDemoData: await has("demo"),
      posts: data.posts.length,
      postsWithMetrics: data.posts.filter((p) => p.metricsObservedOn !== null).length,
    };
  }

  private insightsFor(data: Loaded, asOf: string, tzOffsetMinutes: number) {
    const impressions = dailyValues(data, "impressions");
    return ruleInsights({
      posts: data.posts,
      asOf,
      impressions: impressions.length > 0 ? comparePeriods(impressions, asOf, 28, "sum") : null,
      sources: { posts: "Your imported posts", account: sourceLabel(providersOf(data.days)) },
      tzOffsetMinutes,
    });
  }

  private kpis(data: Loaded, asOf: string, days: number): KpiDto[] {
    const account = sourceLabel(providersOf(data.days));
    const kpi = (
      key: SeriesMetric,
      label: string,
      aggregation: Aggregation,
      source: string,
    ): KpiDto => {
      const c = comparePeriods(dailyValues(data, key), asOf, days, aggregation);
      return {
        key,
        label,
        unit: "count",
        value: c.current.value,
        previous: c.previous.value,
        change: c.change,
        period: { from: c.current.from, to: c.current.to },
        previousPeriod: { from: c.previous.from, to: c.previous.to },
        coverage: { observedDays: c.current.observedDays, totalDays: c.current.totalDays },
        source,
      };
    };
    const impressions = kpi("impressions", "Impressions", "sum", account);
    const engagements = kpi("engagements", "Engagements", "sum", account);
    return [
      kpi("followers", "Followers", "last", account),
      impressions,
      engagements,
      rateKpi(data, impressions),
      kpi("posts", "Posts published", "sum", sourceLabel("linkedin-data-export")),
    ];
  }

  private series(
    data: Loaded,
    metric: SeriesMetric,
    granularity: Granularity,
    from: string,
    to: string,
    rollingWindow: number,
  ): SeriesPointDto[] {
    const inRange = dailyValues(data, metric).filter((v) => v.day >= from && v.day <= to);
    const { aggregation } = SERIES[metric];
    const filled = fillPeriods(aggregate(inRange, granularity, aggregation), from, to, granularity);
    const points = aggregation === "sum" ? dropPartialEdges(filled, granularity) : filled;
    const rolling = rollingWindow > 1 ? rollingAverage(points, rollingWindow) : null;
    return points.map((p, i) => ({
      period: p.period,
      value: p.value,
      rolling: rolling?.[i]?.value ?? null,
    }));
  }
}
