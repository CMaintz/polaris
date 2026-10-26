import { randomUUID } from "node:crypto";
import type { RecordStore } from "../../application/planning/ports";
import type { Db } from "./database";

const toSnake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const toCamel = (key: string) => key.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());

/**
 * Account-scoped CRUD over one table of user-authored records. Column names come from the
 * caller's fixed list, never from request input, so building SQL from them is safe.
 */
export class SqliteRecordTable<T extends { id: string }> implements RecordStore<T> {
  constructor(
    private readonly db: Db,
    private readonly table: string,
    private readonly fields: readonly (keyof T & string)[],
    private readonly orderBy: string,
  ) {}

  private read(row: Record<string, unknown>): T {
    const entries = Object.entries(row).filter(([k]) => k !== "account_id");
    return Object.fromEntries(entries.map(([k, v]) => [toCamel(k), v])) as T;
  }

  async list(accountId: string): Promise<T[]> {
    const rows = this.db
      .prepare(`SELECT * FROM ${this.table} WHERE account_id = ? ORDER BY ${this.orderBy}`)
      .all(accountId) as Record<string, unknown>[];
    return rows.map((r) => this.read(r));
  }

  async get(accountId: string, id: string): Promise<T | null> {
    const row = this.db
      .prepare(`SELECT * FROM ${this.table} WHERE account_id = ? AND id = ?`)
      .get(accountId, id) as Record<string, unknown> | undefined;
    return row ? this.read(row) : null;
  }

  async create(
    accountId: string,
    values: Omit<T, "id" | "createdAt" | "updatedAt">,
    now: string,
  ): Promise<T> {
    const id = randomUUID();
    const fields = this.fields.filter((f) => f in values);
    const columns = ["id", "account_id", ...fields.map(toSnake), "created_at", "updated_at"];
    const params = [
      id,
      accountId,
      ...fields.map((f) => (values as Record<string, unknown>)[f] ?? null),
      now,
      now,
    ];
    this.db
      .prepare(
        `INSERT INTO ${this.table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
      )
      .run(...params);
    return (await this.get(accountId, id)) as T;
  }

  async update(accountId: string, id: string, patch: Partial<T>, now: string): Promise<T | null> {
    const fields = this.fields.filter((f) => f in patch);
    if (fields.length > 0) {
      const sets = [...fields.map((f) => `${toSnake(f)} = ?`), "updated_at = ?"].join(", ");
      const values = fields.map((f) => (patch as Record<string, unknown>)[f] ?? null);
      this.db
        .prepare(`UPDATE ${this.table} SET ${sets} WHERE account_id = ? AND id = ?`)
        .run(...values, now, accountId, id);
    }
    return this.get(accountId, id);
  }

  async delete(accountId: string, id: string): Promise<boolean> {
    return (
      this.db
        .prepare(`DELETE FROM ${this.table} WHERE account_id = ? AND id = ?`)
        .run(accountId, id).changes === 1
    );
  }
}
