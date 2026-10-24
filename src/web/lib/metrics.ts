import type { GoalMetricDto, PostMetricDto, SeriesMetricDto } from "../../shared/api-types";
import { formatNumber, formatPercent } from "./format";

export type MetricKey = GoalMetricDto | PostMetricDto | SeriesMetricDto;

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

/** `[key, label]` pairs for a select; `describe` adds context to the label. */
export const metricOptions = <K extends MetricKey>(
  keys: K[],
  describe: (key: K) => string = metricLabel,
): [K, string][] => keys.map((key) => [key, describe(key)]);

// The sets below mirror the metric enums the goal and experiment routes accept.
const GOAL_SCOPE: Partial<Record<GoalMetricDto, string>> = {
  followers: "reach a total",
  impressions: "total over the period",
  engagements: "total over the period",
};

export const goalMetricLabel = (key: GoalMetricDto) =>
  GOAL_SCOPE[key] ? `${metricLabel(key)} (${GOAL_SCOPE[key]})` : metricLabel(key);

export const GOAL_METRICS = metricOptions<GoalMetricDto>(
  ["followers", "impressions", "engagements", "posts", "engagement_rate"],
  goalMetricLabel,
);

export const experimentMetricLabel = (key: PostMetricDto) => `${metricLabel(key)} per post`;

export const EXPERIMENT_METRICS = metricOptions<PostMetricDto>(
  ["engagements", "impressions", "engagement_rate", "comments", "reactions", "reposts"],
  experimentMetricLabel,
);
