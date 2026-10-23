import { randomUUID } from "node:crypto";
import type {
  AuditLog,
  Session,
  SessionRepository,
  User,
  UserRepository,
  UserWithSecret,
} from "../../application/auth/ports";
import type { Clock } from "../../application/clock";
import { type Db, toJson } from "./database";

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
}

function toUser(row: UserRow): UserWithSecret {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
  };
}

export class SqliteUserRepository implements UserRepository {
  constructor(private readonly db: Db) {}

  async count(): Promise<number> {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
  }

  async create(user: UserWithSecret): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO users (id, email, password_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(user.id, user.email, user.passwordHash, user.createdAt, user.createdAt);
  }

  async findByEmail(email: string): Promise<UserWithSecret | null> {
    const row = this.db.prepare("SELECT * FROM users WHERE email = ?").get(email) as
      UserRow | undefined;
    return row ? toUser(row) : null;
  }

  async findById(id: string): Promise<User | null> {
    const row = this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
    return row ? { id: row.id, email: row.email, createdAt: row.created_at } : null;
  }

  async delete(id: string): Promise<void> {
    this.db.prepare("DELETE FROM users WHERE id = ?").run(id);
  }
}

export class SqliteSessionRepository implements SessionRepository {
  constructor(private readonly db: Db) {}

  async create(session: Session & { createdAt: string }): Promise<void> {
    this.db
      .prepare(
        "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
      )
      .run(session.tokenHash, session.userId, session.createdAt, session.expiresAt);
  }

  async find(tokenHash: string): Promise<Session | null> {
    const row = this.db
      .prepare("SELECT token_hash, user_id, expires_at FROM sessions WHERE token_hash = ?")
      .get(tokenHash) as { token_hash: string; user_id: string; expires_at: string } | undefined;
    return row
      ? { tokenHash: row.token_hash, userId: row.user_id, expiresAt: row.expires_at }
      : null;
  }

  async delete(tokenHash: string): Promise<void> {
    this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
  }
}

/** Security-relevant events. Callers must never put secrets in `detail`. */
export class SqliteAuditLog implements AuditLog {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
  ) {}

  async record(userId: string | null, action: string, detail: Record<string, unknown> = {}) {
    this.db
      .prepare(
        "INSERT INTO audit_log (id, user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(randomUUID(), userId, action, toJson(detail), this.clock().toISOString());
  }
}
