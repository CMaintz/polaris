import type { ContentType, Dataset } from "./content";
import { addDays, dayOf, daysBetween } from "./dates";
import type { DatedValue } from "./timeseries";
import { type PostMetricKey, type PostMetrics, postMetricValue } from "./metrics";
import { median, percentile } from "./stats";

/** A stored post with metrics folded over all its observations, oldest first. */
export interface PostRecord {
  id: string;
  externalId: string;
  dataset: Dataset;
  url: string | null;
  text: string | null;
  publishedAt: string | null;
  timeKnown: boolean;
  contentType: ContentType;
  providers: string[];
  topics: string[];
  metrics: PostMetrics;
  metricsObservedOn: string | null;
  metricsPeriod: { from: string; to: string } | null;
  metricsProvider: string | null;
}

export type Band = "top" | "middle" | "bottom" | "unrated";

const MIN_POSTS_FOR_BANDS = 4;

/**
 * Quartile bands by a metric (ADR 0015). Posts without the metric are "unrated", never
 * "bottom"; with too few rated posts, or no spread, quartiles mean nothing, so all are middle.
 */
export function assignBands(
  posts: readonly PostRecord[],
  key: PostMetricKey = "engagements",
): Map<string, Band> {
  const values = posts.map((p) => postMetricValue(p.metrics, key));
  const rated = values.filter((v) => v !== null).length;
  const low = percentile(values, 0.25);
  const high = percentile(values, 0.75);
  const spread = rated >= MIN_POSTS_FOR_BANDS && low !== null && high !== null && high > low;
  return new Map(
    posts.map((post, i) => {
      const value = values[i] ?? null;
      if (value === null) return [post.id, "unrated"];
      if (!spread) return [post.id, "middle"];
      if (value >= (high as number)) return [post.id, "top"];
      if (value <= (low as number)) return [post.id, "bottom"];
      return [post.id, "middle"];
    }),
  );
}

export interface SegmentPerformance {
  key: string;
  posts: number;
  /** Posts that carry metrics; medians are over these only. */
  withMetrics: number;
  medianImpressions: number | null;
  medianEngagements: number | null;
  medianEngagementRate: number | null;
}

export function summarisePosts(key: string, posts: readonly PostRecord[]): SegmentPerformance {
  const values = (k: PostMetricKey) => posts.map((p) => postMetricValue(p.metrics, k));
  return {
    key,
    posts: posts.length,
    withMetrics: values("engagements").filter((v) => v !== null).length,
    medianImpressions: median(values("impressions")),
    medianEngagements: median(values("engagements")),
    medianEngagementRate: median(values("engagement_rate")),
  };
}

/** A post may sit in several groups (e.g. topics), so group sizes can sum past the total. */
export function segmentPerformance(
  posts: readonly PostRecord[],
  keysOf: (post: PostRecord) => string[],
): SegmentPerformance[] {
  const groups = new Map<string, PostRecord[]>();
  for (const post of posts) {
    for (const key of keysOf(post)) groups.set(key, [...(groups.get(key) ?? []), post]);
  }
  return [...groups.entries()]
    .map(([key, group]) => summarisePosts(key, group))
    .sort((a, b) => (b.medianEngagements ?? -1) - (a.medianEngagements ?? -1));
}

/** Local weekday (0 = Monday) and hour, or null hour when only the date is known. */
function localSlot(post: PostRecord, tzOffsetMinutes: number) {
  if (!post.publishedAt) return null;
  const instant = new Date(post.publishedAt);
  const local = post.timeKnown ? new Date(instant.getTime() + tzOffsetMinutes * 60_000) : instant;
  return {
    weekday: (local.getUTCDay() + 6) % 7,
    hour: post.timeKnown ? local.getUTCHours() : null,
  };
}

export function postingTimes(posts: readonly PostRecord[], tzOffsetMinutes: number) {
  const slots = new Map(posts.map((post) => [post.id, localSlot(post, tzOffsetMinutes)]));
  return {
    weekdays: segmentPerformance(posts, (p) => {
      const slot = slots.get(p.id);
      return slot ? [String(slot.weekday)] : [];
    }),
    hours: segmentPerformance(posts, (p) => {
      const hour = slots.get(p.id)?.hour;
      return hour === null || hour === undefined ? [] : [String(hour)];
    }),
  };
}

/**
 * Whether the post came from a source that lists every post (the data archive, or the demo
 * set). Analytics exports list only top posts, so they cannot support a post count.
 */
export function isFullyListed(post: PostRecord): boolean {
  return post.dataset === "demo" || post.providers.includes("linkedin-data-export");
}

/**
 * Days a post count is measurable: from the first to the last fully listed post. Before or
 * after that, a day without posts may just be a day the import did not cover.
 */
export function postCountCoverage(
  posts: readonly PostRecord[],
): { from: string; to: string } | null {
  const days = posts
    .filter((p) => isFullyListed(p) && p.publishedAt)
    .map((p) => dayOf(p.publishedAt as string))
    .sort();
  const from = days[0];
  const to = days.at(-1);
  return from && to ? { from, to } : null;
}

/** Posts per day inside the measurable range, with zero for days without posts. */
export function dailyPostCounts(posts: readonly PostRecord[]): DatedValue[] {
  const coverage = postCountCoverage(posts);
  if (!coverage) return [];
  const counts = new Map<string, number>();
  for (const post of posts.filter(isFullyListed)) {
    const day = dayOf(post.publishedAt as string);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return Array.from({ length: daysBetween(coverage.from, coverage.to) + 1 }, (_v, i) => {
    const day = addDays(coverage.from, i);
    return { day, value: counts.get(day) ?? 0 };
  });
}
