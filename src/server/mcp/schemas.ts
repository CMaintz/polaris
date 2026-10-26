import { z } from "zod";
import type { AudienceDto, DashboardDto, SeriesDto } from "../../shared/analytics-types";
import type { InsightDto } from "../../shared/ai-types";
import type { PostDetailDto, PostPageDto, SegmentDto } from "../../shared/post-types";
import {
  BANDS,
  BREAKDOWN_DIMENSIONS,
  CONTENT_TYPES,
  GRANULARITIES,
  SERIES_METRICS,
} from "../application/analytics/query-options";

// Output schemas double as an allowlist: results are parsed through them before they leave
// the process, so a field added to a DTO later reaches the client's model only once it is
// named here. `satisfies` keeps each schema in step with the DTO it carries.

const count = z.number().nullable();
const text = z.string().nullable();
const period = z.object({ from: z.string(), to: z.string() });

const metrics = z.object({
  impressions: count,
  reactions: count,
  comments: count,
  reposts: count,
  clicks: count,
  engagements: count,
  engagementRate: count,
});

const postSummary = z.object({
  id: z.string(),
  url: text,
  excerpt: text,
  publishedAt: text,
  timeKnown: z.boolean(),
  contentType: z.enum(CONTENT_TYPES),
  topics: z.array(z.string()),
  metrics,
  band: z.enum(BANDS),
  dataset: z.enum(["linkedin", "demo"]),
  metricsObservedOn: text,
  metricsPeriod: period.nullable(),
  metricsSource: text,
});

const segment = z.object({
  key: z.string(),
  posts: z.number(),
  withMetrics: z.number(),
  medianImpressions: count,
  medianEngagements: count,
  medianEngagementRate: count,
}) satisfies z.ZodType<SegmentDto>;

const seriesPoint = z.object({ period: z.string(), value: count, rolling: count });
const unit = z.enum(["count", "ratio"]);

const evidence = z.object({
  id: z.string(),
  label: z.string(),
  value: count,
  unit,
  postId: z.string().optional(),
  period: period.optional(),
  source: z.string(),
});

const insight = z.object({
  id: z.string(),
  origin: z.enum(["rule", "ai"]),
  key: z.string(),
  title: z.string(),
  observation: z.string(),
  interpretation: z.string(),
  action: z.string(),
  signal: z.string(),
  confidence: z.enum(["low", "medium", "high"]),
  evidence: z.array(evidence),
  createdAt: text,
  basedOnDemoData: z.boolean(),
}) satisfies z.ZodType<InsightDto>;

const kpi = z.object({
  key: z.string(),
  label: z.string(),
  unit,
  value: count,
  previous: count,
  change: z.object({ absolute: count, percent: count }),
  period,
  previousPeriod: period,
  coverage: z.object({ observedDays: z.number(), totalDays: z.number() }),
  source: z.string(),
});

export const dashboardOutput = z.object({
  status: z.object({
    asOf: text,
    hasLinkedInData: z.boolean(),
    hasDemoData: z.boolean(),
    posts: z.number(),
    postsWithMetrics: z.number(),
  }),
  periodDays: z.number(),
  kpis: z.array(kpi),
  impressionsTrend: z.array(seriesPoint),
  followersTrend: z.array(seriesPoint),
  recentPosts: z.array(postSummary),
  topPosts: z.array(postSummary),
  bottomPosts: z.array(postSummary),
  themes: z.array(segment),
  insights: z.array(insight),
}) satisfies z.ZodType<DashboardDto>;

export const postPageOutput = z.object({
  total: z.number(),
  items: z.array(postSummary),
  topics: z.array(z.string()),
}) satisfies z.ZodType<PostPageDto>;

export const postDetailOutput = z.object({
  post: postSummary.extend({
    text,
    providers: z.array(z.string()),
    externalId: z.string(),
  }),
  observations: z.array(
    z.object({ observedOn: z.string(), source: z.string(), metrics, period: period.nullable() }),
  ),
  baseline: segment,
  comparable: z.array(postSummary),
}) satisfies z.ZodType<PostDetailDto>;

export const seriesOutput = z.object({
  metric: z.enum(SERIES_METRICS),
  granularity: z.enum(GRANULARITIES),
  from: z.string(),
  to: z.string(),
  source: z.string(),
  points: z.array(seriesPoint),
}) satisfies z.ZodType<SeriesDto>;

export const breakdownOutput = z.object({
  dimension: z.enum(BREAKDOWN_DIMENSIONS),
  segments: z.array(segment),
  postsWithTime: z.number(),
});

export const insightsOutput = z.object({ insights: z.array(insight) });

export const audienceOutput = z.object({
  observedOn: text,
  source: text,
  dimensions: z.array(
    z.object({
      dimension: z.string(),
      segments: z.array(z.object({ value: z.string(), share: count })),
    }),
  ),
  followers: z.array(seriesPoint),
  newFollowers: z.array(seriesPoint),
}) satisfies z.ZodType<AudienceDto>;
