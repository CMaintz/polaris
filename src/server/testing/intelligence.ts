import { randomUUID } from "node:crypto";
import type { Job } from "../application/jobs/ports";
import { type Db, openDatabase } from "../infrastructure/db/database";
import { EMPTY_METRICS } from "../domain/metrics";
import type { PostRecord } from "../domain/posts";
import type { AiProvider, StructuredRequest, StructuredResult } from "../application/ai/ports";
import type {
  WebResearchProvider,
  WebResearchRequest,
  WebResearchResult,
} from "../application/intelligence/ports";

export function addAccount(db: Db, now = "2026-03-15T12:00:00.000Z") {
  const userId = randomUUID();
  const accountId = randomUUID();
  db.prepare(
    "INSERT INTO users (id, email, password_hash, created_at, updated_at) VALUES (?, ?, 'x', ?, ?)",
  ).run(userId, `${userId}@example.com`, now, now);
  db.prepare("INSERT INTO accounts (id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?)").run(
    accountId,
    userId,
    now,
    now,
  );
  return { userId, accountId };
}

export const intelligenceDb = (): Db => openDatabase(":memory:");

export function fakePost(
  id: string,
  options: { topics?: string[]; engagements?: number | null; text?: string; demo?: boolean } = {},
): PostRecord {
  return {
    id,
    externalId: id,
    dataset: options.demo ? "demo" : "linkedin",
    url: null,
    text: options.text ?? `Post ${id}`,
    publishedAt: "2026-03-01T09:00:00.000Z",
    timeKnown: true,
    contentType: "text",
    providers: ["linkedin-data-export"],
    topics: options.topics ?? [],
    metrics: { ...EMPTY_METRICS, engagements: options.engagements ?? null },
    metricsObservedOn: "2026-03-10",
    metricsPeriod: null,
    metricsProvider: "linkedin-data-export",
  };
}

/** A provider whose next answers are queued by the test; it records every request. */
export function fakeProvider(
  answers: unknown[],
): AiProvider & { requests: StructuredRequest<unknown>[] } {
  const requests: StructuredRequest<unknown>[] = [];
  return {
    id: "anthropic",
    model: "fake-model",
    requests,
    async generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
      requests.push(request as StructuredRequest<unknown>);
      const next = answers.shift();
      if (next instanceof Error) throw next;
      return { data: next as T, model: "fake-model", usage: { inputTokens: 1, outputTokens: 1 } };
    },
  };
}

export function fakeWebResearch(
  result: Partial<WebResearchResult> | Error,
): WebResearchProvider & { requests: WebResearchRequest[] } {
  const requests: WebResearchRequest[] = [];
  return {
    id: "anthropic",
    model: "fake-model",
    requests,
    async research(request) {
      requests.push(request);
      if (result instanceof Error) throw result;
      return {
        text: "",
        sources: [],
        model: "fake-model",
        usage: { inputTokens: 1, outputTokens: 1 },
        ...result,
      };
    },
  };
}

export const FAKE_KEY = { provider: "anthropic" as const, apiKey: "unused", model: "fake-model" };

export async function claimDue(jobs: { claimNext(now: string): Promise<Job | null> }, now: string) {
  const job = await jobs.claimNext(now);
  if (!job) throw new Error("expected a due job");
  return job;
}
