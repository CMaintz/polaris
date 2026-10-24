import type { Platform } from "../../domain/accounts";
import type { Account } from "../content/ports";

export interface NewAccount {
  platform: Platform;
  label: string;
}

/**
 * The user's accounts. Every method is scoped to the user, so an id belonging to someone else
 * behaves exactly like an unknown one: null or false, never a row.
 */
export interface AccountDirectory {
  /** Oldest first. */
  list(userId: string): Promise<Account[]>;
  activeId(userId: string): Promise<string | null>;
  get(userId: string, accountId: string): Promise<Account | null>;
  create(userId: string, account: NewAccount, now: string): Promise<Account>;
  rename(userId: string, accountId: string, label: string, now: string): Promise<boolean>;
  activate(userId: string, accountId: string): Promise<boolean>;
  remove(userId: string, accountId: string): Promise<boolean>;
}
