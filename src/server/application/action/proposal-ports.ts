import type { EvidenceItem } from "../../domain/insight-types";
import type { ProposalKind, ProposalOrigin, ProposalStatus } from "../../domain/proposals";

export interface Proposal {
  id: string;
  kind: ProposalKind;
  payload: unknown;
  origin: ProposalOrigin;
  rationale: string;
  evidence: EvidenceItem[];
  status: ProposalStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  appliedRecordId: string | null;
  error: string | null;
  interactionId: string | null;
  basedOnDemo: boolean;
  createdAt: string;
}

export type NewProposal = Pick<
  Proposal,
  "kind" | "payload" | "origin" | "rationale" | "evidence" | "interactionId" | "basedOnDemo"
>;

export interface ProposalStore {
  createMany(
    accountId: string,
    proposals: NewProposal[],
    jobId: string | null,
    now: string,
  ): Promise<void>;
  countForJob(jobId: string): Promise<number>;
  list(accountId: string, status?: ProposalStatus): Promise<Proposal[]>;
  get(accountId: string, id: string): Promise<Proposal | null>;
  /** False when the proposal was already decided. */
  decide(
    accountId: string,
    id: string,
    status: "approved" | "rejected",
    userId: string,
    now: string,
  ): Promise<boolean>;
  finish(
    accountId: string,
    id: string,
    outcome: { status: "applied"; recordId: string } | { status: "failed"; error: string },
  ): Promise<void>;
}

/** `apply` receives a payload already validated against its kind's schema. */
export interface ProposalApplier<P = unknown> {
  readonly kind: ProposalKind;
  apply(userId: string, payload: P): Promise<{ id: string }>;
}
