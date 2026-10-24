import { addDays, daysBetween, isWithin, weekStart } from "./dates";
import { type Growth, growth, sumOrNull } from "./stats";

export type Granularity = "day" | "week" | "month";

/**
 * How a metric combines over time. Flows (impressions) add up; stocks (followers) do not,
 * so a week of followers is the last known value, not the sum of seven days.
 */
export type Aggregation = "sum" | "last";

export interface DatedValue {
  day: string;
  value: number | null;
}

export interface SeriesPoint {
  period: string;
  value: number | null;
  /** Days in the bucket that carried a known value. */
  observedDays: number;
}

function periodKey(day: string, granularity: Granularity): string {
  if (granularity === "day") return day;
  if (granularity === "week") return weekStart(day);
  return `${day.slice(0, 7)}-01`;
}

function combine(values: DatedValue[], aggregation: Aggregation): number | null {
  if (aggregation === "sum") return sumOrNull(values.map((v) => v.value));
  const known = values.filter((v) => v.value !== null).sort((a, b) => a.day.localeCompare(b.day));
  return known.at(-1)?.value ?? null;
}

export function aggregate(
  values: readonly DatedValue[],
  granularity: Granularity,
  aggregation: Aggregation,
): SeriesPoint[] {
  const buckets = new Map<string, DatedValue[]>();
  for (const value of values) {
    const key = periodKey(value.day, granularity);
    buckets.set(key, [...(buckets.get(key) ?? []), value]);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, bucket]) => ({
      period,
      value: combine(bucket, aggregation),
      observedDays: bucket.filter((v) => v.value !== null).length,
    }));
}

/** Inserts empty buckets so charts show gaps instead of drawing a line across missing days. */
export function fillPeriods(
  points: readonly SeriesPoint[],
  from: string,
  to: string,
  granularity: Granularity,
): SeriesPoint[] {
  const byPeriod = new Map(points.map((p) => [p.period, p]));
  const filled: SeriesPoint[] = [];
  const seen = new Set<string>();
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const period = periodKey(day, granularity);
    if (seen.has(period)) continue;
    seen.add(period);
    filled.push(byPeriod.get(period) ?? { period, value: null, observedDays: 0 });
  }
  return filled;
}

/** Trailing mean over the last `window` points, ignoring unknown values. */
export function rollingAverage(points: readonly SeriesPoint[], window: number): SeriesPoint[] {
  return points.map((point, index) => {
    const slice = points.slice(Math.max(0, index - window + 1), index + 1);
    const known = slice.filter((p) => p.value !== null);
    const value =
      known.length === 0 ? null : known.reduce((t, p) => t + (p.value as number), 0) / known.length;
    return { period: point.period, value, observedDays: point.observedDays };
  });
}

interface PeriodSummary {
  from: string;
  to: string;
  value: number | null;
  observedDays: number;
  totalDays: number;
}

export interface PeriodComparison {
  current: PeriodSummary;
  previous: PeriodSummary;
  /** For flows, `percent` compares averages per observed day (see changeBetween). */
  change: Growth;
}

function summarise(
  values: readonly DatedValue[],
  from: string,
  to: string,
  aggregation: Aggregation,
): PeriodSummary {
  const inRange = values.filter((v) => isWithin(v.day, from, to));
  return {
    from,
    to,
    value: combine(inRange, aggregation),
    observedDays: inRange.filter((v) => v.value !== null).length,
    totalDays: daysBetween(from, to) + 1,
  };
}

/** Compares the `days` ending at `end` (inclusive) with the equally long period before it. */
export function comparePeriods(
  values: readonly DatedValue[],
  end: string,
  days: number,
  aggregation: Aggregation,
): PeriodComparison {
  const currentFrom = addDays(end, -(days - 1));
  const previousTo = addDays(currentFrom, -1);
  const current = summarise(values, currentFrom, end, aggregation);
  const previous = summarise(values, addDays(previousTo, -(days - 1)), previousTo, aggregation);
  return { current, previous, change: changeBetween(previous, current, aggregation) };
}

/**
 * For flows, compares the average per observed day, so a period with half its days missing
 * is not read as a halving. Equal to comparing totals when both periods are fully covered.
 */
function changeBetween(previous: PeriodSummary, current: PeriodSummary, aggregation: Aggregation) {
  if (aggregation === "last") return growth(previous.value, current.value);
  const perDay = (p: PeriodSummary) => (p.value === null ? null : p.value / p.observedDays);
  const { percent } = growth(perDay(previous), perDay(current));
  // A difference of totals only means something when both cover the same number of days.
  const comparable = previous.observedDays === current.observedDays;
  const absolute = comparable ? growth(previous.value, current.value).absolute : null;
  return { absolute, percent };
}

function daysInPeriod(period: string, granularity: Granularity): number {
  if (granularity === "day") return 1;
  if (granularity === "week") return 7;
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, month ?? 1, 0)).getUTCDate();
}

/**
 * A summed week or month at the edge of the range usually covers only part of the period
 * (the range starts mid-week, or the export ends mid-month), and its smaller total would read
 * as a drop. Such edge buckets become unknown; incomplete buckets inside the range stay, as
 * those are real gaps in the source.
 */
export function dropPartialEdges(
  points: readonly SeriesPoint[],
  granularity: Granularity,
): SeriesPoint[] {
  if (granularity === "day") return [...points];
  const partial = (p: SeriesPoint | undefined) =>
    p !== undefined && p.observedDays < daysInPeriod(p.period, granularity);
  const last = points.length - 1;
  return points.map((p, i) => ((i === 0 || i === last) && partial(p) ? { ...p, value: null } : p));
}

/**
 * Engagements over impressions, counting only days that report both, so a day with
 * impressions but no engagement figure does not dilute the rate. Null without impressions.
 */
export function pairedRate(
  impressions: readonly DatedValue[],
  engagements: readonly DatedValue[],
  from: string,
  to: string,
): { rate: number | null; days: number } {
  const usable = (v: DatedValue) => v.value !== null && isWithin(v.day, from, to);
  const engaged = new Map(engagements.filter(usable).map((v) => [v.day, v.value as number]));
  const paired = impressions.filter((v) => usable(v) && engaged.has(v.day));
  const seen = paired.reduce((t, v) => t + (v.value as number), 0);
  const reacted = paired.reduce((t, v) => t + (engaged.get(v.day) as number), 0);
  return { rate: seen === 0 ? null : reacted / seen, days: paired.length };
}
