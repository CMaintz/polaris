import { createApi } from "./api/app";
import { AuthService } from "./application/auth/auth-service";
import type { PasswordHasher } from "./application/auth/ports";
import { type Clock, systemClock } from "./application/clock";
import { JobWorker, type WorkerOptions } from "./application/jobs/job-worker";
import type { Config } from "./config";
import { ScryptHasher } from "./infrastructure/crypto/password";
import {
  SqliteAuditLog,
  SqliteSessionRepository,
  SqliteUserRepository,
} from "./infrastructure/db/auth-repositories";
import { openDatabase } from "./infrastructure/db/database";
import { SqliteJobRepository } from "./infrastructure/db/job-repository";

export interface Overrides {
  clock?: Clock;
  hasher?: PasswordHasher;
  worker?: Partial<WorkerOptions>;
}

/** The composition root: the only place that knows which adapter backs which port. */
export function buildContainer(config: Config, overrides: Overrides = {}) {
  const clock = overrides.clock ?? systemClock;
  const db = openDatabase(config.dbPath);
  const users = new SqliteUserRepository(db);
  const audit = new SqliteAuditLog(db, clock);
  const jobs = new SqliteJobRepository(db);
  const auth = new AuthService({
    users,
    sessions: new SqliteSessionRepository(db),
    hasher: overrides.hasher ?? new ScryptHasher(),
    audit,
    clock,
    allowSignup: config.allowSignup,
  });
  const worker = new JobWorker(jobs, {}, clock, overrides.worker);
  const api = createApi({ auth, jobs, secureCookies: config.secureCookies });
  return { db, clock, users, audit, jobs, auth, worker, api };
}

export type Container = ReturnType<typeof buildContainer>;
