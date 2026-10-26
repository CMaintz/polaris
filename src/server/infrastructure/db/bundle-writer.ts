import type { ApplyStats } from "../../application/content/ports";
import type { ImportBundle } from "../../domain/content";
import type { Db } from "./database";
import { PostWriter } from "./post-writer";

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

/** Merges one import bundle into an account's content tables, in a single transaction. */
export class BundleWriter {
  private readonly posts: PostWriter;

  constructor(private readonly db: Db) {
    this.posts = new PostWriter(db);
  }

  apply(accountId: string, bundle: ImportBundle, jobId: string, now: string): ApplyStats {
    return this.db.transaction(() => {
      if (bundle.profile) this.updateProfile(accountId, bundle.profile, now);
      // Posts go first because the snapshots find their post by external id.
      const posts = this.posts.upsertPosts(accountId, bundle, now);
      return {
        posts,
        metricSnapshots: this.posts.upsertMetrics(accountId, bundle, jobId),
        accountDays: this.upsertAccountDays(accountId, bundle, jobId),
        audienceSegments: this.replaceAudience(accountId, bundle, jobId),
      };
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
