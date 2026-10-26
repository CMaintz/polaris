import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { METRIC_REFRESH_VERSION, MULTI_ACCOUNT_VERSION, migrate } from "./migrations";

const NOW = "2026-03-15T12:00:00Z";

function databaseBeforeMultiAccount() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db, MULTI_ACCOUNT_VERSION - 1);
  db.prepare(
    "INSERT INTO users (id, email, password_hash, created_at, updated_at) VALUES ('u1', 'a@b.c', 'x', ?, ?)",
  ).run(NOW, NOW);
  db.prepare(
    "INSERT INTO accounts (id, user_id, display_name, created_at, updated_at) VALUES ('a1', 'u1', 'Ada', ?, ?)",
  ).run(NOW, NOW);
  db.prepare(
    `INSERT INTO posts (id, account_id, dataset, external_id, content_type, first_imported_at,
     last_imported_at) VALUES ('p1', 'a1', 'linkedin', 'x1', 'text', ?, ?)`,
  ).run(NOW, NOW);
  db.prepare(
    `INSERT INTO goals (id, account_id, name, metric, target, start_date, end_date, status,
     created_at, updated_at) VALUES ('g1', 'a1', 'Grow', 'followers', 10, '2026-01-01',
     '2026-02-01', 'active', ?, ?)`,
  ).run(NOW, NOW);
  return db;
}

describe("multi-account migration", () => {
  // Rebuilding the accounts table with foreign keys on would cascade-delete every child row.
  it("keeps every existing account's data and marks the account as LinkedIn", () => {
    const db = databaseBeforeMultiAccount();
    migrate(db);
    expect(db.prepare("SELECT platform, label, display_name FROM accounts").all()).toEqual([
      { platform: "linkedin", label: "LinkedIn", display_name: "Ada" },
    ]);
    expect(db.prepare("SELECT account_id FROM posts").all()).toEqual([{ account_id: "a1" }]);
    expect(db.prepare("SELECT account_id FROM goals").all()).toEqual([{ account_id: "a1" }]);
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("allows a second account for the same user and still cascades deletes", () => {
    const db = databaseBeforeMultiAccount();
    migrate(db);
    db.prepare(
      `INSERT INTO accounts (id, user_id, platform, label, created_at, updated_at)
       VALUES ('a2', 'u1', 'other', 'Blog', ?, ?)`,
    ).run(NOW, NOW);
    db.prepare("UPDATE users SET active_account_id = 'a2' WHERE id = 'u1'").run();
    db.prepare("DELETE FROM accounts WHERE id = 'a2'").run();
    expect(db.prepare("SELECT active_account_id FROM users").get()).toEqual({
      active_account_id: null,
    });
    db.prepare("DELETE FROM accounts WHERE id = 'a1'").run();
    expect(db.prepare("SELECT COUNT(*) AS n FROM posts").get()).toEqual({ n: 0 });
  });
});

describe("metric refresh migration", () => {
  // SQLite cannot widen a CHECK in place, so the schedules table is rebuilt; a rebuild that
  // forgets to copy would silently drop every schedule the user had.
  it("keeps existing schedules and accepts metric refresh schedules", () => {
    const db = databaseBeforeMultiAccount();
    migrate(db, METRIC_REFRESH_VERSION - 1);
    db.prepare(
      `INSERT INTO schedules (id, account_id, kind, cadence, next_run_at, created_at, updated_at)
       VALUES ('s1', 'a1', 'feed_refresh', 'daily', ?, ?, ?)`,
    ).run(NOW, NOW, NOW);
    migrate(db);
    db.prepare(
      `INSERT INTO schedules (id, account_id, kind, cadence, next_run_at, created_at, updated_at)
       VALUES ('s2', 'a1', 'metric_refresh', 'daily', ?, ?, ?)`,
    ).run(NOW, NOW, NOW);
    expect(db.prepare("SELECT id, kind FROM schedules ORDER BY id").all()).toEqual([
      { id: "s1", kind: "feed_refresh" },
      { id: "s2", kind: "metric_refresh" },
    ]);
    db.prepare("DELETE FROM accounts WHERE id = 'a1'").run();
    expect(db.prepare("SELECT COUNT(*) AS n FROM schedules").get()).toEqual({ n: 0 });
  });
});
