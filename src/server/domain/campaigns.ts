import { addDays, dayOf, daysBetween, isWithin } from "./dates";
import { type PostRecord, type SegmentPerformance, dailyPostCounts, summarisePosts } from "./posts";
import { sumOrNull } from "./stats";
import type { DatedValue } from "./timeseries";

export type CampaignStatus = "planned" | "active" | "done" | "cancelled";

export interface DayWindow {
  from: string;
  to: string;
}

export interface Measured {
  value: number | null;
  observedDays: number;
  totalDays: number;
}

export function measuredWindow(startDate: string, endDate: string, asOf: string) {
  if (asOf < startDate) return null;
  return { from: startDate, to: asOf < endDate ? asOf : endDate };
}

export function baselineWindow(window: DayWindow): DayWindow {
  const days = daysBetween(window.from, window.to) + 1;
  return { from: addDays(window.from, -days), to: addDays(window.from, -1) };
}

export function campaignPostIds(
  postIds: readonly string[],
  planItems: readonly { postId: string | null }[],
): Set<string> {
  const viaPlan = planItems.flatMap((item) => (item.postId ? [item.postId] : []));
  return new Set([...postIds, ...viaPlan]);
}

const totalDays = (window: DayWindow) => daysBetween(window.from, window.to) + 1;

// Followers are a stock: a gap at either edge makes the change unknown rather than measured
// from whichever day happens to be nearest.
export function followerChange(followers: readonly DatedValue[], window: DayWindow): Measured {
  const byDay = new Map(followers.filter((f) => f.value !== null).map((f) => [f.day, f.value]));
  const start = byDay.get(addDays(window.from, -1));
  const end = byDay.get(window.to);
  return {
    value: start == null || end == null ? null : end - start,
    observedDays: [...byDay.keys()].filter((day) => isWithin(day, window.from, window.to)).length,
    totalDays: totalDays(window),
  };
}

function postsPublished(all: readonly PostRecord[], window: DayWindow): Measured {
  const counted = dailyPostCounts(all).filter((d) => isWithin(d.day, window.from, window.to));
  return {
    value: sumOrNull(counted.map((d) => d.value)),
    observedDays: counted.length,
    totalDays: totalDays(window),
  };
}

export interface CampaignPerformanceInput {
  window: DayWindow;
  linked: readonly PostRecord[];
  all: readonly PostRecord[];
  followers: readonly DatedValue[];
}

export interface PeriodPerformance {
  window: DayWindow;
  posts: SegmentPerformance;
  postsPublished: Measured;
  followerChange: Measured;
}

export interface CampaignPerformance {
  campaign: PeriodPerformance;
  baseline: PeriodPerformance;
}

function publishedIn(posts: readonly PostRecord[], window: DayWindow): PostRecord[] {
  return posts.filter(
    (p) => p.publishedAt && isWithin(dayOf(p.publishedAt), window.from, window.to),
  );
}

// The campaign's post count is its linked posts, which are known exactly; the baseline's
// comes from the archive, as top-post exports would undercount it.
export function campaignPerformance(input: CampaignPerformanceInput): CampaignPerformance {
  const { window, linked, all, followers } = input;
  const before = baselineWindow(window);
  const linkedIds = new Set(linked.map((p) => p.id));
  const others = publishedIn(all, before).filter((p) => !linkedIds.has(p.id));
  return {
    campaign: {
      window,
      posts: summarisePosts("campaign", linked),
      postsPublished: {
        value: linked.length,
        observedDays: totalDays(window),
        totalDays: totalDays(window),
      },
      followerChange: followerChange(followers, window),
    },
    baseline: {
      window: before,
      posts: summarisePosts("baseline", others),
      postsPublished: postsPublished(all, before),
      followerChange: followerChange(followers, before),
    },
  };
}
