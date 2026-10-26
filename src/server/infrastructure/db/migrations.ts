import type { Db } from "./database";

// Append-only: each entry runs once, in order, tracked by PRAGMA user_version.
// Editing an applied migration does nothing on existing databases, so change schema
// by adding a new entry.
export const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    settings TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX sessions_user ON sessions(user_id);

  CREATE TABLE jobs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('queued','running','completed','failed','retrying')),
    payload TEXT NOT NULL DEFAULT '{}',
    result TEXT,
    progress REAL NOT NULL DEFAULT 0,
    error TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    run_after TEXT NOT NULL,
    created_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT
  );
  CREATE INDEX jobs_due ON jobs(status, run_after);
  CREATE INDEX jobs_user ON jobs(user_id, created_at);

  CREATE TABLE audit_log (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    action TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );
  `,
  `
  CREATE TABLE accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    display_name TEXT,
    headline TEXT,
    profile_url TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE posts (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    dataset TEXT NOT NULL CHECK (dataset IN ('linkedin', 'demo')),
    external_id TEXT NOT NULL,
    url TEXT,
    text TEXT,
    published_at TEXT,
    time_known INTEGER NOT NULL DEFAULT 0,
    content_type TEXT NOT NULL,
    providers TEXT NOT NULL DEFAULT '[]',
    source_metadata TEXT NOT NULL DEFAULT '{}',
    first_imported_at TEXT NOT NULL,
    last_imported_at TEXT NOT NULL,
    UNIQUE (account_id, external_id)
  );
  CREATE INDEX posts_published ON posts(account_id, published_at);

  CREATE TABLE post_metric_snapshots (
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    observed_on TEXT NOT NULL,
    provider TEXT NOT NULL,
    impressions INTEGER,
    reactions INTEGER,
    comments INTEGER,
    reposts INTEGER,
    clicks INTEGER,
    engagements INTEGER,
    period_from TEXT,
    period_to TEXT,
    import_job_id TEXT,
    PRIMARY KEY (post_id, observed_on, provider)
  );

  CREATE TABLE account_metric_days (
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    day TEXT NOT NULL,
    provider TEXT NOT NULL,
    dataset TEXT NOT NULL,
    followers INTEGER,
    new_followers INTEGER,
    impressions INTEGER,
    engagements INTEGER,
    import_job_id TEXT,
    PRIMARY KEY (account_id, day, provider)
  );

  CREATE TABLE audience_segments (
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    observed_on TEXT NOT NULL,
    provider TEXT NOT NULL,
    dataset TEXT NOT NULL,
    dimension TEXT NOT NULL,
    value TEXT NOT NULL,
    share REAL,
    import_job_id TEXT,
    PRIMARY KEY (account_id, observed_on, provider, dimension, value)
  );

  CREATE TABLE topics (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    UNIQUE (account_id, name)
  );

  CREATE TABLE post_topics (
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    confidence REAL NOT NULL,
    PRIMARY KEY (post_id, topic_id, source)
  );

  CREATE TABLE import_files (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    size INTEGER NOT NULL,
    content BLOB NOT NULL,
    created_at TEXT NOT NULL
  );
  `,
];

export function migrate(db: Db): void {
  const current = db.pragma("user_version", { simple: true }) as number;
  MIGRATIONS.slice(current).forEach((sql, offset) => {
    db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${current + offset + 1}`);
    })();
  });
}
