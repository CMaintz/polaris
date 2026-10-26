// LinkedIn metric refresh: which scopes a connection was granted, and a schedule kind for it.
// The schedules CHECK cannot be widened in place, so the table is rebuilt. Nothing references
// schedules, so dropping the old table cascades nowhere and foreign keys can stay on.
export const METRIC_REFRESH_SCHEMA = `
  ALTER TABLE publishing_connections ADD COLUMN granted_scopes TEXT;

  CREATE TABLE schedules_new (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('feed_refresh', 'trend_digest', 'account_review',
      'research_rerun', 'metric_refresh')),
    cadence TEXT NOT NULL CHECK (cadence IN ('daily', 'weekly')),
    params TEXT NOT NULL DEFAULT '{}',
    enabled INTEGER NOT NULL DEFAULT 1,
    next_run_at TEXT NOT NULL,
    last_run_at TEXT,
    last_job_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  INSERT INTO schedules_new SELECT id, account_id, kind, cadence, params, enabled, next_run_at,
    last_run_at, last_job_id, created_at, updated_at FROM schedules;
  DROP TABLE schedules;
  ALTER TABLE schedules_new RENAME TO schedules;
  CREATE INDEX schedules_due ON schedules(enabled, next_run_at);
`;
