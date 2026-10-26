import { randomUUID } from "node:crypto";
import type { ChangeCounts } from "../../application/content/ports";
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
  RETURNING id`;

// What makes a post changed. last_imported_at moves on every import, so it is left out;
// json() normalises the documents, which JSON.stringify writes first and json_patch after.
const POST_STATE = `
  SELECT url, text, published_at, time_known, content_type, json(providers) AS providers,
    json(source_metadata) AS source_metadata
  FROM posts WHERE account_id = ? AND external_id = ?`;

const SNAPSHOT_VALUES = [
  "impressions",
  "reactions",
  "comments",
  "reposts",
  "clicks",
  "engagements",
  "period_from",
  "period_to",
];
const merged = (column: string) => `COALESCE(excluded.${column}, s.${column})`;

// The WHERE leaves a row that would not change untouched, so import_job_id keeps naming the
// job that last changed it rather than the last job that re-read it.
const UPSERT_POST_METRICS = `
  INSERT INTO post_metric_snapshots AS s (post_id, observed_on, provider, impressions,
    reactions, comments, reposts, clicks, engagements, period_from, period_to, import_job_id)
  SELECT id, @observedOn, @provider, @impressions, @reactions, @comments, @reposts, @clicks,
    @engagements, @periodFrom, @periodTo, @jobId
  FROM posts WHERE account_id = @accountId AND external_id = @externalId
  ON CONFLICT (post_id, observed_on, provider) DO UPDATE SET
    ${SNAPSHOT_VALUES.map((column) => `${column} = ${merged(column)}`).join(", ")},
    import_job_id = excluded.import_job_id
  WHERE (${SNAPSHOT_VALUES.map(merged).join(", ")})
    IS NOT (${SNAPSHOT_VALUES.map((column) => `s.${column}`).join(", ")})`;

const SNAPSHOT_EXISTS = `
  SELECT 1 FROM post_metric_snapshots m JOIN posts p ON p.id = m.post_id
  WHERE p.account_id = @accountId AND p.external_id = @externalId
    AND m.observed_on = @observedOn AND m.provider = @provider`;

type Outcome = keyof ChangeCounts;

/** Counts each item's outcome; null is an item that wrote nothing. */
function tally<T>(items: readonly T[], classify: (item: T) => Outcome | null): ChangeCounts {
  const counts: ChangeCounts = { added: 0, changed: 0, unchanged: 0 };
  for (const item of items) {
    const outcome = classify(item);
    if (outcome) counts[outcome] += 1;
  }
  return counts;
}

/** json_patch treats null as "delete this key", so nulls must not reach it. */
function withoutNulls(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value != null));
}

/** Writes posts, their hashtag topics and their metric snapshots by the upsert rules above. */
export class PostWriter {
  constructor(private readonly db: Db) {}

  upsertPosts(accountId: string, bundle: ImportBundle, now: string): ChangeCounts {
    return tally(bundle.posts, (post) => this.upsert(accountId, bundle, post, now));
  }

  private upsert(accountId: string, bundle: ImportBundle, post: ImportedPost, now: string) {
    const state = this.db.prepare(POST_STATE);
    const before = state.get(accountId, post.externalId) as Record<string, unknown> | undefined;
    const id = this.write(accountId, bundle, post, now);
    const linked = this.tagTopics(accountId, id, [
      ...extractHashtags(post.text),
      ...(post.topics ?? []),
    ]);
    if (!before) return "added";
    const after = state.get(accountId, post.externalId) as Record<string, unknown>;
    const same = Object.keys(before).every((column) => before[column] === after[column]);
    return same && linked === 0 ? "unchanged" : "changed";
  }

  private write(accountId: string, bundle: ImportBundle, post: ImportedPost, now: string) {
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
    }) as { id: string };
    return row.id;
  }

  /** The number of topics newly linked to the post. */
  private tagTopics(accountId: string, postId: string, names: string[]): number {
    let linked = 0;
    for (const name of new Set(names)) {
      this.db
        .prepare(
          "INSERT INTO topics (id, account_id, name) VALUES (?, ?, ?) ON CONFLICT DO NOTHING",
        )
        .run(randomUUID(), accountId, name);
      linked += this.db
        .prepare(
          `INSERT INTO post_topics (post_id, topic_id, source, confidence)
           SELECT ?, id, 'hashtag', 1 FROM topics WHERE account_id = ? AND name = ?
           ON CONFLICT DO NOTHING`,
        )
        .run(postId, accountId, name).changes;
    }
    return linked;
  }

  upsertMetrics(accountId: string, bundle: ImportBundle, jobId: string): ChangeCounts {
    return tally(bundle.postMetrics, (entry) =>
      this.upsertSnapshot({
        accountId,
        externalId: entry.externalId,
        observedOn: entry.observedOn,
        provider: bundle.provider,
        ...entry.metrics,
        periodFrom: entry.period?.from ?? null,
        periodTo: entry.period?.to ?? null,
        jobId,
      }),
    );
  }

  private upsertSnapshot(params: Record<string, unknown>): Outcome | null {
    const existed = this.db.prepare(SNAPSHOT_EXISTS).get(params) !== undefined;
    const written = this.db.prepare(UPSERT_POST_METRICS).run(params).changes > 0;
    if (existed) return written ? "changed" : "unchanged";
    // Neither there before nor written: the metrics name a post this account does not have.
    return written ? "added" : null;
  }
}
