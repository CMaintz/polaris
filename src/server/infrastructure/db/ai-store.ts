import { randomUUID } from "node:crypto";
import type { AiProviderId } from "../../application/ai/ports";
import type {
  AiInsight,
  CredentialStore,
  InsightFilter,
  InsightStore,
  InteractionLog,
  InteractionRecord,
  Recommendation,
  RecommendationStatus,
  StoredCredential,
} from "../../application/ai/store";
import type { EvidenceItem } from "../../domain/insights";
import { type Db, fromJson, toJson } from "./database";

type Row = Record<string, unknown>;

const toInsight = (r: Row): AiInsight => ({
  id: r["id"] as string,
  scope: r["scope"] as AiInsight["scope"],
  postId: r["post_id"] as string | null,
  title: r["title"] as string,
  observation: r["observation"] as string,
  interpretation: r["interpretation"] as string,
  action: r["action"] as string,
  signal: r["signal"] as string,
  confidence: r["confidence"] as AiInsight["confidence"],
  evidence: fromJson<EvidenceItem[]>(r["evidence"] as string) ?? [],
  basedOnDemo: r["based_on_demo"] === 1,
  createdAt: r["created_at"] as string,
  interactionId: r["interaction_id"] as string,
});

const toRecommendation = (r: Row): Recommendation => ({
  id: r["id"] as string,
  recommendation: r["recommendation"] as string,
  rationale: r["rationale"] as string,
  evidence: fromJson<EvidenceItem[]>(r["evidence"] as string) ?? [],
  status: r["status"] as RecommendationStatus,
  basedOnDemo: r["based_on_demo"] === 1,
  createdAt: r["created_at"] as string,
  interactionId: r["interaction_id"] as string,
});

export class SqliteAiStore implements CredentialStore, InteractionLog, InsightStore {
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
      .prepare(
        `INSERT INTO ai_interactions (id, user_id, job_id, provider, model, prompt_name, prompt_version,
           status, input_summary, output, error, input_tokens, output_tokens, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
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
    return rows.map((r) => ({
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
    }));
  }

  async saveInsights(accountId: string, insights: Omit<AiInsight, "id">[]) {
    const insert = this.db.prepare(
      `INSERT INTO ai_insights (id, account_id, interaction_id, scope, post_id, title, observation,
         interpretation, action, signal, confidence, evidence, based_on_demo, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    this.db.transaction(() => {
      for (const i of insights) {
        insert.run(
          randomUUID(),
          accountId,
          i.interactionId,
          i.scope,
          i.postId,
          i.title,
          i.observation,
          i.interpretation,
          i.action,
          i.signal,
          i.confidence,
          toJson(i.evidence),
          i.basedOnDemo ? 1 : 0,
          i.createdAt,
        );
      }
    })();
  }

  async saveRecommendations(accountId: string, recommendations: Omit<Recommendation, "id">[]) {
    const insert = this.db.prepare(
      `INSERT INTO recommendations (id, account_id, interaction_id, recommendation, rationale,
         evidence, status, based_on_demo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    this.db.transaction(() => {
      for (const r of recommendations) {
        insert.run(
          randomUUID(),
          accountId,
          r.interactionId,
          r.recommendation,
          r.rationale,
          toJson(r.evidence),
          r.status,
          r.basedOnDemo ? 1 : 0,
          r.createdAt,
          r.createdAt,
        );
      }
    })();
  }

  async insights(accountId: string, filter: InsightFilter) {
    const rows = this.db
      .prepare(
        `SELECT * FROM ai_insights WHERE account_id = ? AND (? IS NULL OR scope = ?)
         AND (? IS NULL OR post_id = ?) ORDER BY created_at DESC, rowid LIMIT 50`,
      )
      .all(
        accountId,
        filter.scope ?? null,
        filter.scope ?? null,
        filter.postId ?? null,
        filter.postId ?? null,
      ) as Row[];
    return rows.map(toInsight);
  }

  async recommendations(accountId: string) {
    const rows = this.db
      .prepare("SELECT * FROM recommendations WHERE account_id = ? ORDER BY created_at DESC, rowid")
      .all(accountId) as Row[];
    return rows.map(toRecommendation);
  }

  async setRecommendationStatus(
    accountId: string,
    id: string,
    status: RecommendationStatus,
    now: string,
  ) {
    return (
      this.db
        .prepare(
          "UPDATE recommendations SET status = ?, updated_at = ? WHERE id = ? AND account_id = ?",
        )
        .run(status, now, id, accountId).changes === 1
    );
  }
}
