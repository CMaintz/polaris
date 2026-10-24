import type { Account, ContentStore } from "../../application/content/ports";
import type { Dataset, ImportBundle } from "../../domain/content";
import { SqliteAccountStore } from "./account-store";
import { datasetDeletes } from "./account-tables";
import { BundleWriter } from "./bundle-writer";
import type { Db } from "./database";

export class SqliteContentStore implements ContentStore {
  private readonly accounts: SqliteAccountStore;
  private readonly writer: BundleWriter;

  constructor(private readonly db: Db) {
    this.accounts = new SqliteAccountStore(db);
    this.writer = new BundleWriter(db);
  }

  async ensureAccount(userId: string, now: string): Promise<Account> {
    return this.accounts.ensureActive(userId, now);
  }

  async findAccount(userId: string): Promise<Account | null> {
    return this.accounts.findActive(userId);
  }

  async ownedAccount(userId: string, accountId: string): Promise<Account | null> {
    return this.accounts.get(userId, accountId);
  }

  async applyBundle(account: Account, bundle: ImportBundle, jobId: string, now: string) {
    return this.writer.apply(account.id, bundle, jobId, now);
  }

  async hasDataset(accountId: string, dataset: Dataset): Promise<boolean> {
    const row = this.db
      .prepare(
        `SELECT EXISTS (SELECT 1 FROM posts WHERE account_id = ? AND dataset = ?)
             OR EXISTS (SELECT 1 FROM account_metric_days WHERE account_id = ? AND dataset = ?) AS found`,
      )
      .get(accountId, dataset, accountId, dataset) as { found: number };
    return row.found === 1;
  }

  async hasPost(accountId: string, postId: string): Promise<boolean> {
    return (
      this.db
        .prepare("SELECT 1 FROM posts WHERE account_id = ? AND id = ?")
        .get(accountId, postId) !== undefined
    );
  }

  async deleteDataset(accountId: string, dataset: Dataset): Promise<void> {
    this.db.transaction(() => {
      for (const { sql, value } of datasetDeletes(dataset)) {
        this.db.prepare(sql).run(accountId, value);
      }
      this.db
        .prepare(
          `DELETE FROM topics WHERE account_id = ?
           AND id NOT IN (SELECT topic_id FROM post_topics)`,
        )
        .run(accountId);
    })();
  }
}
