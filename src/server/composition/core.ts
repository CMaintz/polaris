import type { AiProviderFactory } from "../application/ai/ports";
import type { FeedFetcher, WebResearchFactory } from "../application/intelligence/ports";
import { AuthService } from "../application/auth/auth-service";
import type { PasswordHasher } from "../application/auth/ports";
import { type Clock, systemClock } from "../application/clock";
import type { ResolveAccount } from "../application/content/ports";
import type { WorkerOptions } from "../application/jobs/job-worker";
import type { Config } from "../config";
import { ScryptHasher } from "../infrastructure/crypto/password";
import {
  SqliteAuditLog,
  SqliteSessionRepository,
  SqliteUserRepository,
} from "../infrastructure/db/auth-repositories";
import { SqliteContentQueries } from "../infrastructure/db/content-queries";
import { SqliteContentStore } from "../infrastructure/db/content-store";
import { openDatabase } from "../infrastructure/db/database";
import { SqliteJobRepository } from "../infrastructure/db/job-repository";

export interface Overrides {
  clock?: Clock;
  hasher?: PasswordHasher;
  worker?: Partial<WorkerOptions>;
  aiFactory?: AiProviderFactory;
  webResearch?: WebResearchFactory;
  feedFetcher?: FeedFetcher;
}

export function buildCore(config: Config, overrides: Overrides) {
  const clock = overrides.clock ?? systemClock;
  const db = openDatabase(config.dbPath);
  const users = new SqliteUserRepository(db);
  const audit = new SqliteAuditLog(db, clock);
  const auth = new AuthService({
    users,
    sessions: new SqliteSessionRepository(db),
    hasher: overrides.hasher ?? new ScryptHasher(),
    audit,
    clock,
    allowSignup: config.allowSignup,
  });
  const content = new SqliteContentStore(db);
  const resolveAccount: ResolveAccount = async (userId) =>
    (await content.findAccount(userId))?.id ?? null;
  return {
    clock,
    db,
    users,
    audit,
    auth,
    jobs: new SqliteJobRepository(db),
    content,
    queries: new SqliteContentQueries(db),
    resolveAccount,
  };
}

export type Core = ReturnType<typeof buildCore>;
