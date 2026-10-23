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
import { IMPORT_JOB, ImportService } from "./application/imports/import-service";
import { SqliteContentStore } from "./infrastructure/db/content-store";
import { SqliteImportFileStore } from "./infrastructure/db/import-file-store";
import { buildDemoBundle } from "./infrastructure/demo/demo-provider";
import { LinkedInAnalyticsExportProvider } from "./infrastructure/linkedin/analytics-export-provider";
import { LinkedInDataExportProvider } from "./infrastructure/linkedin/data-export-provider";

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
  const content = new SqliteContentStore(db);
  const imports = new ImportService({
    providers: [new LinkedInDataExportProvider(), new LinkedInAnalyticsExportProvider()],
    demo: (today) => buildDemoBundle(today),
    files: new SqliteImportFileStore(db),
    content,
    jobs,
    audit,
    clock,
  });
  const worker = new JobWorker(
    jobs,
    { [IMPORT_JOB]: (job, context) => imports.run(job, context) },
    clock,
    overrides.worker,
  );
  const api = createApi({
    auth,
    jobs,
    imports,
    content,
    secureCookies: config.secureCookies,
    maxUploadBytes: config.maxUploadBytes,
  });
  return { db, clock, users, audit, jobs, auth, content, imports, worker, api };
}

export type Container = ReturnType<typeof buildContainer>;
