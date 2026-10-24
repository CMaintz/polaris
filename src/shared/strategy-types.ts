import type { PeriodDto } from "./core-types";
import type { PostSummaryDto, SegmentDto } from "./post-types";

export type CampaignStatusDto = "planned" | "active" | "done" | "cancelled";

export interface CampaignLinksDto {
  postIds: string[];
  planItemIds: string[];
  goalIds: string[];
}

export interface CampaignInput {
  name: string;
  objective: string;
  startDate: string;
  endDate: string;
  status: CampaignStatusDto;
  notes: string;
}

export interface CampaignDto extends CampaignInput {
  id: string;
  links: CampaignLinksDto;
  createdAt: string;
  updatedAt: string;
}

/** A value with how many days of its window had data; null value means not available. */
export interface MeasuredDto {
  value: number | null;
  observedDays: number;
  totalDays: number;
}

export interface PeriodPerformanceDto {
  window: PeriodDto;
  posts: SegmentDto;
  postsPublished: MeasuredDto;
  followerChange: MeasuredDto;
}

export interface CampaignPerformanceDto {
  campaignId: string;
  /** Null until the campaign has started, or while there is no imported data yet. */
  campaign: PeriodPerformanceDto | null;
  baseline: PeriodPerformanceDto | null;
  posts: PostSummaryDto[];
}

interface PillarInput {
  name: string;
  description: string;
  topics: string[];
  /** 0 to 1. */
  targetShare: number;
}

export interface PillarDto extends PillarInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export type PillarStatusDto = "under" | "over" | "on_target" | "too_few_posts" | "no_data";

export interface PillarActualDto {
  pillarId: string;
  name: string;
  targetShare: number;
  posts: number;
  actualShare: number | null;
  gap: number | null;
  status: PillarStatusDto;
  performance: SegmentDto;
}

export interface PillarReportDto {
  window: PeriodDto;
  measured: PeriodDto | null;
  measuredDays: number;
  totalDays: number;
  posts: number;
  unassigned: { posts: number; share: number | null };
  pillars: PillarActualDto[];
}

export interface StageDto {
  value: number | null;
  observedDays: number;
}

export interface RatioDto {
  value: number | null;
  pairedDays: number;
}

export interface FunnelStepDto {
  period: string;
  from: string;
  to: string;
  totalDays: number;
  impressions: StageDto;
  engagements: StageDto;
  newFollowers: StageDto;
  profileViews: { value: null; reason: string };
  engagementRate: RatioDto;
  /** New followers per 1,000 impressions. */
  followerConversion: RatioDto;
}

export interface FunnelDto {
  granularity: "week" | "month";
  from: string;
  to: string;
  source: string;
  steps: FunnelStepDto[];
}

export interface CampaignFunnelDto {
  campaignId: string;
  source: string;
  /** Null until the campaign has started. */
  step: FunnelStepDto | null;
}
