import { randomUUID } from "node:crypto";
import type { AccountDirectory, NewAccount } from "../../application/accounts/ports";
import type { Account } from "../../application/content/ports";
import { FIRST_ACCOUNT, type Platform, activeAccount } from "../../domain/accounts";
import type { Db } from "./database";

interface AccountRow {
  id: string;
  user_id: string;
  platform: Platform;
  label: string;
  display_name: string | null;
  headline: string | null;
  profile_url: string | null;
}

const toAccount = (row: AccountRow): Account => ({
  id: row.id,
  userId: row.user_id,
  platform: row.platform,
  label: row.label,
  displayName: row.display_name,
  headline: row.headline,
  profileUrl: row.profile_url,
});

export class SqliteAccountStore implements AccountDirectory {
  constructor(private readonly db: Db) {}

  async list(userId: string): Promise<Account[]> {
    return this.listNow(userId);
  }

  async activeId(userId: string): Promise<string | null> {
    return this.activeIdNow(userId);
  }

  async get(userId: string, accountId: string): Promise<Account | null> {
    const row = this.db
      .prepare("SELECT * FROM accounts WHERE id = ? AND user_id = ?")
      .get(accountId, userId) as AccountRow | undefined;
    return row ? toAccount(row) : null;
  }

  async create(userId: string, account: NewAccount, now: string): Promise<Account> {
    return this.createNow(userId, account, now);
  }

  async rename(userId: string, accountId: string, label: string, now: string): Promise<boolean> {
    const result = this.db
      .prepare("UPDATE accounts SET label = ?, updated_at = ? WHERE id = ? AND user_id = ?")
      .run(label, now, accountId, userId);
    return result.changes > 0;
  }

  async activate(userId: string, accountId: string): Promise<boolean> {
    const result = this.db
      .prepare(
        `UPDATE users SET active_account_id = ? WHERE id = ?
         AND EXISTS (SELECT 1 FROM accounts WHERE id = ? AND user_id = ?)`,
      )
      .run(accountId, userId, accountId, userId);
    return result.changes > 0;
  }

  async remove(userId: string, accountId: string): Promise<boolean> {
    const result = this.db
      .prepare("DELETE FROM accounts WHERE id = ? AND user_id = ?")
      .run(accountId, userId);
    return result.changes > 0;
  }

  async findActive(userId: string): Promise<Account | null> {
    return activeAccount(this.listNow(userId), this.activeIdNow(userId));
  }

  /** In one transaction, so two concurrent first writes cannot each create an account. */
  async ensureActive(userId: string, now: string): Promise<Account> {
    return this.db.transaction(
      () =>
        activeAccount(this.listNow(userId), this.activeIdNow(userId)) ??
        this.createNow(userId, FIRST_ACCOUNT, now),
    )();
  }

  private listNow(userId: string): Account[] {
    const rows = this.db
      .prepare("SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at, rowid")
      .all(userId) as AccountRow[];
    return rows.map(toAccount);
  }

  private activeIdNow(userId: string): string | null {
    const row = this.db.prepare("SELECT active_account_id FROM users WHERE id = ?").get(userId) as
      { active_account_id: string | null } | undefined;
    return row?.active_account_id ?? null;
  }

  private createNow(userId: string, { platform, label }: NewAccount, now: string): Account {
    const row = this.db
      .prepare(
        `INSERT INTO accounts (id, user_id, platform, label, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
      )
      .get(randomUUID(), userId, platform, label, now, now) as AccountRow;
    return toAccount(row);
  }
}
