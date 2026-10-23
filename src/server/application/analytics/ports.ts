import type { PostMetrics } from "../../domain/metrics";
import type { PostRecord } from "../../domain/posts";

export interface AccountDay {
  day: string;
  followers: number | null;
  newFollowers: number | null;
  impressions: number | null;
  engagements: number | null;
  provider: string;
}

export interface MetricObservation {
  observedOn: string;
  provider: string;
  metrics: PostMetrics;
  period: { from: string; to: string } | null;
  importJobId: string | null;
}

export interface AudienceSnapshot {
  observedOn: string;
  provider: string;
  segments: { dimension: string; value: string; share: number | null }[];
}

/** Read models over imported content. Every method is scoped to one account. */
export interface ContentQueries {
  posts(accountId: string): Promise<PostRecord[]>;
  observations(accountId: string, postId: string): Promise<MetricObservation[]>;
  accountDays(accountId: string): Promise<AccountDay[]>;
  latestAudience(accountId: string): Promise<AudienceSnapshot | null>;
}
