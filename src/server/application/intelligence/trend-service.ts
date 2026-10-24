import { parsePayload } from "../jobs/payload";
import { type Clock, nowIso } from "../clock";
import type { Job, JobRepository } from "../jobs/ports";
import { addDays, todayUtc } from "../../domain/dates";
import { itemDay, matchTopics, trendScores } from "../../domain/trends";
import type {
  DigestAiDto,
  DigestDto,
  TrendMatchDto,
  TrendsDto,
} from "../../../shared/intelligence-types";
import { type PostSource, accountContext } from "./context";
import { structuredCall } from "../ai/recorded-call";
import { digestJob, digestPayload } from "./jobs";
import type { DigestStore, FeedStore } from "./feed-ports";
import type { InteractionRecorder, ProviderSource } from "./ports";
import { TREND_DIGEST, renderDigestPrompt } from "./prompts";

const TREND_DAYS = 90;
const RECENT_DAYS = 30;
const DIGEST_DAYS = 7;
const MAX_DIGEST_ITEMS = 40;

export interface TrendDeps {
  feeds: FeedStore;
  posts: PostSource;
  digests: DigestStore;
  providers: ProviderSource;
  recorder: InteractionRecorder;
  jobs: JobRepository;
  clock: Clock;
}

interface Match {
  dto: TrendMatchDto;
  summary: string;
}

export class TrendService {
  constructor(private readonly deps: TrendDeps) {}

  async trends(accountId: string): Promise<TrendsDto> {
    const today = todayUtc(this.deps.clock());
    const { topics, matches } = await this.matches(accountId, TREND_DAYS);
    const recentFrom = addDays(today, -RECENT_DAYS);
    return {
      trackedSince: await this.deps.feeds.firstFetch(accountId),
      topics: trendScores(
        matches.map((m) => m.dto),
        topics,
        today,
      ),
      recent: matches
        .filter((m) => m.dto.day > recentFrom)
        .slice(0, 50)
        .map((m) => m.dto),
    };
  }

  startDigest(userId: string, accountId: string, withAi: boolean): Promise<Job> {
    return this.deps.jobs.enqueue(
      digestJob(userId, { accountId, withAi }),
      nowIso(this.deps.clock),
    );
  }

  digests(accountId: string): Promise<DigestDto[]> {
    return this.deps.digests.list(accountId, 10);
  }

  async runDigest(job: Job): Promise<{ digestId: string; matches: number }> {
    const payload = parsePayload(digestPayload, job.payload);
    const today = todayUtc(this.deps.clock());
    const { topics, matches } = await this.matches(payload.accountId, DIGEST_DAYS);
    const picked = matches.slice(0, MAX_DIGEST_ITEMS);
    const ai = payload.withAi
      ? await this.summarise(job, topics, picked)
      : { status: "skipped" as const, reason: "AI summary turned off" };
    await this.deps.digests.save(payload.accountId, {
      id: job.id,
      from: addDays(today, -(DIGEST_DAYS - 1)),
      to: today,
      matches: picked.map((m) => m.dto),
      ai,
      createdAt: nowIso(this.deps.clock),
    });
    return { digestId: job.id, matches: picked.length };
  }

  private async matches(accountId: string, days: number) {
    const { topics } = await accountContext(this.deps.posts, accountId);
    const today = todayUtc(this.deps.clock());
    const items = await this.deps.feeds.items(accountId, addDays(today, -days));
    const from = addDays(today, -days);
    const matches: Match[] = items.flatMap((item) => {
      const matched = matchTopics(`${item.title} ${item.summary}`, topics);
      const day = itemDay(item.publishedAt, item.fetchedAt);
      if (matched.length === 0 || day <= from) return [];
      const { id, feedTitle, title, link } = item;
      return [
        {
          dto: { itemId: id, feedTitle, title, link, day, topics: matched },
          summary: item.summary,
        },
      ];
    });
    return { topics, matches };
  }

  private async summarise(job: Job, topics: string[], matches: Match[]): Promise<DigestAiDto> {
    if (matches.length === 0)
      return { status: "skipped", reason: "No feed items matched your topics" };
    const provider = await this.deps.providers.activeProvider(job.userId);
    if (!provider) return { status: "skipped", reason: "No AI key is configured" };
    const context = {
      userId: job.userId,
      jobId: job.id,
      inputSummary: { items: matches.length, topics: topics.length },
    };
    const prompt = renderDigestPrompt(
      topics,
      matches.map((m) => ({ title: m.dto.title, summary: m.summary, topics: m.dto.topics })),
    );
    try {
      const call = { template: TREND_DIGEST, prompt };
      const { value: data, interactionId } = await structuredCall(
        this.deps,
        context,
        provider,
        call,
      );
      const ids = new Map(matches.map((m, i) => [`I${i + 1}`, m.dto.itemId]));
      const relations = data.relations.flatMap(({ itemId, relation }) => {
        const real = ids.get(itemId);
        return real ? [{ itemId: real, relation }] : [];
      });
      return { status: "succeeded", summary: data.summary, relations, interactionId };
    } catch (error) {
      return {
        status: "failed",
        reason: error instanceof Error ? error.message : "AI call failed",
      };
    }
  }
}
