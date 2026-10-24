import type { PeriodDto } from "./core-types";

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
