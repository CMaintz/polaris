import type { Account } from "../content/ports";
import { PERIOD_DAYS, dayOf } from "../../domain/dates";
import { growth } from "../../domain/stats";
import { type Band, type PostRecord, dailyPostCounts, listingProviders } from "../../domain/posts";
import { ruleInsights } from "../../domain/insights";
import {
  type Aggregation,
  type DatedValue,
  type Granularity,
  aggregate,
  comparePeriods,
  dropPartialEdges,
  fillPeriods,
  pairedRate,
  rollingAverage,
} from "../../domain/timeseries";
import type { KpiDto, SeriesPointDto } from "../../../shared/api-types";
import type { AccountDay } from "./ports";
import { sourceLabel } from "./presenters";

export type SeriesMetric = "impressions" | "engagements" | "followers" | "new_followers" | "posts";

const SERIES: Record<SeriesMetric, { aggregation: Aggregation; field?: keyof AccountDay }> = {
  impressions: { aggregation: "sum", field: "impressions" },
  engagements: { aggregation: "sum", field: "engagements" },
  followers: { aggregation: "last", field: "followers" },
  new_followers: { aggregation: "sum", field: "newFollowers" },
  posts: { aggregation: "sum" },
};

export interface Loaded {
  account: Account | null;
  posts: PostRecord[];
  days: AccountDay[];
  bands: Map<string, Band>;
  asOf: string | null;
}

export function rateKpi(data: Loaded, impressions: KpiDto): KpiDto {
  const rate = (period: { from: string; to: string }) =>
    pairedRate(
      dailyValues(data, "impressions"),
      dailyValues(data, "engagements"),
      period.from,
      period.to,
    );
  const value = rate(impressions.period);
  const previous = rate(impressions.previousPeriod);
  return {
    ...impressions,
    key: "engagement_rate",
    label: "Engagement rate",
    unit: "ratio",
    value: value.rate,
    previous: previous.rate,
    coverage: { observedDays: value.days, totalDays: impressions.coverage.totalDays },
    change: {
      absolute: value.rate === null || previous.rate === null ? null : value.rate - previous.rate,
      percent: growth(previous.rate, value.rate).percent,
    },
  };
}

export function dailyValues(data: Loaded, metric: SeriesMetric): DatedValue[] {
  const field = SERIES[metric].field;
  if (field) return data.days.map((d) => ({ day: d.day, value: d[field] as number | null }));
  return dailyPostCounts(data.posts);
}

export function providersOf(days: AccountDay[]): string | null {
  const ids = new Set(days.flatMap((d) => d.provider.split(",")));
  return ids.size === 0 ? null : [...ids].join(",");
}

export function latestDay(posts: PostRecord[], days: AccountDay[]): string | null {
  const candidates = [
    ...days.map((d) => d.day),
    ...posts.flatMap((p) => (p.publishedAt ? [dayOf(p.publishedAt)] : [])),
  ];
  return candidates.length === 0 ? null : candidates.reduce((a, b) => (a > b ? a : b));
}

export function accountRuleInsights(data: Loaded, asOf: string, tzOffsetMinutes: number) {
  const impressions = dailyValues(data, "impressions");
  return ruleInsights({
    posts: data.posts,
    asOf,
    impressions:
      impressions.length > 0 ? comparePeriods(impressions, asOf, PERIOD_DAYS, "sum") : null,
    sources: { posts: "Your imported posts", account: sourceLabel(providersOf(data.days)) },
    tzOffsetMinutes,
  });
}

export function accountKpis(data: Loaded, asOf: string, days: number): KpiDto[] {
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
    kpi("posts", "Posts published", "sum", sourceLabel(listingProviders(data.posts))),
  ];
}

export function accountSeries(
  data: Loaded,
  metric: SeriesMetric,
  granularity: Granularity,
  { from, to }: { from: string; to: string },
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
