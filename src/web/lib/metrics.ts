import { formatNumber, formatPercent } from "./format";

export type MetricKey =
  | "impressions"
  | "engagements"
  | "engagement_rate"
  | "reactions"
  | "comments"
  | "reposts"
  | "followers"
  | "new_followers"
  | "posts";

/** A "ratio" metric travels to and from the API as a fraction (0.03) but is typed as 3 (%). */
const METRICS: Record<MetricKey, { label: string; unit: "count" | "ratio" }> = {
  impressions: { label: "Impressions", unit: "count" },
  engagements: { label: "Engagements", unit: "count" },
  engagement_rate: { label: "Engagement rate", unit: "ratio" },
  reactions: { label: "Reactions", unit: "count" },
  comments: { label: "Comments", unit: "count" },
  reposts: { label: "Reposts", unit: "count" },
  followers: { label: "Followers", unit: "count" },
  new_followers: { label: "New followers", unit: "count" },
  posts: { label: "Posts published", unit: "count" },
};

const isRatio = (key: MetricKey) => METRICS[key].unit === "ratio";

export const metricLabel = (key: MetricKey) => METRICS[key].label;

export const metricInputLabel = (key: MetricKey, label: string) =>
  isRatio(key) ? `${label} (%)` : label;

/** An empty input is null (no value given), never zero. */
export function parseMetricInput(key: MetricKey, raw: string): number | null {
  if (raw.trim() === "") return null;
  const value = Number(raw);
  return isRatio(key) ? value / 100 : value;
}

export const formatMetric = (key: MetricKey, value: number | null) =>
  isRatio(key) ? formatPercent(value, 2) : formatNumber(value);

/** `[key, label]` pairs for a select; `describe` adds page-specific context to the label. */
export const metricOptions = (
  keys: MetricKey[],
  describe: (key: MetricKey) => string = metricLabel,
): [MetricKey, string][] => keys.map((key) => [key, describe(key)]);
