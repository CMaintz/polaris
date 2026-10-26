import { join } from "node:path";
import { createApi } from "./api/app";
import { AI_JOB, AiService } from "./application/ai/ai-service";
import { CredentialService } from "./application/ai/credentials";
import type { AiProviderFactory } from "./application/ai/ports";
import { AnalyticsService } from "./application/analytics/analytics-service";
import { AnalyticsEvidenceFacts, type EvidenceFacts } from "./application/analytics/evidence-facts";
import { AuthService } from "./application/auth/auth-service";
import type { PasswordHasher } from "./application/auth/ports";
import { type Clock, systemClock } from "./application/clock";
import { IMPORT_JOB, ImportService } from "./application/imports/import-service";
import { JobWorker, type WorkerOptions } from "./application/jobs/job-worker";
import type { Config } from "./config";
import { SdkProviderFactory } from "./infrastructure/ai/provider-factory";
import { ScryptHasher } from "./infrastructure/crypto/password";
import { AesGcmSecretBox, resolveMasterKey } from "./infrastructure/crypto/secret-box";
import { SqliteAiStore } from "./infrastructure/db/ai-store";
import { AccountService } from "./application/account/account-service";
import { PlanningService } from "./application/planning/planning-service";
import type { Experiment, Goal, PlanItem } from "./application/planning/ports";
import { SqliteDataLifecycle } from "./infrastructure/db/data-lifecycle";
import { SqliteRecordTable } from "./infrastructure/db/record-table";
import {
  SqliteAuditLog,
  SqliteSessionRepository,
  SqliteUserRepository,
} from "./infrastructure/db/auth-repositories";
import { SqliteContentQueries } from "./infrastructure/db/content-queries";
import { SqliteContentStore } from "./infrastructure/db/content-store";
import { type Db, openDatabase } from "./infrastructure/db/database";
import { SqliteImportFileStore } from "./infrastructure/db/import-file-store";
import { SqliteJobRepository } from "./infrastructure/db/job-repository";
import { buildDemoBundle } from "./infrastructure/demo/demo-provider";
import { LinkedInAnalyticsExportProvider } from "./infrastructure/linkedin/analytics-export-provider";
import { LinkedInDataExportProvider } from "./infrastructure/linkedin/data-export-provider";

export interface Overrides {
  clock?: Clock;
  hasher?: PasswordHasher;
  worker?: Partial<WorkerOptions>;
  aiFactory?: AiProviderFactory;
}

function buildCore(config: Config, overrides: Overrides) {
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
  return {
    clock,
    db,
    users,
    audit,
    auth,
    jobs: new SqliteJobRepository(db),
    content: new SqliteContentStore(db),
  };
}

type Core = ReturnType<typeof buildCore>;

function buildImports({ db, content, jobs, audit, clock }: Core) {
  return new ImportService({
    providers: [new LinkedInDataExportProvider(), new LinkedInAnalyticsExportProvider()],
    demo: (today) => buildDemoBundle(today),
    files: new SqliteImportFileStore(db),
    content,
    jobs,
    audit,
    clock,
  });
}

function buildAi(
  core: Core,
  db: Db,
  config: Config,
  facts: EvidenceFacts,
  factory: AiProviderFactory,
) {
  const { content, jobs, audit, clock } = core;
  const aiStore = new SqliteAiStore(db);
  const box = new AesGcmSecretBox(
    resolveMasterKey(config.masterKey, join(config.dataDir, "master.key")),
  );
  const credentials = new CredentialService(aiStore, box, factory, audit, clock);
  const ai = new AiService({ credentials, facts, content, store: aiStore, jobs, audit, clock });
  return { aiStore, credentials, ai };
}

function buildPlanning(core: Core, analytics: AnalyticsService) {
  const { db } = core;
  const goals = new SqliteRecordTable<Goal>(
    db,
    "goals",
    ["name", "metric", "target", "startDate", "endDate", "status", "notes"],
    "end_date, created_at",
  );
  const experiments = new SqliteRecordTable<Experiment>(
    db,
    "experiments",
    [
      "goalId",
      "name",
      "hypothesis",
      "variable",
      "metric",
      "baseline",
      "startDate",
      "endDate",
      "status",
      "result",
      "conclusion",
      "followUp",
    ],
    "start_date DESC, created_at",
  );
  const plan = new SqliteRecordTable<PlanItem>(
    db,
    "plan_items",
    ["title", "concept", "targetTopic", "plannedDate", "status", "draft", "postId"],
    "planned_date IS NULL, planned_date, created_at",
  );
  const planning = new PlanningService(
    { goals, experiments, plan },
    core.content,
    analytics,
    core.clock,
  );
  const account = new AccountService(
    new SqliteDataLifecycle(db),
    core.auth,
    core.audit,
    core.clock,
  );
  return { planning, account };
}

/** The composition root: the only place that knows which adapter backs which port. */
export function buildContainer(config: Config, overrides: Overrides = {}) {
  const core = buildCore(config, overrides);
  const imports = buildImports(core);
  const queries = new SqliteContentQueries(core.db);
  const analytics = new AnalyticsService(core.content, queries, core.clock);
  const facts = new AnalyticsEvidenceFacts(core.content, queries, core.clock);
  const ai = buildAi(core, core.db, config, facts, overrides.aiFactory ?? new SdkProviderFactory());
  const handlers = {
    [IMPORT_JOB]: imports.run.bind(imports),
    [AI_JOB]: ai.ai.run.bind(ai.ai),
  };
  const worker = new JobWorker(core.jobs, handlers, core.clock, overrides.worker);
  const planning = buildPlanning(core, analytics);
  const api = createApi({
    ...core,
    ...ai,
    ...planning,
    imports,
    analytics,
    secureCookies: config.secureCookies,
    maxUploadBytes: config.maxUploadBytes,
  });
  return { ...core, ...ai, ...planning, imports, analytics, worker, api };
}
