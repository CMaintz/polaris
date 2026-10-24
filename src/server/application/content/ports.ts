import type { Platform } from "../../domain/accounts";
import type { Dataset, ImportBundle } from "../../domain/content";

export interface Account {
  id: string;
  userId: string;
  platform: Platform;
  label: string;
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
  /** The active account (ADR 0026); a LinkedIn account is created when the user has none. */
  ensureAccount(userId: string, now: string): Promise<Account>;
  /** The active account, or null before the user has any. */
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
  hasPost(accountId: string, postId: string): Promise<boolean>;
  deleteDataset(accountId: string, dataset: Dataset): Promise<void>;
}

/** The id of the active account, or null before the first import or record creates one. */
export type ResolveAccount = (userId: string) => Promise<string | null>;
