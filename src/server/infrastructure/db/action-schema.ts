// Drafts, approvals and publishing (ADR 0024, ADR 0025).
export const ACTION_SCHEMA: readonly string[] = [
  `CREATE TABLE drafts (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    plan_item_id TEXT REFERENCES plan_items(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    version INTEGER NOT NULL,
    approved_version INTEGER,
    approved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    approved_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX drafts_account ON drafts(account_id, updated_at)`,
  `CREATE TABLE draft_versions (
    draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    text TEXT NOT NULL,
    origin TEXT NOT NULL CHECK (origin IN ('user', 'ai', 'restore')),
    notes TEXT NOT NULL DEFAULT '',
    interaction_id TEXT REFERENCES ai_interactions(id) ON DELETE SET NULL,
    based_on_demo INTEGER NOT NULL DEFAULT 0,
    job_id TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (draft_id, version)
  )`,
  // A retried AI job finds the version it already wrote instead of writing a second one.
  `CREATE UNIQUE INDEX draft_versions_job ON draft_versions(job_id) WHERE job_id IS NOT NULL`,
  `CREATE TABLE proposals (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('plan_item', 'experiment', 'goal')),
    payload TEXT NOT NULL,
    origin TEXT NOT NULL CHECK (origin IN ('ai', 'user')),
    rationale TEXT NOT NULL DEFAULT '',
    evidence TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'applied', 'failed')),
    decided_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    decided_at TEXT,
    applied_record_id TEXT,
    error TEXT,
    interaction_id TEXT REFERENCES ai_interactions(id) ON DELETE SET NULL,
    based_on_demo INTEGER NOT NULL DEFAULT 0,
    job_id TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX proposals_job ON proposals(job_id)`,
  `CREATE INDEX proposals_account ON proposals(account_id, status, created_at)`,
  `CREATE TABLE publications (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
    draft_version INTEGER NOT NULL,
    text TEXT NOT NULL,
    provider TEXT NOT NULL,
    scheduled_for TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('scheduled', 'publishing', 'awaiting_confirmation',
      'published', 'failed', 'cancelled')),
    queued_at TEXT,
    external_id TEXT,
    url TEXT,
    error TEXT,
    published_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX publications_due ON publications(status, scheduled_for)`,
  // At most one open publication per draft, so a draft can never be queued to post twice.
  `CREATE UNIQUE INDEX publications_open ON publications(draft_id)
    WHERE status IN ('scheduled', 'publishing', 'awaiting_confirmation')`,
  `CREATE TABLE publishing_connections (
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    sealed_token TEXT NOT NULL,
    member_urn TEXT NOT NULL,
    display_name TEXT,
    expires_at TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (account_id, provider)
  )`,
  `CREATE TABLE publishing_oauth_states (
    state_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    expires_at TEXT NOT NULL
  )`,
];
