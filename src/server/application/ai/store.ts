import type { Confidence, EvidenceItem } from "../../domain/insights";
import type { AiProviderId } from "./ports";

export interface StoredCredential {
  provider: AiProviderId;
  model: string;
  sealedKey: string;
  keyHint: string;
  active: boolean;
}

export interface InteractionRecord {
  userId: string;
  jobId: string | null;
  provider: AiProviderId;
  model: string;
  promptName: string;
  promptVersion: string;
  status: "succeeded" | "failed";
  inputSummary: Record<string, unknown>;
  output: unknown;
  error: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: string;
}

export interface AiInsight {
  id: string;
  scope: "account" | "post";
  postId: string | null;
  title: string;
  observation: string;
  interpretation: string;
  action: string;
  signal: string;
  confidence: Confidence;
  evidence: EvidenceItem[];
  basedOnDemo: boolean;
  createdAt: string;
  interactionId: string;
}

export interface InsightFilter {
  scope?: "account" | "post";
  postId?: string;
}

export type RecommendationStatus = "open" | "accepted" | "dismissed" | "done";

export interface Recommendation {
  id: string;
  recommendation: string;
  rationale: string;
  evidence: EvidenceItem[];
  status: RecommendationStatus;
  basedOnDemo: boolean;
  createdAt: string;
  interactionId: string;
}

export interface CredentialStore {
  /** Saves a key and makes it the active provider. */
  saveCredential(
    userId: string,
    credential: Omit<StoredCredential, "active">,
    now: string,
  ): Promise<void>;
  credentials(userId: string): Promise<StoredCredential[]>;
  deleteCredential(userId: string, provider: AiProviderId): Promise<void>;
}

export interface InteractionLog {
  recordInteraction(record: InteractionRecord): Promise<string>;
  interactions(userId: string, limit: number): Promise<(InteractionRecord & { id: string })[]>;
}

/** AI output kept for an account. Every method is scoped to that account. */
export interface InsightStore {
  saveInsights(accountId: string, insights: Omit<AiInsight, "id">[]): Promise<void>;
  saveRecommendations(
    accountId: string,
    recommendations: Omit<Recommendation, "id">[],
  ): Promise<void>;
  insights(accountId: string, filter: InsightFilter): Promise<AiInsight[]>;
  recommendations(accountId: string): Promise<Recommendation[]>;
  /** False when no recommendation with that id belongs to the account. */
  setRecommendationStatus(
    accountId: string,
    id: string,
    status: RecommendationStatus,
    now: string,
  ): Promise<boolean>;
}
