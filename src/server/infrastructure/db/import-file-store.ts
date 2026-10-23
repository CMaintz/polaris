import { createHash, randomUUID } from "node:crypto";
import type { ImportFileStore, SourceFile, StoredFile } from "../../application/imports/ports";
import type { Db } from "./database";

/**
 * Keeps raw uploads so a failed import can be retried and every import can be traced back
 * to the exact bytes it read (ADR 0015). Deleted with the user's imported data.
 */
export class SqliteImportFileStore implements ImportFileStore {
  constructor(private readonly db: Db) {}

  async save(userId: string, file: SourceFile, now: string): Promise<StoredFile> {
    const id = randomUUID();
    const sha256 = createHash("sha256").update(file.bytes).digest("hex");
    this.db
      .prepare(
        `INSERT INTO import_files (id, user_id, name, sha256, size, content, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, userId, file.name, sha256, file.bytes.byteLength, Buffer.from(file.bytes), now);
    return { id, sha256, ...file };
  }

  async load(userId: string, ids: string[]): Promise<StoredFile[]> {
    const select = this.db.prepare(
      "SELECT id, name, sha256, content FROM import_files WHERE id = ? AND user_id = ?",
    );
    return ids.flatMap((id) => {
      const row = select.get(id, userId) as
        { id: string; name: string; sha256: string; content: Buffer } | undefined;
      return row
        ? [{ id: row.id, name: row.name, sha256: row.sha256, bytes: new Uint8Array(row.content) }]
        : [];
    });
  }
}
