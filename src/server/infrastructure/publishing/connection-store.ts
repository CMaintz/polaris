import type { OAuthState, OAuthStateStore } from "../../application/action/provider-ports";
import type { Db } from "../db/database";

export interface StoredConnection {
  /** The access token sealed with SecretBox; never stored or returned in the clear. */
  sealedToken: string;
  memberUrn: string;
  displayName: string | null;
  expiresAt: string | null;
  /** What the member granted; empty for connections made before scopes were recorded. */
  scopes: string[];
}

type ConnectionRow = Omit<StoredConnection, "scopes"> & { scopes: string | null };

export interface ConnectionStore {
  get(accountId: string, provider: string): Promise<StoredConnection | null>;
  save(accountId: string, provider: string, c: StoredConnection, now: string): Promise<void>;
  delete(accountId: string, provider: string): Promise<void>;
}

export class SqliteConnectionStore implements ConnectionStore {
  constructor(private readonly db: Db) {}

  async get(accountId: string, provider: string) {
    const row = this.db
      .prepare(
        `SELECT sealed_token AS sealedToken, member_urn AS memberUrn, display_name AS displayName,
           expires_at AS expiresAt, granted_scopes AS scopes FROM publishing_connections
         WHERE account_id = ? AND provider = ?`,
      )
      .get(accountId, provider) as ConnectionRow | undefined;
    return row ? { ...row, scopes: row.scopes?.split(" ").filter(Boolean) ?? [] } : null;
  }

  async save(accountId: string, provider: string, c: StoredConnection, now: string) {
    this.db
      .prepare(
        `INSERT INTO publishing_connections (account_id, provider, sealed_token, member_urn,
           display_name, expires_at, created_at, granted_scopes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (account_id, provider) DO UPDATE SET sealed_token = excluded.sealed_token,
           member_urn = excluded.member_urn, display_name = excluded.display_name,
           expires_at = excluded.expires_at, created_at = excluded.created_at,
           granted_scopes = excluded.granted_scopes`,
      )
      .run(
        accountId,
        provider,
        c.sealedToken,
        c.memberUrn,
        c.displayName,
        c.expiresAt,
        now,
        c.scopes.join(" "),
      );
  }

  async delete(accountId: string, provider: string) {
    this.db
      .prepare("DELETE FROM publishing_connections WHERE account_id = ? AND provider = ?")
      .run(accountId, provider);
  }
}

export class SqliteOAuthStateStore implements OAuthStateStore {
  constructor(private readonly db: Db) {}

  async save(stateHash: string, s: OAuthState) {
    this.db
      .prepare(
        `INSERT INTO publishing_oauth_states (state_hash, user_id, account_id, provider, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(stateHash, s.userId, s.accountId, s.provider, s.expiresAt);
  }

  async take(stateHash: string) {
    const row = this.db
      .prepare(
        `DELETE FROM publishing_oauth_states WHERE state_hash = ?
         RETURNING user_id AS userId, account_id AS accountId, provider, expires_at AS expiresAt`,
      )
      .get(stateHash) as OAuthState | undefined;
    return row ?? null;
  }
}
