import type { EvidenceDto } from "./ai-types";

export interface LengthDto {
  length: number;
  limit: number;
  over: boolean;
}

export interface DraftDto {
  id: string;
  planItemId: string | null;
  title: string;
  version: number;
  text: string;
  approved: boolean;
  approvedVersion: number | null;
  approvedAt: string | null;
  length: LengthDto;
  createdAt: string;
  updatedAt: string;
}

export interface DraftVersionDto {
  version: number;
  text: string;
  origin: "user" | "ai" | "restore";
  notes: string;
  basedOnDemo: boolean;
  createdAt: string;
}

type PublicationStatusDto =
  "scheduled" | "publishing" | "awaiting_confirmation" | "published" | "failed" | "cancelled";

export interface PublicationDto {
  id: string;
  draftId: string;
  draftVersion: number;
  text: string;
  provider: string;
  scheduledFor: string;
  status: PublicationStatusDto;
  externalId: string | null;
  /** The post's link once published; while awaiting confirmation, the share link to post it. */
  url: string | null;
  error: string | null;
  publishedAt: string | null;
}

export interface DraftDetailDto {
  draft: DraftDto;
  versions: DraftVersionDto[];
  publications: PublicationDto[];
}

type ProposalStatusDto = "pending" | "approved" | "rejected" | "applied" | "failed";

export interface ProposalDto {
  id: string;
  kind: "plan_item" | "experiment" | "goal";
  payload: Record<string, unknown>;
  origin: "ai" | "user";
  rationale: string;
  evidence: EvidenceDto[];
  status: ProposalStatusDto;
  decidedAt: string | null;
  appliedRecordId: string | null;
  error: string | null;
  basedOnDemoData: boolean;
  createdAt: string;
}

export interface ConnectionDto {
  id: string;
  label: string;
  mode: "api" | "handoff";
  connectable: boolean;
  state: "connected" | "not_connected" | "expired" | "not_configured";
  displayName: string | null;
  expiresAt: string | null;
}
