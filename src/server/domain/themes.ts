import { addDays, dayOf, daysBetween, isWithin } from "./dates";
import { type PostRecord, isFullyListed, postCountCoverage, segmentPerformance } from "./posts";

export interface Theme {
  name: string;
  description: string;
  postIds: string[];
}

const MAX_THEMES = 8;
const MAX_NAME = 60;
const MAX_DESCRIPTION = 240;
const WINDOW_DAYS = 90;
// Below this many posts in a window a share is one post's whim, not a pattern (ADR 0015 s6).
const MIN_WINDOW_POSTS = 3;
const SHIFT = 0.1;

const tidy = (text: string, max: number) => text.replace(/\s+/g, " ").trim().slice(0, max);

/**
 * Turns model proposals into themes over real posts. `promptIds` maps the ids the prompt
 * used to post ids; any other id is invented and dropped, and so is a theme left with none.
 */
export function groundThemes(
  proposals: readonly Theme[],
  promptIds: ReadonlyMap<string, string>,
): Theme[] {
  const byName = new Map<string, Theme>();
  for (const proposal of proposals) {
    const name = tidy(proposal.name, MAX_NAME);
    const postIds = proposal.postIds.flatMap((id) => promptIds.get(id) ?? []);
    if (!name || postIds.length === 0) continue;
    const key = name.toLowerCase();
    const existing = byName.get(key);
    if (existing) existing.postIds = [...new Set([...existing.postIds, ...postIds])];
    else
      byName.set(key, {
        name,
        description: tidy(proposal.description, MAX_DESCRIPTION),
        postIds: [...new Set(postIds)],
      });
  }
  return [...byName.values()].slice(0, MAX_THEMES);
}

function themesByPost(themes: readonly Theme[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const theme of themes) {
    for (const id of theme.postIds) map.set(id, [...(map.get(id) ?? []), theme.name]);
  }
  return map;
}

export function themePerformance(posts: readonly PostRecord[], themes: readonly Theme[]) {
  const byPost = themesByPost(themes);
  const descriptions = new Map(themes.map((t) => [t.name, t.description]));
  return segmentPerformance(posts, (p) => byPost.get(p.id) ?? []).map(({ key, ...rest }) => ({
    theme: key,
    description: descriptions.get(key) ?? "",
    ...rest,
  }));
}

interface ThemeWindow {
  from: string;
  to: string;
  coveredDays: number;
  posts: number;
}

export type EmergingStatus = "emerging" | "fading" | "steady" | "insufficient";

export interface EmergingTheme {
  theme: string;
  latestShare: number | null;
  previousShare: number | null;
  change: number | null;
  status: EmergingStatus;
}

function windowOf(from: string, to: string, coverageFrom: string, posts: readonly PostRecord[]) {
  const start = from > coverageFrom ? from : coverageFrom;
  const inside = posts.filter((p) => isWithin(dayOf(p.publishedAt as string), from, to));
  const window: ThemeWindow = {
    from,
    to,
    coveredDays: Math.max(0, daysBetween(start, to) + 1),
    posts: inside.length,
  };
  return { window, ids: new Set(inside.map((p) => p.id)) };
}

function shareIn(ids: ReadonlySet<string>, theme: Theme): number | null {
  if (ids.size < MIN_WINDOW_POSTS) return null;
  return theme.postIds.filter((id) => ids.has(id)).length / ids.size;
}

function statusOf(change: number | null): EmergingStatus {
  if (change === null) return "insufficient";
  // Rounded because 0.35 - 0.25 is a hair under 0.1 in floating point.
  const points = Math.round(change * 1000) / 1000;
  if (points >= SHIFT) return "emerging";
  if (points <= -SHIFT) return "fading";
  return "steady";
}

/**
 * Each theme's share of posts in the latest 90 covered days against the 90 before. Only
 * classified posts from sources that list every post count, since a top-posts export would
 * make any theme look like all of the account's output.
 */
export function emergingThemes(
  posts: readonly PostRecord[],
  themes: readonly Theme[],
  classified: ReadonlySet<string>,
) {
  const coverage = postCountCoverage(posts);
  if (!coverage) return { windows: null, emerging: [] };
  const counted = posts.filter((p) => classified.has(p.id) && isFullyListed(p) && p.publishedAt);
  const end = coverage.to;
  const latest = windowOf(addDays(end, 1 - WINDOW_DAYS), end, coverage.from, counted);
  const previous = windowOf(
    addDays(end, 1 - 2 * WINDOW_DAYS),
    addDays(end, -WINDOW_DAYS),
    coverage.from,
    counted,
  );
  const emerging = themes.map((theme): EmergingTheme => {
    const latestShare = shareIn(latest.ids, theme);
    const previousShare = shareIn(previous.ids, theme);
    const change =
      latestShare === null || previousShare === null ? null : latestShare - previousShare;
    return { theme: theme.name, latestShare, previousShare, change, status: statusOf(change) };
  });
  emerging.sort((a, b) => (b.change ?? -Infinity) - (a.change ?? -Infinity));
  return { windows: { latest: latest.window, previous: previous.window }, emerging };
}
