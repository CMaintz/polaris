import type { InsightDto } from "./ai-types";
import type { PeriodDto } from "./core-types";
import type { PostSummaryDto, SegmentDto } from "./post-types";

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

export type SeriesMetricDto =
  "impressions" | "engagements" | "followers" | "new_followers" | "posts";

export interface SeriesDto {
  metric: SeriesMetricDto;
  granularity: "day" | "week" | "month";
  from: string;
  to: string;
  source: string;
  points: SeriesPointDto[];
}
