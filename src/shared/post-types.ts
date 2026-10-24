import type { PeriodDto } from "./core-types";

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

export interface SegmentDto {
  key: string;
  posts: number;
  withMetrics: number;
  medianImpressions: number | null;
  medianEngagements: number | null;
  medianEngagementRate: number | null;
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
