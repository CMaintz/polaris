// SQLite cannot drop the old UNIQUE (user_id), so the table is rebuilt. Child tables name
// "accounts" in their foreign keys, so after the rename they point at the new table; the
// rebuild must run with foreign keys off, or dropping the old table cascades into them.
export const MULTI_ACCOUNT_SCHEMA = `
  CREATE TABLE accounts_new (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform TEXT NOT NULL DEFAULT 'linkedin' CHECK (platform IN ('linkedin', 'other')),
    label TEXT NOT NULL DEFAULT 'LinkedIn',
    display_name TEXT,
    headline TEXT,
    profile_url TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  INSERT INTO accounts_new (id, user_id, display_name, headline, profile_url, created_at,
    updated_at)
  SELECT id, user_id, display_name, headline, profile_url, created_at, updated_at FROM accounts;
  DROP TABLE accounts;
  ALTER TABLE accounts_new RENAME TO accounts;
  CREATE INDEX accounts_user ON accounts(user_id, created_at);

  ALTER TABLE users ADD COLUMN active_account_id TEXT
    REFERENCES accounts(id) ON DELETE SET NULL;
`;
