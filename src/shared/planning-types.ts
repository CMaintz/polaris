import type { PeriodDto } from "./core-types";

export type GoalMetricDto =
  "followers" | "impressions" | "engagements" | "posts" | "engagement_rate";

export interface GoalDto {
  id: string;
  name: string;
  metric: GoalMetricDto;
  /** A ratio (0.03) for engagement_rate, a count otherwise. */
  target: number;
  startDate: string;
  endDate: string;
  status: "active" | "archived";
  notes: string;
  createdAt: string;
  updatedAt: string;
  progress: {
    current: number | null;
    baseline: number | null;
    progress: number | null;
    expected: number;
    status: "not_started" | "no_data" | "on_track" | "behind" | "achieved" | "missed";
    measuredUntil: string;
  };
}

export type PostMetricDto =
  "impressions" | "engagements" | "engagement_rate" | "reactions" | "comments" | "reposts";

export interface ExperimentDto {
  id: string;
  goalId: string | null;
  name: string;
  hypothesis: string;
  variable: string;
  metric: PostMetricDto;
  /** A ratio (0.03) for engagement_rate, a count otherwise; null means the period before. */
  baseline: number | null;
  startDate: string;
  endDate: string;
  status: "planned" | "running" | "completed" | "abandoned";
  result: string;
  conclusion: string;
  followUp: string;
  createdAt: string;
  updatedAt: string;
  evaluation: {
    baseline: number | null;
    observed: number | null;
    change: { absolute: number | null; percent: number | null };
    sampleSize: number;
    baselineSampleSize: number | null;
    baselinePeriod: PeriodDto | null;
    verdict: "insufficient_data" | "higher" | "lower" | "no_clear_change";
  };
}

export type PlanStatusDto = "idea" | "drafting" | "planned" | "published" | "dropped";

export interface PlanItemDto {
  id: string;
  title: string;
  concept: string;
  targetTopic: string;
  plannedDate: string | null;
  status: PlanStatusDto;
  draft: string;
  postId: string | null;
  createdAt: string;
  updatedAt: string;
}
