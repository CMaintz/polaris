// Request and response shapes for /intelligence. All text that came from a model, a web page
// or a feed is plain text: clients render it as text, never as HTML.

export interface PeerDto {
  id: string;
  name: string;
  profileUrl: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface PeerInput {
  name: string;
  profileUrl: string | null;
  notes: string;
}

export interface ResearchSourceDto {
  id: string;
  title: string;
  /** Only ever an http(s) URL; null when the source gave something else. */
  url: string | null;
}

export interface ResearchFindingDto {
  finding: string;
  sources: ResearchSourceDto[];
}

interface ResearchRelationDto {
  text: string;
  topics: string[];
  posts: { id: string; label: string }[];
}

export interface ResearchReportBody {
  summary: string;
  findings: ResearchFindingDto[];
  relation: ResearchRelationDto;
  caveats: string[];
  sources: ResearchSourceDto[];
  basedOnDemoData: boolean;
  interactionIds: string[];
}

type ReportStatus = "running" | "completed" | "failed";

export interface ResearchReportDto {
  id: string;
  question: string;
  peerId: string | null;
  peerName: string | null;
  status: ReportStatus;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  report: ResearchReportBody | null;
}

export interface ResearchInput {
  question: string;
  peerId: string | null;
}

export interface FeedDto {
  id: string;
  url: string;
  title: string | null;
  lastFetchedAt: string | null;
  lastStatus: "ok" | "error" | null;
  lastError: string | null;
  itemCount: number;
  createdAt: string;
}

export interface TrendMatchDto {
  itemId: string;
  feedTitle: string | null;
  title: string;
  link: string | null;
  day: string;
  topics: string[];
}

interface TopicTrendDto {
  topic: string;
  last7: number;
  last30: number;
  last90: number;
}

export interface TrendsDto {
  /** First feed fetch; windows reaching further back than this undercount. Null: never fetched. */
  trackedSince: string | null;
  topics: TopicTrendDto[];
  recent: TrendMatchDto[];
}

export type DigestAiDto =
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string }
  | {
      status: "succeeded";
      summary: string;
      relations: { itemId: string; relation: string }[];
      interactionId: string;
    };

export interface DigestDto {
  id: string;
  from: string;
  to: string;
  matches: TrendMatchDto[];
  ai: DigestAiDto;
  createdAt: string;
}

export const SCHEDULE_KINDS = [
  "feed_refresh",
  "trend_digest",
  "account_review",
  "research_rerun",
  "metric_refresh",
] as const;
export type ScheduleKind = (typeof SCHEDULE_KINDS)[number];

export const CADENCES = ["daily", "weekly"] as const;
export type Cadence = (typeof CADENCES)[number];

export interface ScheduleParams {
  /** Browser timezone offset in minutes, for the account review's posting-time buckets. */
  tz?: number;
  withAi?: boolean;
  question?: string;
  peerId?: string | null;
}

export interface ScheduleDto {
  id: string;
  kind: ScheduleKind;
  cadence: Cadence;
  params: ScheduleParams;
  enabled: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
  lastJobId: string | null;
  createdAt: string;
}

export interface ScheduleInput {
  kind: ScheduleKind;
  cadence: Cadence;
  params: ScheduleParams;
}
