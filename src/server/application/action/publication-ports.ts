import type { PublicationStatus } from "../../domain/drafts";

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
