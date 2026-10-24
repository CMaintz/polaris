import type { Dataset } from "../../domain/content";

/**
 * How a table's rows tie to a dataset: a `dataset` column, a `based_on_demo` flag on rows
 * derived from data (AI output), or not at all. Rows that cascade from posts are not listed.
 */
type DatasetScope = "column" | "demo_flag" | "none";

interface AccountTable {
  name: string;
  /**
   * Imported or derived from imported data. Goals, experiments and plans are the user's own
   * writing, so they survive a "delete imported data".
   */
  imported: boolean;
  dataset: DatasetScope;
  /**
   * False leaves the table out of the export (search indexes, which are rebuilt from posts;
   * OAuth states, which are short-lived secrets). A string lists the exported columns, for
   * tables that also hold a secret.
   */
  exported?: false | string;
}

/** Every table keyed by `account_id`. A new account table belongs here, or wipes miss it. */
const ACCOUNT_TABLES: readonly AccountTable[] = [
  { name: "posts", imported: true, dataset: "column" },
  { name: "account_metric_days", imported: true, dataset: "column" },
  { name: "audience_segments", imported: true, dataset: "column" },
  // Topics are shared by every dataset's posts; orphans are cleaned up after a wipe.
  { name: "topics", imported: true, dataset: "none" },
  { name: "ai_insights", imported: true, dataset: "demo_flag" },
  { name: "recommendations", imported: true, dataset: "demo_flag" },
  { name: "goals", imported: false, dataset: "none" },
  { name: "experiments", imported: false, dataset: "none" },
  { name: "plan_items", imported: false, dataset: "none" },
  { name: "theme_runs", imported: true, dataset: "demo_flag" },
  { name: "themes", imported: true, dataset: "none" },
  { name: "knowledge_documents", imported: true, dataset: "none", exported: false },
  { name: "post_embeddings", imported: true, dataset: "none", exported: false },
  // Derived from imported posts and topics, so "delete imported data" removes them too.
  { name: "research_reports", imported: true, dataset: "none" },
  { name: "trend_digests", imported: true, dataset: "none" },
  { name: "peers", imported: false, dataset: "none" },
  { name: "feeds", imported: false, dataset: "none" },
  { name: "schedules", imported: false, dataset: "none" },
  { name: "drafts", imported: false, dataset: "none" },
  // AI proposals are derived from imported data and carry based_on_demo.
  { name: "proposals", imported: true, dataset: "demo_flag" },
  { name: "publications", imported: false, dataset: "none" },
  {
    name: "publishing_connections",
    imported: false,
    dataset: "none",
    exported: "provider, member_urn, display_name, expires_at, created_at",
  },
  { name: "publishing_oauth_states", imported: false, dataset: "none", exported: false },
  { name: "campaigns", imported: false, dataset: "none" },
  { name: "content_pillars", imported: false, dataset: "none" },
];

/**
 * Tables without an `account_id`, owned through a parent row. Wipes reach them by cascade;
 * the export needs them listed, or it silently leaves them out.
 */
const CHILD_TABLES: readonly { name: string; parent: string; key: string }[] = [
  { name: "post_metric_snapshots", parent: "posts", key: "post_id" },
  { name: "post_topics", parent: "posts", key: "post_id" },
  { name: "post_themes", parent: "posts", key: "post_id" },
  { name: "feed_items", parent: "feeds", key: "feed_id" },
  { name: "draft_versions", parent: "drafts", key: "draft_id" },
  { name: "campaign_posts", parent: "campaigns", key: "campaign_id" },
  { name: "campaign_plan_items", parent: "campaigns", key: "campaign_id" },
  { name: "campaign_goals", parent: "campaigns", key: "campaign_id" },
];

/** Selects one exported table's rows for an account id. */
export const exportQueries = (): { name: string; sql: string }[] =>
  ACCOUNT_TABLES.filter((t) => t.exported !== false).map(({ name, exported }) => ({
    name,
    sql: `SELECT ${exported ?? "*"} FROM ${name} WHERE account_id = ?`,
  }));

/** Selects one child table's rows for an account id. */
export const childTableQueries = (): { name: string; sql: string }[] =>
  CHILD_TABLES.map(({ name, parent, key }) => ({
    name,
    sql: `SELECT c.* FROM ${name} c JOIN ${parent} p ON p.id = c.${key} WHERE p.account_id = ?`,
  }));

export const importedTables = (): string[] =>
  ACCOUNT_TABLES.filter((t) => t.imported).map((t) => t.name);

interface ScopedDelete {
  /** Takes the account id, then `value`. */
  sql: string;
  value: string | number;
}

/** The deletes that remove one dataset's rows, and the AI output derived from it. */
export function datasetDeletes(dataset: Dataset): ScopedDelete[] {
  return ACCOUNT_TABLES.flatMap(({ name, dataset: scope }): ScopedDelete[] => {
    if (scope === "column")
      return [{ sql: `DELETE FROM ${name} WHERE account_id = ? AND dataset = ?`, value: dataset }];
    if (scope === "demo_flag") {
      const sql = `DELETE FROM ${name} WHERE account_id = ? AND based_on_demo = ?`;
      return [{ sql, value: dataset === "demo" ? 1 : 0 }];
    }
    return [];
  });
}
