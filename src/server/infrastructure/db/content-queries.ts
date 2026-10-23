import type {
  AccountDay,
  AudienceSnapshot,
  ContentQueries,
  MetricObservation,
} from "../../application/analytics/ports";
import type { ContentType, Dataset } from "../../domain/content";
import { EMPTY_METRICS, type PostMetrics, mergeMetrics } from "../../domain/metrics";
import type { PostRecord } from "../../domain/posts";
import { type Db, fromJson } from "./database";

interface PostRow {
  id: string;
  external_id: string;
  dataset: Dataset;
  url: string | null;
  text: string | null;
  published_at: string | null;
  time_known: number;
  content_type: ContentType;
  providers: string;
  topics: string | null;
  impressions: number | null;
  reactions: number | null;
  comments: number | null;
  reposts: number | null;
  clicks: number | null;
  engagements: number | null;
  observed_on: string | null;
  period_from: string | null;
  period_to: string | null;
  provider: string | null;
}

// The latest observation per post: the newest observed day, ties broken by provider name so
// the choice is deterministic.
const POSTS = `
  WITH latest AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY post_id ORDER BY observed_on DESC, provider) AS n
    FROM post_metric_snapshots
  )
  SELECT p.*, l.impressions, l.reactions, l.comments, l.reposts, l.clicks, l.engagements,
    l.observed_on, l.period_from, l.period_to, l.provider,
    (SELECT json_group_array(t.name) FROM post_topics pt JOIN topics t ON t.id = pt.topic_id
     WHERE pt.post_id = p.id) AS topics
  FROM posts p LEFT JOIN latest l ON l.post_id = p.id AND l.n = 1
  WHERE p.account_id = ?
  ORDER BY p.published_at DESC`;

function toRecord(row: PostRow): PostRecord {
  return {
    id: row.id,
    externalId: row.external_id,
    dataset: row.dataset,
    url: row.url,
    text: row.text,
    publishedAt: row.published_at,
    timeKnown: row.time_known === 1,
    contentType: row.content_type,
    providers: fromJson<string[]>(row.providers) ?? [],
    topics: (fromJson<string[]>(row.topics) ?? []).sort(),
    metrics: {
      impressions: row.impressions,
      reactions: row.reactions,
      comments: row.comments,
      reposts: row.reposts,
      clicks: row.clicks,
      engagements: row.engagements,
    },
    metricsObservedOn: row.observed_on,
    metricsPeriod:
      row.period_from && row.period_to ? { from: row.period_from, to: row.period_to } : null,
    metricsProvider: row.provider,
  };
}

export class SqliteContentQueries implements ContentQueries {
  constructor(private readonly db: Db) {}

  /**
   * Posts with metrics folded over every observation, oldest first, so a later export that
   * omits a figure does not erase the one an earlier export reported.
   */
  async posts(accountId: string): Promise<PostRecord[]> {
    const records = (this.db.prepare(POSTS).all(accountId) as PostRow[]).map(toRecord);
    const history = this.db
      .prepare(
        `SELECT m.* FROM post_metric_snapshots m JOIN posts p ON p.id = m.post_id
         WHERE p.account_id = ? ORDER BY m.observed_on, m.provider`,
      )
      .all(accountId) as (PostRow & { post_id: string })[];
    const merged = new Map<string, { metrics: PostMetrics; providers: Set<string> }>();
    for (const row of history) {
      const entry = merged.get(row.post_id) ?? { metrics: EMPTY_METRICS, providers: new Set() };
      entry.metrics = mergeMetrics(
        entry.metrics,
        toRecord({ ...row, providers: "[]", topics: null }).metrics,
      );
      entry.providers.add(row.provider as string);
      merged.set(row.post_id, entry);
    }
    return records.map((record) => {
      const entry = merged.get(record.id);
      if (!entry) return record;
      return { ...record, metrics: entry.metrics, metricsProvider: [...entry.providers].join(",") };
    });
  }

  async observations(accountId: string, postId: string): Promise<MetricObservation[]> {
    const rows = this.db
      .prepare(
        `SELECT m.* FROM post_metric_snapshots m JOIN posts p ON p.id = m.post_id
         WHERE p.account_id = ? AND m.post_id = ? ORDER BY m.observed_on, m.provider`,
      )
      .all(accountId, postId) as (PostRow & { import_job_id: string | null })[];
    return rows.map((row) => {
      const record = toRecord({ ...row, providers: "[]", topics: null });
      return {
        observedOn: row.observed_on as string,
        provider: row.provider as string,
        metrics: record.metrics,
        period: record.metricsPeriod,
        importJobId: row.import_job_id,
      };
    });
  }

  async accountDays(accountId: string): Promise<AccountDay[]> {
    // One provider reports each day today; MAX merges rows should a second provider add one.
    return this.db
      .prepare(
        `SELECT day, MAX(followers) AS followers, MAX(new_followers) AS newFollowers,
           MAX(impressions) AS impressions, MAX(engagements) AS engagements,
           group_concat(DISTINCT provider) AS provider
         FROM account_metric_days WHERE account_id = ? GROUP BY day ORDER BY day`,
      )
      .all(accountId) as AccountDay[];
  }

  async latestAudience(accountId: string): Promise<AudienceSnapshot | null> {
    const latest = this.db
      .prepare(
        `SELECT observed_on, provider FROM audience_segments WHERE account_id = ?
         ORDER BY observed_on DESC LIMIT 1`,
      )
      .get(accountId) as { observed_on: string; provider: string } | undefined;
    if (!latest) return null;
    const segments = this.db
      .prepare(
        `SELECT dimension, value, share FROM audience_segments
         WHERE account_id = ? AND observed_on = ? AND provider = ? ORDER BY dimension, share DESC`,
      )
      .all(accountId, latest.observed_on, latest.provider) as AudienceSnapshot["segments"];
    return { observedOn: latest.observed_on, provider: latest.provider, segments };
  }
}
