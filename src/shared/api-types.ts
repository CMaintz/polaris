// Response shapes shared by the API and the web client. Types only: nothing here runs.

export interface UserDto {
  id: string;
  email: string;
  createdAt: string;
}

type JobStatusDto = "queued" | "running" | "completed" | "failed" | "retrying";

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

type ContentTypeDto = "text" | "image" | "video" | "document" | "article" | "link" | "unknown";
type BandDto = "top" | "middle" | "bottom" | "unrated";

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

interface PeriodDto {
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

interface AccountDto {
  id: string;
  userId: string;
  displayName: string | null;
  headline: string | null;
  profileUrl: string | null;
}

/** GET /imports/status. */
export interface ImportStatusDto {
  account: AccountDto | null;
  hasLinkedInData: boolean;
  hasDemoData: boolean;
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

/** One file of a finished import job; `JobDto.result` is `{ files: ImportFileReportDto[] }`. */
export interface ImportFileReportDto {
  file: string;
  provider: string;
  postsCreated: number;
  postsUpdated: number;
  metricSnapshots: number;
  accountDays: number;
  audienceSegments: number;
  warnings: string[];
}

export interface CredentialDto {
  provider: "anthropic" | "openai";
  model: string;
  keyHint: string;
  active: boolean;
}

export interface RecommendationDto {
  id: string;
  recommendation: string;
  rationale: string;
  evidence: EvidenceDto[];
  status: "open" | "accepted" | "dismissed" | "done";
  basedOnDemo: boolean;
  createdAt: string;
}

/** `JobDto.result` of a finished question job. */
export interface AnswerDto {
  answer: string;
  caveats: string[];
  evidence: EvidenceDto[];
  basedOnDemoData: boolean;
}

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
