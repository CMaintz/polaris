// Everything here is owned by an account and is deleted with it.
export const INTELLIGENCE_SCHEMA = [
  `CREATE TABLE peers (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    profile_url TEXT,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX peers_account ON peers(account_id, name)`,
  // The id is the job id, so a report and the job that writes it can never drift apart.
  // peer_name is a snapshot: a report keeps saying who it was about after the peer is deleted.
  `CREATE TABLE research_reports (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    peer_id TEXT REFERENCES peers(id) ON DELETE SET NULL,
    peer_name TEXT,
    question TEXT NOT NULL,
    body TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT
  )`,
  `CREATE INDEX research_reports_account ON research_reports(account_id, created_at)`,
  `CREATE TABLE feeds (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    title TEXT,
    last_fetched_at TEXT,
    last_status TEXT CHECK (last_status IN ('ok', 'error')),
    last_error TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (account_id, url)
  )`,
  `CREATE TABLE feed_items (
    id TEXT PRIMARY KEY,
    feed_id TEXT NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
    dedupe_key TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    link TEXT,
    published_at TEXT,
    fetched_at TEXT NOT NULL,
    UNIQUE (feed_id, dedupe_key)
  )`,
  `CREATE INDEX feed_items_fetched ON feed_items(feed_id, fetched_at)`,
  `CREATE TABLE trend_digests (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    period_from TEXT NOT NULL,
    period_to TEXT NOT NULL,
    matches TEXT NOT NULL,
    ai TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX trend_digests_account ON trend_digests(account_id, created_at)`,
  `CREATE TABLE schedules (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    kind TEXT NOT NULL
      CHECK (kind IN ('feed_refresh', 'trend_digest', 'account_review', 'research_rerun')),
    cadence TEXT NOT NULL CHECK (cadence IN ('daily', 'weekly')),
    params TEXT NOT NULL DEFAULT '{}',
    enabled INTEGER NOT NULL DEFAULT 1,
    next_run_at TEXT NOT NULL,
    last_run_at TEXT,
    last_job_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX schedules_due ON schedules(enabled, next_run_at)`,
] as const;
