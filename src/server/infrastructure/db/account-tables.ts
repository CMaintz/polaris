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
];

export const accountTables = (): string[] => ACCOUNT_TABLES.map((t) => t.name);

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
