import { LINKEDIN_API, type RefreshTargets } from "../../application/refresh/ports";
import type { Platform } from "../../domain/accounts";
import type { Db } from "./database";

// LinkedIn's statistics API takes share and ugcPost URNs only; imported posts mostly carry
// activity URNs, which it rejects. GLOB is case-sensitive, as the URN types are.
const API_POST = `(p.external_id GLOB 'urn:li:share:[0-9]*'
  OR p.external_id GLOB 'urn:li:ugcPost:[0-9]*')`;

const NEVER_REFRESHED = `NOT EXISTS (SELECT 1 FROM post_metric_snapshots m
  WHERE m.post_id = p.id AND m.provider = @provider)`;

/** Recent posts first, so a capped run spends its requests where figures still move. */
const POSTS_TO_REFRESH = `
  SELECT p.external_id AS externalId FROM posts p
  WHERE p.account_id = @accountId AND p.dataset = 'linkedin' AND ${API_POST}
    AND (p.published_at >= @since OR ${NEVER_REFRESHED})
  ORDER BY COALESCE(p.published_at >= @since, 0) DESC, p.published_at DESC
  LIMIT @limit`;

export class SqliteRefreshTargets implements RefreshTargets {
  constructor(private readonly db: Db) {}

  async platform(accountId: string): Promise<Platform | null> {
    const row = this.db.prepare("SELECT platform FROM accounts WHERE id = ?").get(accountId) as
      { platform: Platform } | undefined;
    return row?.platform ?? null;
  }

  async lastAccountDay(accountId: string): Promise<string | null> {
    const row = this.db
      .prepare(
        `SELECT MAX(day) AS day FROM account_metric_days
         WHERE account_id = ? AND provider = ? AND impressions IS NOT NULL`,
      )
      .get(accountId, LINKEDIN_API) as { day: string | null };
    return row.day;
  }

  async postsToRefresh(accountId: string, since: string, limit: number): Promise<string[]> {
    const rows = this.db
      .prepare(POSTS_TO_REFRESH)
      .all({ accountId, since, limit, provider: LINKEDIN_API }) as { externalId: string }[];
    return rows.map((r) => r.externalId);
  }

  async postCounts(accountId: string): Promise<{ refreshable: number; total: number }> {
    return this.db
      .prepare(
        `SELECT COALESCE(SUM(${API_POST}), 0) AS refreshable, COUNT(*) AS total FROM posts p
         WHERE p.account_id = ? AND p.dataset = 'linkedin'`,
      )
      .get(accountId) as { refreshable: number; total: number };
  }
}
