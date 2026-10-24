import type { Clock } from "../clock";
import { ValidationError } from "../errors";
import { latestDay, providersOf } from "../analytics/account-series";
import { sourceLabel, toPostSummary, toSegmentDto } from "../analytics/presenters";
import { type DayWindow, campaignPerformance, measuredWindow } from "../../domain/campaigns";
import { addDays, todayUtc } from "../../domain/dates";
import { type FunnelInputs, funnelPeriods, funnelWindow } from "../../domain/funnel";
import { type PillarActual, pillarReport } from "../../domain/pillars";
import { type PostRecord, assignBands } from "../../domain/posts";
import type { PeriodPerformance } from "../../domain/campaigns";
import type {
  CampaignFunnelDto,
  CampaignPerformanceDto,
  FunnelDto,
  PeriodPerformanceDto,
  PillarActualDto,
  PillarReportDto,
} from "../../../shared/strategy-types";
import type { CampaignWithPosts } from "./campaign-service";
import type { AccountDay } from "../analytics/ports";
import type { AccountResolver, Pillar, StrategyData } from "./ports";

export interface AnalysisDeps {
  data: StrategyData;
  accounts: AccountResolver;
  campaigns: { withPosts(userId: string, id: string): Promise<CampaignWithPosts> };
  pillars: { list(userId: string): Promise<Pillar[]> };
  clock: Clock;
}

export interface RangeQuery {
  from?: string;
  to?: string;
  days?: number;
}

// Half a year of weeks or a year of months: enough periods to see a trend in either view.
const DEFAULT_DAYS = { week: 182, month: 365 } as const;

const toPeriodDto = (p: PeriodPerformance): PeriodPerformanceDto => ({
  ...p,
  posts: toSegmentDto(p.posts),
});

function funnelInputs(days: readonly AccountDay[]): FunnelInputs {
  return {
    impressions: days.map((d) => ({ day: d.day, value: d.impressions })),
    engagements: days.map((d) => ({ day: d.day, value: d.engagements })),
    newFollowers: days.map((d) => ({ day: d.day, value: d.newFollowers })),
  };
}

/** Bands rank a post among all the account's posts, not just the campaign's. */
function summariesOf(linked: readonly PostRecord[], all: readonly PostRecord[]) {
  const bands = assignBands(all);
  return linked.map((p) => toPostSummary(p, bands.get(p.id) ?? "unrated"));
}

const toActualDto = (actual: PillarActual, pillar: Pillar): PillarActualDto => ({
  ...actual,
  name: pillar.name,
  targetShare: pillar.targetShare,
  performance: toSegmentDto(actual.performance),
});

export class StrategyAnalysis {
  constructor(private readonly deps: AnalysisDeps) {}

  async funnel(userId: string, granularity: "week" | "month", range: RangeQuery) {
    const accountId = await this.deps.accounts.find(userId);
    const { days, asOf } = await this.load(accountId);
    const window = this.window(range, asOf, DEFAULT_DAYS[granularity]);
    const steps = funnelPeriods(funnelInputs(days), granularity, window);
    const source = sourceLabel(providersOf(days));
    return { granularity, ...window, source, steps } satisfies FunnelDto;
  }

  async campaignFunnel(userId: string, campaignId: string): Promise<CampaignFunnelDto> {
    const { accountId, campaign } = await this.deps.campaigns.withPosts(userId, campaignId);
    const { days, asOf } = await this.load(accountId);
    const window = measuredWindow(campaign.startDate, campaign.endDate, asOf);
    return {
      campaignId,
      source: sourceLabel(providersOf(days)),
      step: window && funnelWindow(funnelInputs(days), window),
    };
  }

  async campaignPerformance(userId: string, id: string): Promise<CampaignPerformanceDto> {
    const { accountId, campaign, postIds } = await this.deps.campaigns.withPosts(userId, id);
    const { posts, days, asOf } = await this.load(accountId);
    const linked = posts.filter((p) => postIds.has(p.id));
    const summaries = summariesOf(linked, posts);
    const window = measuredWindow(campaign.startDate, campaign.endDate, asOf);
    if (!window) return { campaignId: id, campaign: null, baseline: null, posts: summaries };
    const followers = days.map((d) => ({ day: d.day, value: d.followers }));
    const result = campaignPerformance({ window, linked, all: posts, followers });
    return {
      campaignId: id,
      campaign: toPeriodDto(result.campaign),
      baseline: toPeriodDto(result.baseline),
      posts: summaries,
    };
  }

  async pillarReport(userId: string, range: RangeQuery): Promise<PillarReportDto> {
    const accountId = await this.deps.accounts.find(userId);
    const [{ posts, asOf }, pillars] = await Promise.all([
      this.load(accountId),
      this.deps.pillars.list(userId),
    ]);
    const report = pillarReport(pillars, posts, this.window(range, asOf, 90));
    const named = report.pillars.map((actual, i) => toActualDto(actual, pillars[i] as Pillar));
    return { ...report, pillars: named };
  }

  private window(range: RangeQuery, asOf: string, defaultDays: number): DayWindow {
    const to = range.to ?? asOf;
    const from = range.from ?? addDays(to, -((range.days ?? defaultDays) - 1));
    if (to < from) throw new ValidationError("The end date must not be before the start date");
    return { from, to };
  }

  private async load(accountId: string | null) {
    const [posts, days] = accountId
      ? await Promise.all([this.deps.data.posts(accountId), this.deps.data.accountDays(accountId)])
      : [[], []];
    return { posts, days, asOf: latestDay(posts, days) ?? todayUtc(this.deps.clock()) };
  }
}
