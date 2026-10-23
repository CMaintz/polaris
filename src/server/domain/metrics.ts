/**
 * Post-level metrics as observed from a provider. Every field is nullable: null means the
 * source did not report it, which is different from a measured zero.
 */
export interface PostMetrics {
  impressions: number | null;
  reactions: number | null;
  comments: number | null;
  reposts: number | null;
  clicks: number | null;
  /** Provider-reported total, when the provider gives one directly. */
  engagements: number | null;
}

export const EMPTY_METRICS: PostMetrics = {
  impressions: null,
  reactions: null,
  comments: null,
  reposts: null,
  clicks: null,
  engagements: null,
};

/**
 * Prefers the provider's own total. Otherwise sums reactions, comments and reposts, but
 * only when all three are known: a sum over partial data would understate engagement
 * while looking like a measurement.
 */
export function totalEngagements(metrics: PostMetrics): number | null {
  if (metrics.engagements !== null) return metrics.engagements;
  const { reactions, comments, reposts } = metrics;
  if (reactions === null || comments === null || reposts === null) return null;
  return reactions + comments + reposts;
}

export function engagementRate(metrics: PostMetrics): number | null {
  const engagements = totalEngagements(metrics);
  if (engagements === null || metrics.impressions === null || metrics.impressions === 0) {
    return null;
  }
  return engagements / metrics.impressions;
}

export type PostMetricKey =
  "impressions" | "engagements" | "engagement_rate" | "reactions" | "comments" | "reposts";

export function postMetricValue(metrics: PostMetrics, key: PostMetricKey): number | null {
  if (key === "engagements") return totalEngagements(metrics);
  if (key === "engagement_rate") return engagementRate(metrics);
  return metrics[key];
}

/** Merges two observations of the same post: later known values win, nulls never erase. */
export function mergeMetrics(earlier: PostMetrics, later: PostMetrics): PostMetrics {
  const pick = (a: number | null, b: number | null) => (b === null ? a : b);
  return {
    impressions: pick(earlier.impressions, later.impressions),
    reactions: pick(earlier.reactions, later.reactions),
    comments: pick(earlier.comments, later.comments),
    reposts: pick(earlier.reposts, later.reposts),
    clicks: pick(earlier.clicks, later.clicks),
    engagements: pick(earlier.engagements, later.engagements),
  };
}
