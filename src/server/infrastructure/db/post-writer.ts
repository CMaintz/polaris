import { randomUUID } from "node:crypto";
import { type ImportBundle, type ImportedPost, extractHashtags } from "../../domain/content";
import { type Db, toJson } from "./database";

// Upsert rules: a known value is never replaced by null; a timed publish date beats a
// date-only one; a specific content type beats "unknown"; providers accumulate.
const UPSERT_POST = `
  INSERT INTO posts (id, account_id, dataset, external_id, url, text, published_at, time_known,
    content_type, providers, source_metadata, first_imported_at, last_imported_at)
  VALUES (@id, @accountId, @dataset, @externalId, @url, @text, @publishedAt, @timeKnown,
    @contentType, json_array(@provider), @sourceMetadata, @now, @now)
  ON CONFLICT (account_id, external_id) DO UPDATE SET
    url = COALESCE(excluded.url, posts.url),
    text = COALESCE(excluded.text, posts.text),
    published_at = CASE
      WHEN posts.published_at IS NULL OR (excluded.time_known = 1 AND posts.time_known = 0)
      THEN COALESCE(excluded.published_at, posts.published_at) ELSE posts.published_at END,
    time_known = MAX(posts.time_known, excluded.time_known),
    content_type = CASE WHEN excluded.content_type = 'unknown'
      THEN posts.content_type ELSE excluded.content_type END,
    providers = CASE WHEN EXISTS (SELECT 1 FROM json_each(posts.providers) WHERE value = @provider)
      THEN posts.providers ELSE json_insert(posts.providers, '$[#]', @provider) END,
    source_metadata = json_patch(posts.source_metadata, excluded.source_metadata),
    last_imported_at = excluded.last_imported_at
  RETURNING id, id = @id AS created`;

const UPSERT_POST_METRICS = `
  INSERT INTO post_metric_snapshots (post_id, observed_on, provider, impressions, reactions,
    comments, reposts, clicks, engagements, period_from, period_to, import_job_id)
  SELECT id, @observedOn, @provider, @impressions, @reactions, @comments, @reposts, @clicks,
    @engagements, @periodFrom, @periodTo, @jobId
  FROM posts WHERE account_id = @accountId AND external_id = @externalId
  ON CONFLICT (post_id, observed_on, provider) DO UPDATE SET
    impressions = COALESCE(excluded.impressions, impressions),
    reactions = COALESCE(excluded.reactions, reactions),
    comments = COALESCE(excluded.comments, comments),
    reposts = COALESCE(excluded.reposts, reposts),
    clicks = COALESCE(excluded.clicks, clicks),
    engagements = COALESCE(excluded.engagements, engagements),
    period_from = COALESCE(excluded.period_from, period_from),
    period_to = COALESCE(excluded.period_to, period_to),
    import_job_id = excluded.import_job_id`;

/** json_patch treats null as "delete this key", so nulls must not reach it. */
function withoutNulls(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value != null));
}

/** Writes posts, their hashtag topics and their metric snapshots by the upsert rules above. */
export class PostWriter {
  constructor(private readonly db: Db) {}

  /** True when the post was new. */
  upsert(accountId: string, bundle: ImportBundle, post: ImportedPost, now: string): boolean {
    const row = this.db.prepare(UPSERT_POST).get({
      id: randomUUID(),
      accountId,
      dataset: bundle.dataset,
      provider: bundle.provider,
      externalId: post.externalId,
      url: post.url,
      text: post.text,
      publishedAt: post.publishedAt,
      timeKnown: post.timeKnown ? 1 : 0,
      contentType: post.contentType,
      sourceMetadata: toJson(withoutNulls(post.sourceMetadata)),
      now,
    }) as { id: string; created: number };
    this.tagTopics(accountId, row.id, [...extractHashtags(post.text), ...(post.topics ?? [])]);
    return row.created === 1;
  }

  private tagTopics(accountId: string, postId: string, names: string[]) {
    for (const name of new Set(names)) {
      this.db
        .prepare(
          "INSERT INTO topics (id, account_id, name) VALUES (?, ?, ?) ON CONFLICT DO NOTHING",
        )
        .run(randomUUID(), accountId, name);
      this.db
        .prepare(
          `INSERT INTO post_topics (post_id, topic_id, source, confidence)
           SELECT ?, id, 'hashtag', 1 FROM topics WHERE account_id = ? AND name = ?
           ON CONFLICT DO NOTHING`,
        )
        .run(postId, accountId, name);
    }
  }

  upsertMetrics(accountId: string, bundle: ImportBundle, jobId: string): number {
    const statement = this.db.prepare(UPSERT_POST_METRICS);
    return bundle.postMetrics.reduce((count, entry) => {
      const result = statement.run({
        accountId,
        externalId: entry.externalId,
        observedOn: entry.observedOn,
        provider: bundle.provider,
        ...entry.metrics,
        periodFrom: entry.period?.from ?? null,
        periodTo: entry.period?.to ?? null,
        jobId,
      });
      return count + result.changes;
    }, 0);
  }
}
