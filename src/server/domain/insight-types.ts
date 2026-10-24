import type { PostRecord } from "./posts";
import type { PeriodComparison } from "./timeseries";

export type Confidence = "low" | "medium" | "high";

/** A fact an insight rests on. Every value here comes from stored data, never from a model. */
export interface EvidenceItem {
  id: string;
  label: string;
  value: number | null;
  unit: "count" | "ratio";
  postId?: string;
  period?: { from: string; to: string };
  source: string;
}

/** Structured as docs/03 section 5 asks: observation, evidence, interpretation, and so on. */
export interface Insight {
  key: string;
  title: string;
  observation: string;
  interpretation: string;
  action: string;
  signal: string;
  confidence: Confidence;
  evidence: EvidenceItem[];
}

export interface InsightInputs {
  posts: PostRecord[];
  asOf: string;
  impressions: PeriodComparison | null;
  sources: { posts: string; account: string };
  tzOffsetMinutes: number;
}
