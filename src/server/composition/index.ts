import { createApi } from "../api/app";
import { AI_JOB } from "../application/ai/ai-service";
import { AnalyticsService } from "../application/analytics/analytics-service";
import { AnalyticsEvidenceFacts } from "../application/analytics/evidence-facts";
import { IMPORT_JOB } from "../application/imports/import-service";
import type { JobHandler } from "../application/jobs/ports";
import { JobWorker } from "../application/jobs/job-worker";
import type { Config } from "../config";
import { SdkProviderFactory } from "../infrastructure/ai/provider-factory";
import { buildAiKeys, buildAiService } from "./ai";
import { type Core, type Overrides, buildCore } from "./core";
import { buildImports } from "./imports";
import { buildKnowledge } from "./knowledge";
import { buildAccount, buildPlanning } from "./planning";
import { buildStrategy } from "./strategy";

export type { Overrides } from "./core";

// Meaning search needs embeddings of the new posts; keyword search syncs on its own.
function reindexAfter(
  importJob: JobHandler,
  core: Core,
  indexer: { start(userId: string, accountId: string): Promise<unknown> },
): JobHandler {
  return async (job, context) => {
    const result = await importJob(job, context);
    const accountId = await core.resolveAccount(job.userId);
    if (accountId) await indexer.start(job.userId, accountId);
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
  const handlers = {
    [IMPORT_JOB]: reindexAfter(imports.run.bind(imports), core, knowledge.indexer),
    [AI_JOB]: ai.run.bind(ai),
    ...knowledge.handlers,
  };
  const worker = new JobWorker(core.jobs, handlers, core.clock, overrides.worker);
  const planning = buildPlanning(core, analytics);
  const account = buildAccount(core);
  const strategy = buildStrategy(core);
  const services = {
    ...core,
    ...keys,
    ai,
    planning,
    account,
    strategy,
    knowledge,
    imports,
    analytics,
  };
  const api = createApi({
    ...services,
    secureCookies: config.secureCookies,
    maxUploadBytes: config.maxUploadBytes,
  });
  return { ...services, worker, api };
}
