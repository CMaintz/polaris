import type { DataLifecycle } from "../../application/account/account-service";
import { exportedTables, childTableQueries, importedTables } from "./account-tables";
import type { Db } from "./database";

export class SqliteDataLifecycle implements DataLifecycle {
  constructor(private readonly db: Db) {}

  // What an export contains: everything the user owns, minus secrets (password hash, session
  // tokens, sealed AI keys) and raw upload bytes, which the user already has.
  async exportUser(userId: string): Promise<Record<string, unknown>> {
    const account = this.db.prepare("SELECT * FROM accounts WHERE user_id = ?").get(userId) as
      { id: string } | undefined;
    const rows = (sql: string, ...params: unknown[]) => this.db.prepare(sql).all(...params);
    const byAccount = Object.fromEntries(
      exportedTables().map((t) => [
        t,
        account ? rows(`SELECT * FROM ${t} WHERE account_id = ?`, account.id) : [],
      ]),
    );
    const children = Object.fromEntries(
      childTableQueries().map(({ name, sql }) => [name, account ? rows(sql, account.id) : []]),
    );
    return {
      user: this.db.prepare("SELECT id, email, created_at FROM users WHERE id = ?").get(userId),
      account: account ?? null,
      ...byAccount,
      ...children,
      ai_interactions: rows("SELECT * FROM ai_interactions WHERE user_id = ?", userId),
      ai_keys: rows(
        "SELECT provider, model, key_hint, created_at FROM ai_credentials WHERE user_id = ?",
        userId,
      ),
      imports: rows(
        "SELECT id, name, sha256, size, created_at FROM import_files WHERE user_id = ?",
        userId,
      ),
      jobs: rows(
        "SELECT id, type, status, error, created_at, completed_at FROM jobs WHERE user_id = ?",
        userId,
      ),
    };
  }

  async deleteImported(userId: string): Promise<void> {
    this.db.transaction(() => {
      const account = this.db.prepare("SELECT id FROM accounts WHERE user_id = ?").get(userId) as
        { id: string } | undefined;
      if (account) {
        for (const table of importedTables())
          this.db.prepare(`DELETE FROM ${table} WHERE account_id = ?`).run(account.id);
      }
      // The profile fields on the account row came from the import too.
      this.db
        .prepare(
          "UPDATE accounts SET display_name = NULL, headline = NULL, profile_url = NULL WHERE user_id = ?",
        )
        .run(userId);
      this.db.prepare("DELETE FROM import_files WHERE user_id = ?").run(userId);
      this.db.prepare("DELETE FROM ai_interactions WHERE user_id = ?").run(userId);
    })();
  }

  /** Foreign keys cascade from users to everything the user owns. */
  async deleteUser(userId: string): Promise<void> {
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM audit_log WHERE user_id = ?").run(userId);
      this.db.prepare("DELETE FROM users WHERE id = ?").run(userId);
    })();
  }
}
