import { createApi } from "../api/app";
import { AI_JOB } from "../application/ai/ai-service";
import { AnalyticsService } from "../application/analytics/analytics-service";
import { AnalyticsEvidenceFacts } from "../application/analytics/evidence-facts";
import { ComparisonService } from "../application/analytics/comparison-service";
import { IMPORT_JOB, type ImportResult } from "../application/imports/import-service";
import type { Job, JobContext, JobHandler } from "../application/jobs/ports";
import { JobWorker } from "../application/jobs/job-worker";
import type { Config } from "../config";
import { SdkProviderFactory } from "../infrastructure/ai/provider-factory";
import { buildAction } from "./action";
import { buildAiKeys, buildAiService } from "./ai";
import { type Overrides, buildCore } from "./core";
import { buildImports } from "./imports";
import { buildIntelligence } from "./intelligence";
import { buildKnowledge } from "./knowledge";
import { buildAccount, buildAccounts, buildPlanning } from "./planning";
import { buildStrategy } from "./strategy";

export type { Overrides } from "./core";

// Meaning search needs embeddings of the new posts; keyword search syncs on its own.
function reindexAfter(
  importJob: (job: Job, context: JobContext) => Promise<ImportResult>,
  indexer: { start(userId: string, accountId: string): Promise<unknown> },
): JobHandler {
  return async (job, context) => {
    const result = await importJob(job, context);
    await indexer.start(job.userId, result.accountId);
    return result;
  };
}

/** The composition root: the only place that knows which adapter backs which port. */
export function buildContainer(config: Config, overrides: Overrides = {}) {
  const core = buildCore(config, overrides);
  const imports = buildImports(core);
  const analytics = new AnalyticsService(core.content, core.queries, core.clock);
  const facts = new AnalyticsEvidenceFacts(core.content, core.queries, core.clock);
  const keys = buildAiKeys(core, config, overrides.aiFactory ?? new SdkProviderFactory());
  const knowledge = buildKnowledge(core, keys, facts);
  const ai = buildAiService(core, keys, { facts, related: knowledge.related });
  const planning = buildPlanning(core, analytics);
  const action = buildAction(core, keys, {
    planning: planning.service,
    stores: planning.stores,
    facts,
    linkedin: config.linkedin,
  });
  const intelligence = buildIntelligence(core, keys, {
    allowHttpFeeds: config.feedsAllowHttp,
    webResearch: overrides.webResearch,
    fetcher: overrides.feedFetcher,
  });
  const handlers = {
    [IMPORT_JOB]: reindexAfter(imports.run.bind(imports), knowledge.indexer),
    [AI_JOB]: ai.run.bind(ai),
    ...knowledge.handlers,
    ...intelligence.handlers,
    ...action.handlers,
  };
  const worker = new JobWorker(core.jobs, handlers, core.clock, {
    tick: async (now) => {
      await intelligence.scheduler.tick(now);
      await action.publishing.enqueueDue(now.toISOString());
    },
    ...overrides.worker,
  });
  const account = buildAccount(core);
  const strategy = buildStrategy(core);
  const services = {
    ...core,
    ...keys,
    ai,
    planning: planning.service,
    unifiedPlan: planning.unified,
    action,
    account,
    accounts: buildAccounts(core),
    strategy,
    knowledge,
    intelligence,
    imports,
    analytics,
    comparison: new ComparisonService(core.accountStore, core.queries, core.clock),
  };
  const api = createApi({
    ...services,
    secureCookies: config.secureCookies,
    maxUploadBytes: config.maxUploadBytes,
  });
  return { ...services, worker, api };
}
