import type { ImportedAccountDay } from "../../domain/content";
import { addDays } from "../../domain/dates";
import { backfillFollowers, emptyDay } from "../linkedin/account-day-sheets";
import type { LinkedInRestClient } from "./client";
import { readFollowerStats, readPostStats, startDay } from "./responses";
import { dateRangeParam, windows } from "./restli";

// LinkedIn pages these answers and does not document the page size; its samples show pages of
// ten. A week per request keeps every answer on one page without relying on paging links.
const WINDOW_DAYS = 7;

type Range = { from: string; until: string };
type DatedStat = Parameters<typeof startDay>[0];

// Summed, so the totals stay right should the "me" finder ever answer per post per day.
function byDay<T extends DatedStat>(stats: T[], value: (s: T) => number): Map<string, number> {
  const result = new Map<string, number>();
  for (const stat of stats) {
    const day = startDay(stat);
    if (day) result.set(day, (result.get(day) ?? 0) + value(stat));
  }
  return result;
}

// Daily impressions across all the member's posts. Reactions, comments and reposts from this
// finder are documented as "not consistent with UI", so only impressions are read here.
async function impressions(client: LinkedInRestClient, range: Range) {
  const body = await client.get("memberCreatorPostAnalytics", {
    q: "me",
    queryType: "IMPRESSION",
    aggregation: "DAILY",
    dateRange: dateRangeParam(range.from, range.until),
  });
  return readPostStats(body).filter((s) => s.metricType === "IMPRESSION");
}

async function followerGains(client: LinkedInRestClient, range: Range) {
  const body = await client.get("memberFollowersCount", {
    q: "dateRange",
    dateRange: dateRangeParam(range.from, range.until),
  });
  return readFollowerStats(body);
}

async function followerTotal(client: LinkedInRestClient): Promise<number | null> {
  const body = await client.get("memberFollowersCount", { q: "me" });
  return readFollowerStats(body)[0]?.memberFollowersCount ?? null;
}

async function inWindows<T>(range: Range, read: (window: Range) => Promise<T[]>): Promise<T[]> {
  const result: T[] = [];
  for (const window of windows(range.from, range.until, WINDOW_DAYS))
    result.push(...(await read(window)));
  return result;
}

async function dailyFigures(client: LinkedInRestClient, range: Range) {
  const shown = await inWindows(range, (w) => impressions(client, w));
  const gained = await inWindows(range, (w) => followerGains(client, w));
  const impressionsOn = byDay(shown, (s) => s.count);
  const gainedOn = byDay(gained, (s) => s.memberFollowersCount);
  return windows(range.from, range.until, 1).map(({ from: day }) => ({
    ...emptyDay(day),
    impressions: impressionsOn.get(day) ?? null,
    newFollowers: gainedOn.get(day) ?? null,
  }));
}

/**
 * One row per day of the range. The follower-statistics docs do not say whether a daily
 * memberFollowersCount is a gain or a running total; their samples (2, then 4) read as gains,
 * so they are taken as new followers and totals are back-calculated from today's count, the
 * way the analytics export's single stated total is. A day LinkedIn leaves out stays null.
 */
export async function readAccountDays(
  client: LinkedInRestClient,
  range: Range,
): Promise<ImportedAccountDay[]> {
  const days = await dailyFigures(client, range);
  const total = await followerTotal(client);
  // The count is today's, and today is still running; it stands for the last whole day.
  const lastDay = addDays(range.until, -1);
  return total === null ? days : backfillFollowers(days, { day: lastDay, followers: total });
}
