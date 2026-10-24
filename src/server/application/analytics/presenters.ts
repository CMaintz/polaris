import { LINKEDIN_DATA_EXPORT, displayText } from "../../domain/content";
import type { Insight } from "../../domain/insights";
import { type PostMetrics, engagementRate, totalEngagements } from "../../domain/metrics";
import type { Band, PostRecord, SegmentPerformance } from "../../domain/posts";
import type { InsightDto, MetricsDto, PostSummaryDto, SegmentDto } from "../../../shared/api-types";

const PROVIDER_LABELS: Record<string, string> = {
  [LINKEDIN_DATA_EXPORT]: "LinkedIn data archive",
  "linkedin-analytics-export": "LinkedIn analytics export",
  demo: "Demo data (synthetic)",
};

export function sourceLabel(providers: string | null): string {
  if (!providers) return "Not available";
  return providers
    .split(",")
    .map((id) => PROVIDER_LABELS[id] ?? id)
    .join(", ");
}

export function toMetricsDto(metrics: PostMetrics): MetricsDto {
  return {
    ...metrics,
    engagements: totalEngagements(metrics),
    engagementRate: engagementRate(metrics),
  };
}

const EXCERPT_LENGTH = 280;

export function toPostSummary(post: PostRecord, band: Band): PostSummaryDto {
  const text = displayText(post.text);
  return {
    id: post.id,
    url: post.url,
    excerpt: text && text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH)}...` : text,
    publishedAt: post.publishedAt,
    timeKnown: post.timeKnown,
    contentType: post.contentType,
    topics: post.topics,
    metrics: toMetricsDto(post.metrics),
    band,
    dataset: post.dataset,
    metricsObservedOn: post.metricsObservedOn,
    metricsPeriod: post.metricsPeriod,
    metricsSource: post.metricsProvider ? sourceLabel(post.metricsProvider) : null,
  };
}

export const toSegmentDto = (segment: SegmentPerformance): SegmentDto => ({ ...segment });

export function ruleInsightDto(insight: Insight, basedOnDemoData: boolean): InsightDto {
  return {
    ...insight,
    id: `rule:${insight.key}`,
    origin: "rule",
    createdAt: null,
    basedOnDemoData,
  };
}
