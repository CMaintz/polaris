import { randomUUID } from "node:crypto";
import type { AiProviderId } from "../../application/ai/ports";
import type {
  CredentialStore,
  InteractionLog,
  InteractionRecord,
  StoredCredential,
} from "../../application/ai/store";
import { type Db, fromJson, toJson } from "./database";

type Row = Record<string, unknown>;

const INSERT_INTERACTION = `INSERT INTO ai_interactions (id, user_id, job_id, provider, model,
    prompt_name, prompt_version, status, input_summary, output, error, input_tokens,
    output_tokens, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const toInteraction = (r: Row) => ({
  id: r["id"] as string,
  userId: r["user_id"] as string,
  jobId: r["job_id"] as string | null,
  provider: r["provider"] as AiProviderId,
  model: r["model"] as string,
  promptName: r["prompt_name"] as string,
  promptVersion: r["prompt_version"] as string,
  status: r["status"] as InteractionRecord["status"],
  inputSummary: fromJson<Record<string, unknown>>(r["input_summary"] as string) ?? {},
  output: fromJson(r["output"] as string | null),
  error: r["error"] as string | null,
  inputTokens: r["input_tokens"] as number | null,
  outputTokens: r["output_tokens"] as number | null,
  createdAt: r["created_at"] as string,
});

export class SqliteAiStore implements CredentialStore, InteractionLog {
  constructor(private readonly db: Db) {}

  async saveCredential(userId: string, c: Omit<StoredCredential, "active">, now: string) {
    this.db.transaction(() => {
      this.db.prepare("UPDATE ai_credentials SET active = 0 WHERE user_id = ?").run(userId);
      this.db
        .prepare(
          `INSERT INTO ai_credentials (user_id, provider, model, sealed_key, key_hint, active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?)
           ON CONFLICT (user_id, provider) DO UPDATE SET model = excluded.model,
             sealed_key = excluded.sealed_key, key_hint = excluded.key_hint, active = 1,
             updated_at = excluded.updated_at`,
        )
        .run(userId, c.provider, c.model, c.sealedKey, c.keyHint, now, now);
    })();
  }

  async credentials(userId: string): Promise<StoredCredential[]> {
    const rows = this.db
      .prepare("SELECT * FROM ai_credentials WHERE user_id = ? ORDER BY provider")
      .all(userId) as Row[];
    return rows.map((r) => ({
      provider: r["provider"] as AiProviderId,
      model: r["model"] as string,
      sealedKey: r["sealed_key"] as string,
      keyHint: r["key_hint"] as string,
      active: r["active"] === 1,
    }));
  }

  async deleteCredential(userId: string, provider: AiProviderId) {
    this.db
      .prepare("DELETE FROM ai_credentials WHERE user_id = ? AND provider = ?")
      .run(userId, provider);
  }

  async recordInteraction(r: InteractionRecord): Promise<string> {
    const id = randomUUID();
    this.db
      .prepare(INSERT_INTERACTION)
      .run(
        id,
        r.userId,
        r.jobId,
        r.provider,
        r.model,
        r.promptName,
        r.promptVersion,
        r.status,
        toJson(r.inputSummary),
        r.output === undefined ? null : toJson(r.output),
        r.error,
        r.inputTokens,
        r.outputTokens,
        r.createdAt,
      );
    return id;
  }

  async interactions(userId: string, limit: number) {
    const rows = this.db
      .prepare("SELECT * FROM ai_interactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(userId, limit) as Row[];
    return rows.map(toInteraction);
  }
}
