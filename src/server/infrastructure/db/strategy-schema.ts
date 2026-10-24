// A link table per target kind, so each carries a real foreign key and deleting a post (or
// the demo dataset), plan item or goal drops its links instead of leaving dangling ids.
export const STRATEGY_MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE campaigns (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    objective TEXT NOT NULL DEFAULT '',
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('planned', 'active', 'done', 'cancelled')),
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX campaigns_account ON campaigns(account_id, start_date);

  CREATE TABLE campaign_posts (
    campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    PRIMARY KEY (campaign_id, post_id)
  );

  CREATE TABLE campaign_plan_items (
    campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    plan_item_id TEXT NOT NULL REFERENCES plan_items(id) ON DELETE CASCADE,
    PRIMARY KEY (campaign_id, plan_item_id)
  );

  CREATE TABLE campaign_goals (
    campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    PRIMARY KEY (campaign_id, goal_id)
  );

  CREATE TABLE content_pillars (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    topics TEXT NOT NULL DEFAULT '[]',
    target_share REAL NOT NULL CHECK (target_share >= 0 AND target_share <= 1),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX content_pillars_account ON content_pillars(account_id);
  `,
];
