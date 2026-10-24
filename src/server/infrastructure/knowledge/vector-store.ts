import type { StoredVector, VectorStore } from "../../application/knowledge/ports";
import type { Db } from "../db/database";

// Little-endian float32, the platform byte order of every machine Polaris targets (x64, arm64).
function toBlob(vector: Float32Array): Buffer {
  return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
}

/** Copies out of the row buffer, which SQLite may reuse and need not be 4-byte aligned. */
function fromBlob(blob: Buffer): Float32Array {
  const copy = new Uint8Array(blob);
  return new Float32Array(copy.buffer, 0, copy.byteLength / 4);
}

export class SqliteVectorStore implements VectorStore {
  constructor(private readonly db: Db) {}

  async vectors(accountId: string, model: string): Promise<StoredVector[]> {
    const rows = this.db
      .prepare(
        "SELECT post_id, text_hash, vector FROM post_embeddings WHERE account_id = ? AND model = ?",
      )
      .all(accountId, model) as { post_id: string; text_hash: string; vector: Buffer }[];
    return rows.map((r) => ({
      postId: r.post_id,
      textHash: r.text_hash,
      vector: fromBlob(r.vector),
    }));
  }

  async save(accountId: string, model: string, entries: StoredVector[], now: string) {
    const upsert = this.db.prepare(
      `INSERT INTO post_embeddings (post_id, account_id, model, text_hash, vector, embedded_at)
       SELECT id, account_id, @model, @hash, @vector, @now FROM posts
       WHERE id = @postId AND account_id = @accountId
       ON CONFLICT (post_id) DO UPDATE SET model = excluded.model, text_hash = excluded.text_hash,
         vector = excluded.vector, embedded_at = excluded.embedded_at`,
    );
    this.db.transaction(() => {
      for (const e of entries) {
        upsert.run({
          accountId,
          model,
          postId: e.postId,
          hash: e.textHash,
          vector: toBlob(e.vector),
          now,
        });
      }
    })();
  }

  async prune(accountId: string, model: string, keep: ReadonlySet<string>) {
    this.db
      .prepare(
        `DELETE FROM post_embeddings WHERE account_id = ?
         AND (model <> ? OR post_id NOT IN (SELECT value FROM json_each(?)))`,
      )
      .run(accountId, model, JSON.stringify([...keep]));
  }
}
