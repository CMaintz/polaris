import type { MetricRefreshStatusDto } from "../../../shared/refresh-types";
import { addDays, todayUtc } from "../../domain/dates";
import type { AccountDirectory } from "../accounts/ports";
import { type Clock, nowIso } from "../clock";
import type { Account, ApplyStats, ContentStore } from "../content/ports";
import { ConflictError, PermanentJobError, ValidationError } from "../errors";
import { parsePayload } from "../jobs/payload";
import type { Job, JobRepository } from "../jobs/ports";
import { jobError, refreshState, refusal } from "./access";
import { metricRefreshJob, refreshPayload } from "./jobs";
import type { LinkedInAnalytics, RefreshRequest, RefreshTargets } from "./ports";

/** How far back the first refresh reaches, and the most a missed stretch catches up. */
const BACKFILL_DAYS = 90;
/** Four requests per post; never-refreshed posts beyond this wait for the next run. */
const MAX_POSTS_PER_RUN = 100;

export interface RefreshResult extends ApplyStats {
  accountId: string;
  warnings: string[];
}

export interface RefreshDeps {
  analytics: LinkedInAnalytics;
  targets: RefreshTargets;
  content: Pick<ContentStore, "findAccount" | "applyBundle" | "deleteDataset">;
  accounts: Pick<AccountDirectory, "get">;
  jobs: Pick<JobRepository, "enqueue">;
  clock: Clock;
  /** Days after publishing that a post's figures keep being refreshed. */
  recentPostDays: number;
}

/** Refreshes a LinkedIn account's figures from LinkedIn's API. */
export class MetricRefreshService {
  constructor(private readonly deps: RefreshDeps) {}

  async status(userId: string): Promise<MetricRefreshStatusDto> {
    const account = await this.deps.content.findAccount(userId);
    if (!account) return { state: "not_connected", refreshablePosts: 0, totalPosts: 0 };
    const counts = await this.deps.targets.postCounts(account.id);
    const state = await this.state(account.id);
    return { state, refreshablePosts: counts.refreshable, totalPosts: counts.total };
  }

  async start(userId: string): Promise<Job> {
    const account = await this.deps.content.findAccount(userId);
    if (!account) throw new ConflictError("Add a LinkedIn account first");
    await this.assertRefreshable(account.id);
    return this.deps.jobs.enqueue(metricRefreshJob(userId, account.id), nowIso(this.deps.clock));
  }

  /** For schedules, which are created per account and must not fail every day afterwards. */
  async assertRefreshable(accountId: string): Promise<void> {
    const reason = refusal(await this.state(accountId));
    if (reason) throw new ValidationError(reason);
  }

  /** Job handler. Idempotent: the same day's figures overwrite themselves. */
  async run(job: Job): Promise<RefreshResult> {
    const { accountId } = parsePayload(refreshPayload, job.payload);
    const account = await this.jobAccount(job.userId, accountId);
    const reason = refusal(await this.state(account.id));
    if (reason) throw new PermanentJobError(reason);
    const bundle = await this.deps.analytics
      .fetch(account.id, await this.plan(account.id))
      .catch((error: unknown) => Promise.reject(jobError(error)));
    // Real figures replace the demo rather than mixing with it (ADR 0015).
    await this.deps.content.deleteDataset(account.id, "demo");
    const now = nowIso(this.deps.clock);
    const stats = await this.deps.content.applyBundle(account, bundle, job.id, now);
    return { accountId: account.id, warnings: bundle.warnings, ...stats };
  }

  private async state(accountId: string) {
    const platform = await this.deps.targets.platform(accountId);
    return refreshState(platform, await this.deps.analytics.access(accountId));
  }

  private async jobAccount(userId: string, accountId: string): Promise<Account> {
    const account = await this.deps.accounts.get(userId, accountId);
    if (!account) throw new PermanentJobError("The account this refresh was for has been deleted");
    return account;
  }

  private async plan(accountId: string): Promise<RefreshRequest> {
    const today = todayUtc(this.deps.clock());
    const posts = await this.deps.targets.postsToRefresh(
      accountId,
      addDays(today, -this.deps.recentPostDays),
      MAX_POSTS_PER_RUN,
    );
    return { observedOn: today, days: await this.dayRange(accountId, today), posts };
  }

  // Today is still running, so it is left for tomorrow's refresh.
  private async dayRange(accountId: string, today: string) {
    const last = await this.deps.targets.lastAccountDay(accountId);
    const floor = addDays(today, -BACKFILL_DAYS);
    const from = last && addDays(last, 1) > floor ? addDays(last, 1) : floor;
    return from < today ? { from, until: today } : null;
  }
}
