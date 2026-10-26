import { createHash, randomUUID } from "node:crypto";
import { IMPORT_JOB } from "../../application/imports/import-service";
import type {
  ImportFileStore,
  ImportedBefore,
  SourceFile,
  StoredFile,
} from "../../application/imports/ports";
import type { Db } from "./database";

// Only a completed job counts: one that failed, or crashed after writing part of its data,
// must have its files read again, and the upserts make that repeat harmless.
const IMPORTED_BEFORE = `
  SELECT f.id AS fileId, f.name, MIN(j.completed_at) AS importedOn
  FROM import_files f
  JOIN import_files seen ON seen.user_id = f.user_id AND seen.sha256 = f.sha256
  JOIN jobs j ON j.user_id = f.user_id AND j.type = @type AND j.status = 'completed'
    AND json_extract(j.payload, '$.accountId') = @accountId
    AND EXISTS (SELECT 1 FROM json_each(j.payload, '$.fileIds') WHERE value = seen.id)
  WHERE f.id = @id AND f.user_id = @userId
  GROUP BY f.id`;

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

  async importedBefore(userId: string, ids: string[], accountId: string) {
    const select = this.db.prepare(IMPORTED_BEFORE);
    return ids.flatMap((id) => {
      const row = select.get({ id, userId, accountId, type: IMPORT_JOB }) as
        ImportedBefore | undefined;
      return row ? [row] : [];
    });
  }
}
