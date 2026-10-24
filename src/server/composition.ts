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
import type { Measurements } from "./application/planning/ports";
import type { ResolveAccount } from "./application/content/ports";
import { CampaignService } from "./application/strategy/campaign-service";
import { PillarService } from "./application/strategy/pillar-service";
import { StrategyAnalysis } from "./application/strategy/strategy-analysis";
import { nowIso } from "./application/clock";
import {
  SqliteCampaignLinkStore,
  SqliteLinkTargets,
  SqlitePillarStore,
  campaignTable,
} from "./infrastructure/db/strategy-store";
import { SqliteDataLifecycle } from "./infrastructure/db/data-lifecycle";
import { sqlitePlanningStores } from "./infrastructure/db/planning-tables";
import {
  SqliteAuditLog,
  SqliteSessionRepository,
  SqliteUserRepository,
} from "./infrastructure/db/auth-repositories";
import { SqliteContentQueries } from "./infrastructure/db/content-queries";
import { SqliteContentStore } from "./infrastructure/db/content-store";
import { openDatabase } from "./infrastructure/db/database";
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
    resolveAccount,
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

function buildAi(core: Core, config: Config, facts: EvidenceFacts, factory: AiProviderFactory) {
  const { db, content, resolveAccount, jobs, audit, clock } = core;
  const aiStore = new SqliteAiStore(db);
  const box = new AesGcmSecretBox(
    resolveMasterKey(config.masterKey, join(config.dataDir, "master.key")),
  );
  const credentials = new CredentialService(aiStore, box, factory, audit, clock);
  const ai = new AiService({
    credentials,
    facts,
    content,
    resolveAccount,
    insights: aiStore,
    interactions: aiStore,
    jobs,
    audit,
    clock,
  });
  return { aiStore, credentials, ai };
}

function buildPlanning(core: Core, measurements: Measurements) {
  const { db, content, resolveAccount, clock } = core;
  const stores = sqlitePlanningStores(db);
  return new PlanningService({ stores, content, resolveAccount, measurements, clock });
}

function buildStrategy(core: Core, queries: SqliteContentQueries) {
  const { db, content, resolveAccount, clock } = core;
  const accounts = {
    find: resolveAccount,
    ensure: async (userId: string) => (await content.ensureAccount(userId, nowIso(clock))).id,
  };
  const campaigns = new CampaignService({
    campaigns: campaignTable(db),
    links: new SqliteCampaignLinkStore(db),
    targets: new SqliteLinkTargets(db),
    accounts,
    clock,
  });
  const pillars = new PillarService({ pillars: new SqlitePillarStore(db), accounts, clock });
  const analysis = new StrategyAnalysis({ data: queries, accounts, campaigns, pillars, clock });
  return { campaigns, pillars, analysis };
}

function buildAccount(core: Core) {
  return new AccountService(new SqliteDataLifecycle(core.db), core.auth, core.audit, core.clock);
}

/** The composition root: the only place that knows which adapter backs which port. */
export function buildContainer(config: Config, overrides: Overrides = {}) {
  const core = buildCore(config, overrides);
  const imports = buildImports(core);
  const queries = new SqliteContentQueries(core.db);
  const analytics = new AnalyticsService(core.content, queries, core.clock);
  const facts = new AnalyticsEvidenceFacts(core.content, queries, core.clock);
  const ai = buildAi(core, config, facts, overrides.aiFactory ?? new SdkProviderFactory());
  const handlers = {
    [IMPORT_JOB]: imports.run.bind(imports),
    [AI_JOB]: ai.ai.run.bind(ai.ai),
  };
  const worker = new JobWorker(core.jobs, handlers, core.clock, overrides.worker);
  const planning = buildPlanning(core, analytics);
  const account = buildAccount(core);
  const strategy = buildStrategy(core, queries);
  const api = createApi({
    ...core,
    ...ai,
    planning,
    account,
    strategy,
    imports,
    analytics,
    secureCookies: config.secureCookies,
    maxUploadBytes: config.maxUploadBytes,
  });
  return { ...core, ...ai, planning, account, strategy, imports, analytics, worker, api };
}
