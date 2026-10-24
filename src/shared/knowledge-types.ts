import type { JobDto } from "./api-types";

/** A run of snippet text; `hit` marks a matched term. Plain text, never markup. */
export interface SnippetSegment {
  text: string;
  hit: boolean;
}

export type SearchMode = "lexical" | "semantic";
export type MatchKind = "keywords" | "meaning";

export interface SearchHitDto {
  postId: string;
  publishedAt: string | null;
  timeKnown: boolean;
  contentType: string;
  topics: string[];
  themes: string[];
  snippet: SnippetSegment[];
  matchedBy: MatchKind[];
  /** Cosine similarity to the query, 0 to 1; null when the post matched on keywords only. */
  similarity: number | null;
}

export interface SearchResponseDto {
  requested: SearchMode;
  /** "semantic" here means hybrid: meaning and keyword ranks fused. */
  used: SearchMode;
  notice: string | null;
  results: SearchHitDto[];
}

export interface IndexStatusDto {
  postsWithText: number;
  keywordIndexed: number;
  semantic: {
    available: boolean;
    reason: string | null;
    model: string | null;
    embedded: number;
  };
  lastJob: JobDto | null;
}

export interface ThemePerformanceDto {
  theme: string;
  description: string;
  posts: number;
  withMetrics: number;
  medianImpressions: number | null;
  medianEngagements: number | null;
  medianEngagementRate: number | null;
}

export interface ThemeWindowDto {
  from: string;
  to: string;
  coveredDays: number;
  /** Classified, fully listed posts published in the window: the share denominator. */
  posts: number;
}

export type EmergingStatus = "emerging" | "fading" | "steady" | "insufficient";

export interface EmergingThemeDto {
  theme: string;
  /** Fraction of the window's posts in this theme; null when the window has too few posts. */
  latestShare: number | null;
  previousShare: number | null;
  /** Latest share minus previous share (0.1 = 10 percentage points). */
  change: number | null;
  status: EmergingStatus;
}

export interface ThemeRunDto {
  createdAt: string;
  provider: string;
  model: string;
  promptVersion: string;
  postsClassified: number;
  postsAvailable: number;
  basedOnDemoData: boolean;
}

export interface ThemesDto {
  run: ThemeRunDto | null;
  themes: ThemePerformanceDto[];
  /** Null when no fully listed posts give a measurable range. */
  windows: { latest: ThemeWindowDto; previous: ThemeWindowDto } | null;
  emerging: EmergingThemeDto[];
  lastJob: JobDto | null;
}
