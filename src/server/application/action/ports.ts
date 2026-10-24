import type { PublicationStatus, VersionOrigin } from "../../domain/drafts";
import type { EvidenceItem } from "../../domain/insights";
import type { ProposalKind, ProposalOrigin, ProposalStatus } from "../../domain/proposals";
import type { AiProvider } from "../ai/ports";
import type { EvidenceFacts } from "../analytics/evidence-facts";
import type { Experiment, Goal, NewRecord, PlanItem, RecordStore } from "../planning/ports";

export interface Draft {
  id: string;
  planItemId: string | null;
  title: string;
  version: number;
  text: string;
  approvedVersion: number | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DraftVersion {
  version: number;
  text: string;
  origin: VersionOrigin;
  notes: string;
  interactionId: string | null;
  basedOnDemo: boolean;
  createdAt: string;
}

export interface NewVersion {
  text: string;
  origin: VersionOrigin;
  notes?: string;
  interactionId?: string | null;
  basedOnDemo?: boolean;
  jobId?: string | null;
}

export interface DraftStore {
  list(accountId: string): Promise<Draft[]>;
  get(accountId: string, id: string): Promise<Draft | null>;
  versions(accountId: string, id: string): Promise<DraftVersion[]>;
  findByJob(accountId: string, jobId: string): Promise<Draft | null>;
  create(
    accountId: string,
    values: { title: string; planItemId: string | null },
    first: NewVersion,
    now: string,
  ): Promise<Draft>;
  update(
    accountId: string,
    id: string,
    patch: { title?: string; planItemId?: string | null },
    now: string,
  ): Promise<Draft | null>;
  /** Appends a version and clears any approval, since approval covers one version only. */
  addVersion(
    accountId: string,
    id: string,
    version: NewVersion,
    now: string,
  ): Promise<Draft | null>;
  /** Approves `version` only if it is still the current one; false otherwise. */
  approve(accountId: string, id: string, version: number, now: string): Promise<boolean>;
  delete(accountId: string, id: string): Promise<boolean>;
}

export interface Publication {
  id: string;
  draftId: string;
  draftVersion: number;
  text: string;
  provider: string;
  scheduledFor: string;
  status: PublicationStatus;
  externalId: string | null;
  url: string | null;
  error: string | null;
  publishedAt: string | null;
  createdAt: string;
}

export interface PublicationOutcome {
  externalId?: string | null;
  url?: string | null;
  error?: string | null;
  publishedAt?: string | null;
}

export interface PublicationStore {
  /** Throws ConflictError when the draft already has an open publication. */
  create(
    accountId: string,
    values: Pick<Publication, "draftId" | "draftVersion" | "text" | "provider" | "scheduledFor">,
    now: string,
  ): Promise<Publication>;
  get(accountId: string, id: string): Promise<Publication | null>;
  forDraft(accountId: string, draftId: string): Promise<Publication[]>;
  /** Compare-and-set: false when the publication was not in one of `from`. */
  transition(
    accountId: string,
    id: string,
    from: PublicationStatus[],
    to: PublicationStatus,
    outcome: PublicationOutcome,
    now: string,
  ): Promise<boolean>;
  dueUnclaimed(
    now: string,
    limit: number,
  ): Promise<{ id: string; accountId: string; userId: string }[]>;
  claim(id: string, now: string): Promise<boolean>;
  release(id: string): Promise<void>;
}

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

export interface PlanningWriter {
  create(userId: string, kind: "plan", values: NewRecord<PlanItem>): Promise<{ id: string }>;
  create(
    userId: string,
    kind: "experiments",
    values: NewRecord<Experiment>,
  ): Promise<{ id: string }>;
  create(userId: string, kind: "goals", values: NewRecord<Goal>): Promise<{ id: string }>;
}

export type PlanItems = Pick<RecordStore<PlanItem>, "get" | "list" | "update">;

export interface ModelSource {
  activeProvider(userId: string): Promise<AiProvider | null>;
}

export type AccountFactsSource = Pick<EvidenceFacts, "account">;

export type { InteractionRecorder } from "../ai/recorded-call";

export type ConnectionState = "connected" | "not_connected" | "expired" | "not_configured";

export interface ConnectionStatus {
  state: ConnectionState;
  displayName: string | null;
  expiresAt: string | null;
}

export interface PublishResult {
  externalId: string | null;
  url: string | null;
}

/**
 * Where an approved draft goes. An "api" provider posts it; a "handoff" provider only
 * prepares it (a share link) and the user posts it and confirms.
 */
export interface PublishingProvider {
  readonly id: string;
  readonly label: string;
  readonly mode: "api" | "handoff";
  connectionStatus(accountId: string): Promise<ConnectionStatus>;
  /** Throws PublishError; `outcome` says whether the post may exist anyway. */
  publish(accountId: string, text: string): Promise<PublishResult>;
}

export interface ConnectableProvider extends PublishingProvider {
  authorizationUrl(state: string): string;
  completeAuthorization(accountId: string, code: string): Promise<void>;
  disconnect(accountId: string): Promise<void>;
}

export class PublishError extends Error {
  constructor(
    message: string,
    /** "unknown" when the request may have reached LinkedIn (timeout, 5xx). */
    readonly outcome: "not_published" | "unknown",
  ) {
    super(message);
    this.name = "PublishError";
  }
}

export interface OAuthState {
  userId: string;
  accountId: string;
  provider: string;
  expiresAt: string;
}

export interface OAuthStateStore {
  save(stateHash: string, state: OAuthState): Promise<void>;
  /** Returns and deletes the state, so each one works once. */
  take(stateHash: string): Promise<OAuthState | null>;
}
