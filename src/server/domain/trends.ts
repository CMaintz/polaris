import { addDays, dayOf } from "./dates";

// Matching is a deterministic keyword overlap (ADR 0019): cheap, explainable, and the same
// answer every time, so a trend count can be checked by reading the items behind it.

const MIN_TOPIC_LENGTH = 2;
const MAX_JOINED_WORDS = 3;

const TREND_WINDOWS = { last7: 7, last30: 30, last90: 90 } as const;
type TrendWindow = keyof typeof TREND_WINDOWS;

export interface TopicTrend extends Record<TrendWindow, number> {
  topic: string;
}

function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** Every run of 1 to 3 adjacent words joined, so "Product Engineering" meets #productengineering. */
function phrases(text: string): Set<string> {
  const list = words(text);
  const found = new Set<string>();
  for (let start = 0; start < list.length; start++) {
    for (let size = 1; size <= MAX_JOINED_WORDS && start + size <= list.length; size++) {
      found.add(list.slice(start, start + size).join(""));
    }
  }
  return found;
}

export function matchTopics(text: string, topics: readonly string[]): string[] {
  const found = phrases(text);
  return topics.filter((topic) => topic.length >= MIN_TOPIC_LENGTH && found.has(topic));
}

/** A feed item's identity within its feed, or null when it has neither guid nor link. */
export function dedupeKey(guid: string | null, link: string | null): string | null {
  const id = guid?.trim();
  if (id) return `guid:${id}`;
  const url = link?.trim();
  return url ? `link:${url}` : null;
}

export function itemDay(publishedAt: string | null, fetchedAt: string): string {
  // A publish date after the fetch is not believable.
  if (!publishedAt || publishedAt > fetchedAt) return dayOf(fetchedAt);
  return dayOf(publishedAt);
}

export function trendScores(
  matches: readonly { day: string; topics: readonly string[] }[],
  topics: readonly string[],
  today: string,
): TopicTrend[] {
  const counts = new Map(topics.map((t) => [t, { topic: t, last7: 0, last30: 0, last90: 0 }]));
  for (const match of matches) {
    for (const topic of match.topics) {
      const row = counts.get(topic);
      if (!row) continue;
      for (const [key, days] of Object.entries(TREND_WINDOWS) as [TrendWindow, number][]) {
        if (match.day > addDays(today, -days) && match.day <= today) row[key] += 1;
      }
    }
  }
  return [...counts.values()].sort(
    (a, b) => b.last30 - a.last30 || b.last90 - a.last90 || a.topic.localeCompare(b.topic),
  );
}
