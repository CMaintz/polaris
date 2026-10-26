import type { Account } from "../content/ports";
import { dayOf } from "../../domain/dates";
import { growth } from "../../domain/stats";
import { type Band, type PostRecord, dailyPostCounts } from "../../domain/posts";
import type { Aggregation, DatedValue } from "../../domain/timeseries";
import type { KpiDto } from "../../../shared/api-types";
import type { AccountDay } from "./ports";

export type SeriesMetric = "impressions" | "engagements" | "followers" | "new_followers" | "posts";

export const SERIES: Record<SeriesMetric, { aggregation: Aggregation; field?: keyof AccountDay }> =
  {
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

/**
 * Engagement rate over a period: engagements over impressions, counting only days that
 * report both, so a day with impressions but no engagement figure does not dilute it.
 */
export function rateKpi(data: Loaded, impressions: KpiDto): KpiDto {
  const value = pairedRate(data.days, impressions.period.from, impressions.period.to);
  const previous = pairedRate(
    data.days,
    impressions.previousPeriod.from,
    impressions.previousPeriod.to,
  );
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

function pairedRate(days: AccountDay[], from: string, to: string) {
  const paired = days.filter(
    (d) => d.day >= from && d.day <= to && d.impressions !== null && d.engagements !== null,
  );
  const impressions = paired.reduce((t, d) => t + (d.impressions as number), 0);
  const engagements = paired.reduce((t, d) => t + (d.engagements as number), 0);
  return { rate: impressions === 0 ? null : engagements / impressions, days: paired.length };
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
