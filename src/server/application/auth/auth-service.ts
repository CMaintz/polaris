import { createHash, randomBytes, randomUUID } from "node:crypto";
import { type Clock, nowIso } from "../clock";
import { ConflictError, ForbiddenError, UnauthorizedError, ValidationError } from "../errors";
import type { AuditLog, PasswordHasher, SessionRepository, User, UserRepository } from "./ports";

const SESSION_DAYS = 30;
const MIN_PASSWORD_LENGTH = 10;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface AuthDeps {
  users: UserRepository;
  sessions: SessionRepository;
  hasher: PasswordHasher;
  audit: AuditLog;
  clock: Clock;
  allowSignup: boolean;
}

export interface SignedIn {
  user: User;
  token: string;
  expiresAt: string;
}

/** Sessions are stored by hash so a leaked database cannot be replayed as live cookies. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class AuthService {
  private dummyHash: Promise<string> | null = null;

  constructor(private readonly deps: AuthDeps) {}

  async register(email: string, password: string): Promise<SignedIn> {
    const normalized = validateCredentials(email, password);
    // The first account is always allowed, otherwise a fresh install could never be used.
    if (!this.deps.allowSignup && (await this.deps.users.count()) > 0) {
      throw new ForbiddenError("Sign-up is closed on this instance");
    }
    if (await this.deps.users.findByEmail(normalized)) {
      throw new ConflictError("An account with this email already exists");
    }
    const user: User = { id: randomUUID(), email: normalized, createdAt: nowIso(this.deps.clock) };
    await this.deps.users.create({ ...user, passwordHash: await this.deps.hasher.hash(password) });
    await this.deps.audit.record(user.id, "user.registered");
    return this.startSession(user);
  }

  async login(email: string, password: string): Promise<SignedIn> {
    const found = await this.deps.users.findByEmail(email.trim().toLowerCase());
    // Verify against a throwaway hash when the email is unknown: skipping the hash would
    // answer measurably faster and reveal which emails have accounts.
    this.dummyHash ??= this.deps.hasher.hash(randomBytes(16).toString("hex"));
    const stored = found?.passwordHash ?? (await this.dummyHash);
    const matches = await this.deps.hasher.verify(password, stored);
    const valid = found !== null && matches;
    if (!found || !valid) {
      await this.deps.audit.record(found?.id ?? null, "user.login_failed");
      throw new UnauthorizedError("Email or password is incorrect");
    }
    await this.deps.audit.record(found.id, "user.login");
    return this.startSession({ id: found.id, email: found.email, createdAt: found.createdAt });
  }

  async authenticate(token: string | undefined): Promise<User | null> {
    if (!token) return null;
    const session = await this.deps.sessions.find(hashToken(token));
    if (!session) return null;
    if (session.expiresAt <= nowIso(this.deps.clock)) {
      await this.deps.sessions.delete(session.tokenHash);
      return null;
    }
    return this.deps.users.findById(session.userId);
  }

  async confirmPassword(userId: string, password: string): Promise<void> {
    const user = await this.deps.users.findById(userId);
    const stored = user ? await this.deps.users.findByEmail(user.email) : null;
    if (!stored || !(await this.deps.hasher.verify(password, stored.passwordHash))) {
      await this.deps.audit.record(userId, "user.confirm_failed");
      throw new UnauthorizedError("The password is incorrect");
    }
  }

  async logout(token: string): Promise<void> {
    await this.deps.sessions.delete(hashToken(token));
  }

  private async startSession(user: User): Promise<SignedIn> {
    const token = randomBytes(32).toString("base64url");
    const now = this.deps.clock();
    const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86_400_000).toISOString();
    await this.deps.sessions.create({
      tokenHash: hashToken(token),
      userId: user.id,
      createdAt: now.toISOString(),
      expiresAt,
    });
    return { user, token, expiresAt };
  }
}

function validateCredentials(email: string, password: string): string {
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(normalized)) throw new ValidationError("Enter a valid email address");
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  return normalized;
}
