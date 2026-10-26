// Response shapes shared by the API and the web client. Types only: nothing here runs.

export interface UserDto {
  id: string;
  email: string;
  createdAt: string;
}

export type JobStatusDto = "queued" | "running" | "completed" | "failed" | "retrying";

export interface JobDto {
  id: string;
  type: string;
  status: JobStatusDto;
  progress: number;
  error: string | null;
  result: unknown;
  retryCount: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  label: string | null;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}

export type ContentTypeDto =
  "text" | "image" | "video" | "document" | "article" | "link" | "unknown";
export type BandDto = "top" | "middle" | "bottom" | "unrated";

/** Null means the source did not report the value; it is never a stand-in for zero. */
export interface MetricsDto {
  impressions: number | null;
  reactions: number | null;
  comments: number | null;
  reposts: number | null;
  clicks: number | null;
  engagements: number | null;
  engagementRate: number | null;
}

export interface PeriodDto {
  from: string;
  to: string;
}

export interface PostSummaryDto {
  id: string;
  url: string | null;
  excerpt: string | null;
  publishedAt: string | null;
  timeKnown: boolean;
  contentType: ContentTypeDto;
  topics: string[];
  metrics: MetricsDto;
  band: BandDto;
  dataset: "linkedin" | "demo";
  metricsObservedOn: string | null;
  metricsPeriod: PeriodDto | null;
  metricsSource: string | null;
}

export interface KpiDto {
  key: string;
  label: string;
  unit: "count" | "ratio";
  value: number | null;
  previous: number | null;
  change: { absolute: number | null; percent: number | null };
  period: PeriodDto;
  previousPeriod: PeriodDto;
  coverage: { observedDays: number; totalDays: number };
  source: string;
}

export interface SeriesPointDto {
  period: string;
  value: number | null;
  rolling: number | null;
}

export interface SegmentDto {
  key: string;
  posts: number;
  withMetrics: number;
  medianImpressions: number | null;
  medianEngagements: number | null;
  medianEngagementRate: number | null;
}

export interface EvidenceDto {
  id: string;
  label: string;
  value: number | null;
  unit: "count" | "ratio";
  postId?: string;
  period?: PeriodDto;
  source: string;
}

export interface InsightDto {
  id: string;
  origin: "rule" | "ai";
  key: string;
  title: string;
  observation: string;
  interpretation: string;
  action: string;
  signal: string;
  confidence: "low" | "medium" | "high";
  evidence: EvidenceDto[];
  createdAt: string | null;
  basedOnDemoData: boolean;
}

export interface DataStatusDto {
  asOf: string | null;
  hasLinkedInData: boolean;
  hasDemoData: boolean;
  posts: number;
  postsWithMetrics: number;
}

export interface DashboardDto {
  status: DataStatusDto;
  periodDays: number;
  kpis: KpiDto[];
  impressionsTrend: SeriesPointDto[];
  followersTrend: SeriesPointDto[];
  recentPosts: PostSummaryDto[];
  topPosts: PostSummaryDto[];
  bottomPosts: PostSummaryDto[];
  themes: SegmentDto[];
  insights: InsightDto[];
}

export interface PostPageDto {
  total: number;
  items: PostSummaryDto[];
  topics: string[];
}

export interface PostDetailDto {
  post: PostSummaryDto & { text: string | null; providers: string[]; externalId: string };
  observations: {
    observedOn: string;
    source: string;
    metrics: MetricsDto;
    period: PeriodDto | null;
  }[];
  baseline: SegmentDto;
  comparable: PostSummaryDto[];
}

export interface BreakdownsDto {
  contentTypes: SegmentDto[];
  topics: SegmentDto[];
  weekdays: SegmentDto[];
  hours: SegmentDto[];
  postsWithTime: number;
}

export interface AudienceDto {
  observedOn: string | null;
  source: string | null;
  dimensions: { dimension: string; segments: { value: string; share: number | null }[] }[];
  followers: SeriesPointDto[];
  newFollowers: SeriesPointDto[];
}
