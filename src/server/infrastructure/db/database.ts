import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { SCHEMA_VERSION, migrate } from "./migrations";

export type Db = Database.Database;

export function openDatabase(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

/**
 * Opens an existing database for reading only, so it can run beside the web app and can
 * never change it. Throws when the file is missing or its schema is not the current one,
 * since a read-only handle cannot migrate.
 */
export function openReadOnlyDatabase(path: string): Db {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  const version = db.pragma("user_version", { simple: true }) as number;
  if (version !== SCHEMA_VERSION) {
    db.close();
    throw new Error(
      `${path} has schema version ${version}, expected ${SCHEMA_VERSION}; start the web app once to migrate it`,
    );
  }
  return db;
}

export function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function fromJson<T>(text: string | null): T | null {
  return text === null ? null : (JSON.parse(text) as T);
}
