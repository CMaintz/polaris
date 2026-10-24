import { parsePayload } from "../jobs/payload";
import { type Clock, nowIso } from "../clock";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import type { Job, JobRepository } from "../jobs/ports";
import { addDays, todayUtc } from "../../domain/dates";
import { dedupeKey } from "../../domain/trends";
import type { FeedDto } from "../../../shared/intelligence-types";
import { type FeedRefreshPayload, feedRefreshJob, feedRefreshPayload } from "./jobs";
import type { Feed, FeedFetcher, FeedStore } from "./ports";

const MAX_FEEDS = 50;
const MAX_URL = 2000;
// Trend windows reach back 90 days; twice that keeps the history useful without unbounded growth.
const RETENTION_DAYS = 180;

export interface FeedDeps {
  feeds: FeedStore;
  fetcher: FeedFetcher;
  jobs: JobRepository;
  clock: Clock;
  /** Mirrors the fetch guard's http opt-in, so a URL it would refuse is refused up front. */
  allowHttp: boolean;
}

export class FeedService {
  constructor(private readonly deps: FeedDeps) {}

  list(accountId: string): Promise<FeedDto[]> {
    return this.deps.feeds.list(accountId);
  }

  async add(userId: string, accountId: string, url: string): Promise<{ feed: FeedDto; job: Job }> {
    const normalized = this.validUrl(url);
    if ((await this.deps.feeds.list(accountId)).length >= MAX_FEEDS) {
      throw new ConflictError(`You can follow up to ${MAX_FEEDS} feeds`);
    }
    const feed = await this.deps.feeds.create(accountId, normalized, nowIso(this.deps.clock));
    if (!feed) throw new ConflictError("You already follow that feed");
    return { feed, job: await this.enqueue(userId, { accountId, feedId: feed.id }) };
  }

  async remove(accountId: string, id: string): Promise<void> {
    if (!(await this.deps.feeds.delete(accountId, id))) throw new NotFoundError("Feed");
  }

  refresh(userId: string, accountId: string): Promise<Job> {
    return this.enqueue(userId, { accountId });
  }

  async run(job: Job): Promise<{ fetched: number; failed: number; newItems: number }> {
    const payload = parsePayload(feedRefreshPayload, job.payload);
    const feeds = await this.targets(payload);
    let failed = 0;
    let newItems = 0;
    for (const feed of feeds) {
      const added = await this.refreshOne(feed);
      if (added === null) failed += 1;
      else newItems += added;
    }
    const cutoff = addDays(todayUtc(this.deps.clock()), -RETENTION_DAYS);
    await this.deps.feeds.pruneBefore(payload.accountId, cutoff);
    return { fetched: feeds.length - failed, failed, newItems };
  }

  private async targets(payload: FeedRefreshPayload): Promise<Feed[]> {
    if (!payload.feedId) return this.deps.feeds.list(payload.accountId);
    const feed = await this.deps.feeds.get(payload.accountId, payload.feedId);
    return feed ? [feed] : [];
  }

  private async refreshOne(feed: Feed): Promise<number | null> {
    const now = nowIso(this.deps.clock);
    try {
      const parsed = await this.deps.fetcher.fetch(feed.url);
      const items = parsed.items.flatMap((item) => {
        const key = dedupeKey(item.guid, item.link);
        return key ? [{ ...item, key }] : [];
      });
      const added = await this.deps.feeds.addItems(feed.id, items, now);
      await this.deps.feeds.recordFetch(feed.id, { title: parsed.title, error: null }, now);
      return added;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not fetch the feed";
      await this.deps.feeds.recordFetch(feed.id, { title: null, error: message }, now);
      return null;
    }
  }

  private validUrl(raw: string): string {
    let url: URL;
    try {
      url = new URL(raw.trim());
    } catch {
      throw new ValidationError("Enter the full feed URL, starting with https://");
    }
    const allowed = url.protocol === "https:" || (this.deps.allowHttp && url.protocol === "http:");
    if (!allowed) throw new ValidationError("Feed URLs must start with https://");
    if (url.toString().length > MAX_URL) throw new ValidationError("That URL is too long");
    return url.toString();
  }

  private enqueue(userId: string, payload: FeedRefreshPayload): Promise<Job> {
    return this.deps.jobs.enqueue(feedRefreshJob(userId, payload), nowIso(this.deps.clock));
  }
}
