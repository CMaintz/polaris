import type { Db } from "./database";
import { INTELLIGENCE_SCHEMA } from "./intelligence-schema";
import { KNOWLEDGE_SCHEMA } from "./knowledge-schema";
import { STRATEGY_MIGRATIONS } from "./strategy-schema";

// Append-only: each entry runs once, in order, tracked by PRAGMA user_version.
// Editing an applied migration does nothing on existing databases, so change schema
// by adding a new entry.
const MIGRATIONS: readonly string[] = [
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
  `
  CREATE TABLE ai_credentials (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('anthropic', 'openai')),
    model TEXT NOT NULL,
    sealed_key TEXT NOT NULL,
    key_hint TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, provider)
  );

  CREATE TABLE ai_interactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_id TEXT,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt_name TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed')),
    input_summary TEXT NOT NULL,
    output TEXT,
    error TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    created_at TEXT NOT NULL
  );
  CREATE INDEX ai_interactions_user ON ai_interactions(user_id, created_at);

  CREATE TABLE ai_insights (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    interaction_id TEXT NOT NULL REFERENCES ai_interactions(id) ON DELETE CASCADE,
    scope TEXT NOT NULL,
    post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    observation TEXT NOT NULL,
    interpretation TEXT NOT NULL,
    action TEXT NOT NULL,
    signal TEXT NOT NULL,
    confidence TEXT NOT NULL,
    evidence TEXT NOT NULL,
    based_on_demo INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE recommendations (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    interaction_id TEXT NOT NULL REFERENCES ai_interactions(id) ON DELETE CASCADE,
    recommendation TEXT NOT NULL,
    rationale TEXT NOT NULL,
    evidence TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('open', 'accepted', 'dismissed', 'done')),
    based_on_demo INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  `,
  `
  CREATE TABLE goals (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    metric TEXT NOT NULL,
    target REAL NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE experiments (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    goal_id TEXT REFERENCES goals(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    hypothesis TEXT NOT NULL,
    variable TEXT NOT NULL DEFAULT '',
    metric TEXT NOT NULL,
    baseline REAL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('planned', 'running', 'completed', 'abandoned')),
    result TEXT NOT NULL DEFAULT '',
    conclusion TEXT NOT NULL DEFAULT '',
    follow_up TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE plan_items (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    concept TEXT NOT NULL DEFAULT '',
    target_topic TEXT NOT NULL DEFAULT '',
    planned_date TEXT,
    status TEXT NOT NULL CHECK (status IN ('idea', 'drafting', 'planned', 'published', 'dropped')),
    draft TEXT NOT NULL DEFAULT '',
    post_id TEXT REFERENCES posts(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  `,
  ...STRATEGY_MIGRATIONS,
  KNOWLEDGE_SCHEMA.join(";\n"),
  INTELLIGENCE_SCHEMA.join(";\n"),
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
