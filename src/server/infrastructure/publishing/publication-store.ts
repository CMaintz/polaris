import { randomUUID } from "node:crypto";
import type {
  Publication,
  PublicationOutcome,
  PublicationStore,
} from "../../application/action/ports";
import { ConflictError } from "../../application/errors";
import type { PublicationStatus } from "../../domain/drafts";
import type { Db } from "../db/database";

type Row = Record<string, unknown>;

const toPublication = (r: Row): Publication => ({
  id: r["id"] as string,
  draftId: r["draft_id"] as string,
  draftVersion: r["draft_version"] as number,
  text: r["text"] as string,
  provider: r["provider"] as string,
  scheduledFor: r["scheduled_for"] as string,
  status: r["status"] as PublicationStatus,
  externalId: r["external_id"] as string | null,
  url: r["url"] as string | null,
  error: r["error"] as string | null,
  publishedAt: r["published_at"] as string | null,
  createdAt: r["created_at"] as string,
});

export class SqlitePublicationStore implements PublicationStore {
  constructor(private readonly db: Db) {}

  async create(
    accountId: string,
    v: Pick<Publication, "draftId" | "draftVersion" | "text" | "provider" | "scheduledFor">,
    now: string,
  ) {
    const id = randomUUID();
    try {
      this.db
        .prepare(
          `INSERT INTO publications (id, account_id, draft_id, draft_version, text, provider,
             scheduled_for, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)`,
        )
        .run(
          id,
          accountId,
          v.draftId,
          v.draftVersion,
          v.text,
          v.provider,
          v.scheduledFor,
          now,
          now,
        );
    } catch (error) {
      if (String(error).includes("UNIQUE")) {
        throw new ConflictError("This draft is already scheduled; cancel that first");
      }
      throw error;
    }
    return (await this.get(accountId, id)) as Publication;
  }

  async get(accountId: string, id: string) {
    const row = this.db
      .prepare("SELECT * FROM publications WHERE account_id = ? AND id = ?")
      .get(accountId, id) as Row | undefined;
    return row ? toPublication(row) : null;
  }

  async forDraft(accountId: string, draftId: string) {
    const rows = this.db
      .prepare(
        "SELECT * FROM publications WHERE account_id = ? AND draft_id = ? ORDER BY created_at DESC, rowid DESC",
      )
      .all(accountId, draftId) as Row[];
    return rows.map(toPublication);
  }

  async transition(
    accountId: string,
    id: string,
    from: PublicationStatus[],
    to: PublicationStatus,
    o: PublicationOutcome,
    now: string,
  ) {
    const placeholders = from.map(() => "?").join(", ");
    return (
      this.db
        .prepare(
          `UPDATE publications SET status = ?,
             external_id = CASE WHEN ? THEN ? ELSE external_id END,
             url = CASE WHEN ? THEN ? ELSE url END,
             error = ?, published_at = COALESCE(?, published_at), updated_at = ?
           WHERE account_id = ? AND id = ? AND status IN (${placeholders})`,
        )
        .run(
          to,
          o.externalId !== undefined ? 1 : 0,
          o.externalId ?? null,
          o.url !== undefined ? 1 : 0,
          o.url ?? null,
          o.error ?? null,
          o.publishedAt ?? null,
          now,
          accountId,
          id,
          ...from,
        ).changes === 1
    );
  }

  async dueUnclaimed(now: string, limit: number) {
    return this.db
      .prepare(
        `SELECT p.id, p.account_id AS accountId, a.user_id AS userId FROM publications p
         JOIN accounts a ON a.id = p.account_id
         WHERE p.status = 'scheduled' AND p.scheduled_for <= ? AND p.queued_at IS NULL
         ORDER BY p.scheduled_for LIMIT ?`,
      )
      .all(now, limit) as { id: string; accountId: string; userId: string }[];
  }

  async claim(id: string, now: string) {
    return (
      this.db
        .prepare("UPDATE publications SET queued_at = ? WHERE id = ? AND queued_at IS NULL")
        .run(now, id).changes === 1
    );
  }

  async release(id: string) {
    this.db.prepare("UPDATE publications SET queued_at = NULL WHERE id = ?").run(id);
  }
}
