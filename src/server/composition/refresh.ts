import type { JobHandler } from "../application/jobs/ports";
import { METRIC_REFRESH_JOB } from "../application/refresh/jobs";
import { MetricRefreshService } from "../application/refresh/refresh-service";
import { SqliteRefreshTargets } from "../infrastructure/db/refresh-targets";
import { LinkedInAnalyticsSource } from "../infrastructure/linkedin-api/analytics-source";
import { SqliteConnectionStore } from "../infrastructure/publishing/connection-store";
import type { LinkedInAppConfig } from "../infrastructure/publishing/linkedin-oauth";
import type { AiKeyParts } from "./ai";
import type { Core } from "./core";

const DEFAULT_RECENT_POST_DAYS = 30;

// A typo in the env var must not turn into a NaN date window.
const recentPostDays = (days: number | undefined) =>
  days !== undefined && Number.isInteger(days) && days > 0 ? days : DEFAULT_RECENT_POST_DAYS;

export function buildRefresh(core: Core, ai: AiKeyParts, linkedin: LinkedInAppConfig | null) {
  const { db, content, accountStore, jobs, clock } = core;
  const connections = new SqliteConnectionStore(db);
  const service = new MetricRefreshService({
    analytics: new LinkedInAnalyticsSource(linkedin, connections, ai.box, fetch, clock),
    targets: new SqliteRefreshTargets(db),
    content,
    accounts: accountStore,
    jobs,
    clock,
    recentPostDays: recentPostDays(linkedin?.refreshPostDays),
  });
  const handlers: Record<string, JobHandler> = {
    [METRIC_REFRESH_JOB]: (job) => service.run(job),
  };
  return { service, handlers };
}
