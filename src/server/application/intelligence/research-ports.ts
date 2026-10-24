import type { AiProviderId } from "../ai/ports";
import type { RecordStore } from "../planning/ports";
import type { ResearchReportBody } from "../../../shared/intelligence-types";
import type { ActiveKey } from "./ports";

export interface WebSource {
  url: string;
  title: string;
}

export interface WebResearchRequest {
  system: string;
  prompt: string;
  maxTokens: number;
}

export interface WebResearchResult {
  /** The model's notes, written from what it found. Untrusted: it quotes web pages. */
  text: string;
  sources: WebSource[];
  model: string;
  usage: { inputTokens: number | null; outputTokens: number | null };
}

export interface WebResearchProvider {
  readonly id: AiProviderId;
  readonly model: string;
  research(request: WebResearchRequest): Promise<WebResearchResult>;
}

export type WebResearchFactory = (key: ActiveKey) => WebResearchProvider;

export interface Peer {
  id: string;
  name: string;
  profileUrl: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type PeerStore = RecordStore<Peer>;

export interface PendingReport {
  id: string;
  accountId: string;
  question: string;
  peerId: string | null;
  peerName: string | null;
  createdAt: string;
}

export interface StoredReport extends PendingReport {
  jobStatus: string | null;
  jobError: string | null;
  completedAt: string | null;
  body: ResearchReportBody | null;
}

export interface ReportStore {
  /** Inserts the report once; a second call with the same id changes nothing. */
  ensure(report: PendingReport): Promise<void>;
  complete(id: string, body: ResearchReportBody, now: string): Promise<void>;
  get(accountId: string, id: string): Promise<StoredReport | null>;
  list(accountId: string, limit: number): Promise<StoredReport[]>;
}
