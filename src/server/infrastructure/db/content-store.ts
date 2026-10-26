import { randomUUID } from "node:crypto";
import type { Account, ApplyStats, ContentStore } from "../../application/content/ports";
import {
  type Dataset,
  type ImportBundle,
  type ImportedPost,
  extractHashtags,
} from "../../domain/content";
import { datasetDeletes } from "./account-tables";
import { type Db, toJson } from "./database";

interface AccountRow {
  id: string;
  user_id: string;
  display_name: string | null;
  headline: string | null;
  profile_url: string | null;
}

const toAccount = (row: AccountRow): Account => ({
  id: row.id,
  userId: row.user_id,
  displayName: row.display_name,
  headline: row.headline,
  profileUrl: row.profile_url,
});

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

const UPSERT_ACCOUNT_DAY = `
  INSERT INTO account_metric_days (account_id, day, provider, dataset, followers, new_followers,
    impressions, engagements, import_job_id)
  VALUES (@accountId, @day, @provider, @dataset, @followers, @newFollowers, @impressions,
    @engagements, @jobId)
  ON CONFLICT (account_id, day, provider) DO UPDATE SET
    followers = COALESCE(excluded.followers, followers),
    new_followers = COALESCE(excluded.new_followers, new_followers),
    impressions = COALESCE(excluded.impressions, impressions),
    engagements = COALESCE(excluded.engagements, engagements),
    import_job_id = excluded.import_job_id`;

/** json_patch treats null as "delete this key", so nulls must not reach it. */
function withoutNulls(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value != null));
}

export class SqliteContentStore implements ContentStore {
  constructor(private readonly db: Db) {}

  async ensureAccount(userId: string, now: string): Promise<Account> {
    this.db
      .prepare(
        `INSERT INTO accounts (id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (user_id) DO NOTHING`,
      )
      .run(randomUUID(), userId, now, now);
    return (await this.findAccount(userId)) as Account;
  }

  async findAccount(userId: string): Promise<Account | null> {
    const row = this.db.prepare("SELECT * FROM accounts WHERE user_id = ?").get(userId) as
      AccountRow | undefined;
    return row ? toAccount(row) : null;
  }

  async applyBundle(account: Account, bundle: ImportBundle, jobId: string, now: string) {
    return this.db.transaction(() => {
      const stats: ApplyStats = {
        postsCreated: 0,
        postsUpdated: 0,
        metricSnapshots: 0,
        accountDays: 0,
        audienceSegments: 0,
      };
      if (bundle.profile) this.updateProfile(account.id, bundle.profile, now);
      for (const post of bundle.posts) this.upsertPost(account.id, bundle, post, now, stats);
      stats.metricSnapshots = this.upsertPostMetrics(account.id, bundle, jobId);
      stats.accountDays = this.upsertAccountDays(account.id, bundle, jobId);
      stats.audienceSegments = this.replaceAudience(account.id, bundle, jobId);
      return stats;
    })();
  }

  async hasDataset(accountId: string, dataset: Dataset): Promise<boolean> {
    const row = this.db
      .prepare(
        `SELECT EXISTS (SELECT 1 FROM posts WHERE account_id = ? AND dataset = ?)
             OR EXISTS (SELECT 1 FROM account_metric_days WHERE account_id = ? AND dataset = ?) AS found`,
      )
      .get(accountId, dataset, accountId, dataset) as { found: number };
    return row.found === 1;
  }

  async hasPost(accountId: string, postId: string): Promise<boolean> {
    return (
      this.db
        .prepare("SELECT 1 FROM posts WHERE account_id = ? AND id = ?")
        .get(accountId, postId) !== undefined
    );
  }

  async deleteDataset(accountId: string, dataset: Dataset): Promise<void> {
    this.db.transaction(() => {
      for (const { sql, value } of datasetDeletes(dataset)) {
        this.db.prepare(sql).run(accountId, value);
      }
      this.db
        .prepare(
          `DELETE FROM topics WHERE account_id = ?
           AND id NOT IN (SELECT topic_id FROM post_topics)`,
        )
        .run(accountId);
    })();
  }

  private updateProfile(
    accountId: string,
    profile: NonNullable<ImportBundle["profile"]>,
    now: string,
  ) {
    this.db
      .prepare(
        `UPDATE accounts SET display_name = COALESCE(?, display_name),
         headline = COALESCE(?, headline), profile_url = COALESCE(?, profile_url), updated_at = ?
         WHERE id = ?`,
      )
      .run(profile.displayName, profile.headline, profile.profileUrl, now, accountId);
  }

  private upsertPost(
    accountId: string,
    bundle: ImportBundle,
    post: ImportedPost,
    now: string,
    stats: ApplyStats,
  ) {
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
    if (row.created === 1) stats.postsCreated += 1;
    else stats.postsUpdated += 1;
    this.tagHashtags(accountId, row.id, post.text);
  }

  private tagHashtags(accountId: string, postId: string, text: string | null) {
    for (const name of extractHashtags(text)) {
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

  private upsertPostMetrics(accountId: string, bundle: ImportBundle, jobId: string): number {
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

  private upsertAccountDays(accountId: string, bundle: ImportBundle, jobId: string): number {
    const statement = this.db.prepare(UPSERT_ACCOUNT_DAY);
    for (const day of bundle.accountDays) {
      statement.run({
        accountId,
        provider: bundle.provider,
        dataset: bundle.dataset,
        jobId,
        ...day,
      });
    }
    return bundle.accountDays.length;
  }

  /** An audience breakdown is a snapshot: a re-import of the same day replaces it whole. */
  private replaceAudience(accountId: string, bundle: ImportBundle, jobId: string): number {
    if (!bundle.audience) return 0;
    const { observedOn, segments } = bundle.audience;
    this.db
      .prepare(
        "DELETE FROM audience_segments WHERE account_id = ? AND observed_on = ? AND provider = ?",
      )
      .run(accountId, observedOn, bundle.provider);
    const insert = this.db.prepare(
      `INSERT OR REPLACE INTO audience_segments (account_id, observed_on, provider, dataset,
       dimension, value, share, import_job_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const s of segments) {
      insert.run(
        accountId,
        observedOn,
        bundle.provider,
        bundle.dataset,
        s.dimension,
        s.value,
        s.share,
        jobId,
      );
    }
    return segments.length;
  }
}
