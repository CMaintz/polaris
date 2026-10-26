import type { Db } from "./database";
import { ACTION_SCHEMA } from "./action-schema";
import { CORE_MIGRATIONS } from "./core-schema";
import { INTELLIGENCE_SCHEMA } from "./intelligence-schema";
import { KNOWLEDGE_SCHEMA } from "./knowledge-schema";
import { STRATEGY_MIGRATIONS } from "./strategy-schema";
import { MULTI_ACCOUNT_SCHEMA } from "./accounts-schema";
import { METRIC_REFRESH_SCHEMA } from "./refresh-schema";

/** A table rebuild must run with foreign keys off, or dropping the old table cascades. */
type Migration = string | { sql: string; foreignKeysOff: true };

const MULTI_ACCOUNT: Migration = { sql: MULTI_ACCOUNT_SCHEMA, foreignKeysOff: true };

// Append-only: each entry runs once, in order, tracked by PRAGMA user_version.
// Editing an applied migration does nothing on existing databases, so change schema
// by adding a new entry.
const MIGRATIONS: readonly Migration[] = [
  ...CORE_MIGRATIONS,
  ...STRATEGY_MIGRATIONS,
  KNOWLEDGE_SCHEMA.join(";\n"),
  INTELLIGENCE_SCHEMA.join(";\n"),
  ACTION_SCHEMA.join(";\n"),
  MULTI_ACCOUNT,
  METRIC_REFRESH_SCHEMA,
];

export const MULTI_ACCOUNT_VERSION = MIGRATIONS.indexOf(MULTI_ACCOUNT) + 1;
export const METRIC_REFRESH_VERSION = MIGRATIONS.indexOf(METRIC_REFRESH_SCHEMA) + 1;

export function migrate(db: Db, upTo = MIGRATIONS.length): void {
  const current = db.pragma("user_version", { simple: true }) as number;
  MIGRATIONS.slice(current, upTo).forEach((migration, offset) => {
    if (typeof migration === "string") return apply(db, migration, current + offset + 1);
    // The pragma is a no-op inside a transaction, so it is switched around it.
    db.pragma("foreign_keys = OFF");
    try {
      apply(db, migration.sql, current + offset + 1);
    } finally {
      db.pragma("foreign_keys = ON");
    }
  });
}

function apply(db: Db, sql: string, version: number): void {
  db.transaction(() => {
    db.exec(sql);
    const broken = db.pragma("foreign_key_check") as unknown[];
    if (broken.length > 0)
      throw new Error(`Migration ${version} broke ${broken.length} references`);
    db.pragma(`user_version = ${version}`);
  })();
}
