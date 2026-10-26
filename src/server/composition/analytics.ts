import { AnalyticsService } from "../application/analytics/analytics-service";
import type { Clock } from "../application/clock";
import { SqliteContentQueries } from "../infrastructure/db/content-queries";
import { SqliteContentStore } from "../infrastructure/db/content-store";
import type { Db } from "../infrastructure/db/database";

/** The analytics reads, built one way for the web app and the read-only MCP server. */
export function buildAnalyticsReads(db: Db, clock: Clock) {
  const content = new SqliteContentStore(db);
  const queries = new SqliteContentQueries(db);
  return { content, queries, analytics: new AnalyticsService(content, queries, clock) };
}
