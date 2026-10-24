import { type ImportedPost, emptyBundle } from "../domain/content";
import { SqliteAiStore } from "../infrastructure/db/ai-store";
import { SqliteContentQueries } from "../infrastructure/db/content-queries";
import { SqliteContentStore } from "../infrastructure/db/content-store";
import { type Db, openDatabase } from "../infrastructure/db/database";
import { SqliteKeywordIndex } from "../infrastructure/db/knowledge-store";
import { SqliteThemeStore } from "../infrastructure/knowledge/theme-store";
import { SqliteVectorStore } from "../infrastructure/knowledge/vector-store";
import type { Clock } from "../application/clock";
import type { Embedder, EmbedderSource } from "../application/knowledge/ports";

export const NOW = "2026-07-01T12:00:00.000Z";
export const clock: Clock = () => new Date(NOW);

export interface SeedPost {
  text: string | null;
  day?: string;
  contentType?: ImportedPost["contentType"];
  engagements?: number;
}

export function knowledgeDb() {
  const db = openDatabase(":memory:");
  return {
    db,
    content: new SqliteContentStore(db),
    queries: new SqliteContentQueries(db),
    index: new SqliteKeywordIndex(db),
    vectors: new SqliteVectorStore(db),
    themes: new SqliteThemeStore(db),
    aiStore: new SqliteAiStore(db),
  };
}

/** A user and account with posts imported through the real import path, ids in order. */
export async function seedAccount(db: Db, email: string, posts: SeedPost[]) {
  const userId = `user-${email}`;
  db.prepare(
    "INSERT INTO users (id, email, password_hash, created_at, updated_at) VALUES (?, ?, 'x', ?, ?)",
  ).run(userId, email, NOW, NOW);
  const store = new SqliteContentStore(db);
  const account = await store.ensureAccount(userId, NOW);
  const bundle = emptyBundle("linkedin-data-export");
  posts.forEach((p, i) => {
    const externalId = `${email}-${i}`;
    bundle.posts.push({
      externalId,
      url: null,
      text: p.text,
      publishedAt: `${p.day ?? "2026-06-01"}T09:00:00.000Z`,
      timeKnown: true,
      contentType: p.contentType ?? "text",
      sourceMetadata: {},
    });
    if (p.engagements !== undefined) {
      const metrics = {
        impressions: p.engagements * 10,
        reactions: p.engagements,
        comments: 0,
        reposts: 0,
        clicks: null,
        engagements: p.engagements,
      };
      bundle.postMetrics.push({ externalId, observedOn: "2026-06-30", metrics, period: null });
    }
  });
  await store.applyBundle(account, bundle, "job-1", NOW);
  const ids = posts.map(
    (_p, i) =>
      (
        db.prepare("SELECT id FROM posts WHERE external_id = ?").get(`${email}-${i}`) as {
          id: string;
        }
      ).id,
  );
  return { userId, accountId: account.id, ids };
}

/** Re-imports seeded post `index` with new text, as a later LinkedIn export would. */
export async function reimportText(db: Db, email: string, index: number, text: string) {
  const store = new SqliteContentStore(db);
  const account = await store.ensureAccount(`user-${email}`, NOW);
  const bundle = emptyBundle("linkedin-data-export");
  bundle.posts.push({
    externalId: `${email}-${index}`,
    url: null,
    text,
    publishedAt: null,
    timeKnown: false,
    contentType: "text",
    sourceMetadata: {},
  });
  await store.applyBundle(account, bundle, "job-2", NOW);
}

/**
 * Embeds by counting a fixed vocabulary, so texts sharing a concept word point the same way
 * even with no word in common with the query ("hiring" and "recruiting" share a slot).
 */
export class FakeEmbedder implements Embedder {
  readonly provider = "openai" as const;
  readonly model = "fake-embedding";
  readonly calls: string[][] = [];
  failWith: Error | null = null;
  private static readonly SLOTS = [
    ["hiring", "recruiting", "talent", "candidates"],
    ["pricing", "price", "revenue", "billing"],
    ["coffee", "espresso", "barista"],
  ];

  async embed(texts: string[]) {
    this.calls.push(texts);
    if (this.failWith) throw this.failWith;
    const vectors = texts.map((text) => {
      const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
      return Float32Array.from(
        FakeEmbedder.SLOTS.map((slot) => words.filter((w) => slot.includes(w)).length),
      );
    });
    return { vectors, model: this.model, inputTokens: texts.length * 5 };
  }
}

export function embedderSource(
  embedder: Embedder | null,
  reason = "No OpenAI key",
): EmbedderSource {
  return {
    forUser: async () => (embedder ? { embedder, reason: null } : { embedder: null, reason }),
  };
}
