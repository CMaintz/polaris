import { z } from "zod";
import { AI_JOB } from "../ai/ai-service";
import type { NewJob } from "../jobs/ports";
import type { DueSchedule } from "./schedule-ports";

export const RESEARCH_JOB = "intelligence.research";
export const FEED_REFRESH_JOB = "intelligence.feed_refresh";
export const TREND_DIGEST_JOB = "intelligence.trend_digest";

export const researchPayload = z.object({
  accountId: z.string().min(1),
  question: z.string().min(1),
  peerId: z.string().nullable(),
});
export type ResearchPayload = z.infer<typeof researchPayload>;

export const feedRefreshPayload = z.object({
  accountId: z.string().min(1),
  /** One feed, or every feed of the account when absent. */
  feedId: z.string().optional(),
});
export type FeedRefreshPayload = z.infer<typeof feedRefreshPayload>;

export const digestPayload = z.object({ accountId: z.string().min(1), withAi: z.boolean() });
export type DigestPayload = z.infer<typeof digestPayload>;

export function researchJob(userId: string, payload: ResearchPayload): NewJob {
  return { userId, type: RESEARCH_JOB, payload: { ...payload }, maxRetries: 2 };
}

export function feedRefreshJob(userId: string, payload: FeedRefreshPayload): NewJob {
  return { userId, type: FEED_REFRESH_JOB, payload: { ...payload }, maxRetries: 2 };
}

export function digestJob(userId: string, payload: DigestPayload): NewJob {
  return { userId, type: TREND_DIGEST_JOB, payload: { ...payload }, maxRetries: 2 };
}

export function scheduledJob(schedule: DueSchedule): NewJob {
  const { userId, accountId, params } = schedule;
  switch (schedule.kind) {
    case "feed_refresh":
      return feedRefreshJob(userId, { accountId });
    case "trend_digest":
      return digestJob(userId, { accountId, withAi: params.withAi ?? true });
    case "research_rerun":
      return researchJob(userId, {
        accountId,
        question: params.question ?? "",
        peerId: params.peerId ?? null,
      });
    case "account_review":
      return {
        userId,
        type: AI_JOB,
        payload: {
          task: "account_review",
          accountId,
          tz: params.tz ?? 0,
          label: "Account review",
        },
        maxRetries: 2,
      };
  }
}
