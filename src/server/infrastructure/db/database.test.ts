import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase, openReadOnlyDatabase } from "./database";
import { SCHEMA_VERSION, migrate } from "./migrations";

let dir = "";
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function freshDir() {
  dir = mkdtempSync(join(tmpdir(), "polaris-db-"));
  return dir;
}

describe("read-only database", () => {
  it("rejects every write", () => {
    const path = join(freshDir(), "polaris.db");
    openDatabase(path).close();
    const db = openReadOnlyDatabase(path);
    expect(() => db.prepare("DELETE FROM users").run()).toThrow(/readonly/);
    db.close();
  });

  it("never creates a database that is not there", () => {
    const path = join(freshDir(), "polaris.db");
    expect(() => openReadOnlyDatabase(path)).toThrow();
    expect(existsSync(path)).toBe(false);
  });

  // A read-only handle cannot migrate, and queries against an older schema fail obscurely.
  it("refuses a database whose schema is behind the code", () => {
    const path = join(freshDir(), "polaris.db");
    const old = new Database(path);
    migrate(old, SCHEMA_VERSION - 1);
    old.close();
    expect(() => openReadOnlyDatabase(path)).toThrow(/start the web app once/);
  });
});
