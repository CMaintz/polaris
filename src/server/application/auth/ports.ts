export interface User {
  id: string;
  email: string;
  createdAt: string;
}

export interface UserWithSecret extends User {
  passwordHash: string;
}

export interface UserRepository {
  count(): Promise<number>;
  /** Every user id, oldest first. */
  ids(): Promise<string[]>;
  create(user: UserWithSecret): Promise<void>;
  findByEmail(email: string): Promise<UserWithSecret | null>;
  findById(id: string): Promise<User | null>;
  delete(id: string): Promise<void>;
}

export interface Session {
  tokenHash: string;
  userId: string;
  expiresAt: string;
}

export interface SessionRepository {
  create(session: Session & { createdAt: string }): Promise<void>;
  find(tokenHash: string): Promise<Session | null>;
  delete(tokenHash: string): Promise<void>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, stored: string): Promise<boolean>;
}

export interface AuditLog {
  record(userId: string | null, action: string, detail?: Record<string, unknown>): Promise<void>;
}
