import { EMPTY_METRICS } from "../domain/metrics";
import type { PostRecord } from "../domain/posts";

interface PublishedPost {
  impressions?: number | null;
  topics?: string[];
  /** From the data archive, which lists every post, rather than a top-posts export. */
  fullyListed?: boolean;
}

let next = 0;

export function publishedPost(day: string, options: PublishedPost = {}): PostRecord {
  const { impressions = null, topics = [], fullyListed = true } = options;
  next += 1;
  return {
    id: `p${next}`,
    externalId: `x${next}`,
    dataset: "linkedin",
    url: null,
    text: null,
    publishedAt: `${day}T09:00:00.000Z`,
    timeKnown: true,
    contentType: "text",
    providers: [fullyListed ? "linkedin-data-export" : "linkedin-analytics-export"],
    topics,
    metrics: { ...EMPTY_METRICS, impressions },
    metricsObservedOn: null,
    metricsPeriod: null,
    metricsProvider: null,
  };
}
