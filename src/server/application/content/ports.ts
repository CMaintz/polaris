import type { Dataset, ImportBundle } from "../../domain/content";

export interface Account {
  id: string;
  userId: string;
  displayName: string | null;
  headline: string | null;
  profileUrl: string | null;
}

export interface ApplyStats {
  postsCreated: number;
  postsUpdated: number;
  metricSnapshots: number;
  accountDays: number;
  audienceSegments: number;
}

export interface ContentStore {
  /** The user's single LinkedIn account (ADR 0015), created on first use. */
  ensureAccount(userId: string, now: string): Promise<Account>;
  findAccount(userId: string): Promise<Account | null>;
  /**
   * Writes a bundle atomically and idempotently: applying the same bundle twice leaves
   * the same rows, and a value missing from the bundle never erases a stored one.
   */
  applyBundle(
    account: Account,
    bundle: ImportBundle,
    jobId: string,
    now: string,
  ): Promise<ApplyStats>;
  hasDataset(accountId: string, dataset: Dataset): Promise<boolean>;
  deleteDataset(accountId: string, dataset: Dataset): Promise<void>;
}
