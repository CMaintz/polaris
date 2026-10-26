import type { ImportedPostMetrics } from "../../domain/content";
import { EMPTY_METRICS, type PostMetrics } from "../../domain/metrics";
import type { LinkedInRestClient } from "./client";
import { readPostStats } from "./responses";
import { entityParam } from "./restli";

const POST_STATS = "memberCreatorPostAnalytics";

/** LinkedIn's metric for each figure Polaris keeps; LinkedIn answers one metric per request. */
const METRICS = {
  impressions: "IMPRESSION",
  reactions: "REACTION",
  comments: "COMMENT",
  reposts: "RESHARE",
} as const;

async function lifetimeCount(
  client: LinkedInRestClient,
  urn: string,
  metric: string,
): Promise<number | null> {
  const body = await client.get(POST_STATS, {
    q: "entity",
    entity: entityParam(urn),
    queryType: metric,
    aggregation: "TOTAL",
  });
  return readPostStats(body).find((s) => s.metricType === metric)?.count ?? null;
}

/**
 * A post's lifetime totals, observed on `observedOn`. A metric LinkedIn leaves out stays
 * null. Clicks are not asked for and engagements are left for the domain to sum (docs/02).
 */
export async function readPostFigures(
  client: LinkedInRestClient,
  urn: string,
  observedOn: string,
): Promise<ImportedPostMetrics> {
  const metrics: PostMetrics = { ...EMPTY_METRICS };
  for (const [field, metric] of Object.entries(METRICS)) {
    metrics[field as keyof typeof METRICS] = await lifetimeCount(client, urn, metric);
  }
  return { externalId: urn, observedOn, metrics, period: null };
}
