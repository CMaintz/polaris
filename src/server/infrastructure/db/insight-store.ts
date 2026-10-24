import { randomUUID } from "node:crypto";
import type {
  AiInsight,
  InsightFilter,
  InsightStore,
  Recommendation,
  RecommendationStatus,
} from "../../application/ai/store";
import type { EvidenceItem } from "../../domain/insight-types";
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

const INSERT_INSIGHT = `INSERT INTO ai_insights (id, account_id, interaction_id, scope, post_id,
    title, observation, interpretation, action, signal, confidence, evidence, based_on_demo,
    created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const INSERT_RECOMMENDATION = `INSERT INTO recommendations (id, account_id, interaction_id,
    recommendation, rationale, evidence, status, based_on_demo, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const insightValues = (accountId: string, i: Omit<AiInsight, "id">) => [
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
];

const recommendationValues = (accountId: string, r: Omit<Recommendation, "id">) => [
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
];

export class SqliteInsightStore implements InsightStore {
  constructor(private readonly db: Db) {}

  async saveInsights(accountId: string, insights: Omit<AiInsight, "id">[]) {
    const insert = this.db.prepare(INSERT_INSIGHT);
    this.db.transaction(() => {
      for (const i of insights) insert.run(...insightValues(accountId, i));
    })();
  }

  async saveRecommendations(accountId: string, recommendations: Omit<Recommendation, "id">[]) {
    const insert = this.db.prepare(INSERT_RECOMMENDATION);
    this.db.transaction(() => {
      for (const r of recommendations) insert.run(...recommendationValues(accountId, r));
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
