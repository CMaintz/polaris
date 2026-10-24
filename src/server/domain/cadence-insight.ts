import { PERIOD_DAYS, addDays, dayOf, isWithin, lastDays } from "./dates";
import type { Insight, InsightInputs } from "./insight-types";
import { type PostRecord, isFullyListed, postCountCoverage } from "./posts";
import { growth } from "./stats";

interface Window {
  from: string;
  to: string;
}

interface PostCounts {
  current: number;
  previous: number;
  currentWindow: Window;
  previousWindow: Window;
}

export function cadenceChange({ posts, asOf, sources }: InsightInputs): Insight | null {
  const counts = postCounts(posts, asOf);
  if (!counts) return null;
  const { current, previous, currentWindow, previousWindow } = counts;
  const change = growth(previous, current);
  if (previous < 4 || change.percent === null || Math.abs(change.percent) < 0.5) return null;
  const fewer = current < previous;
  return {
    key: "cadence-change",
    title: fewer ? "You are posting less often" : "You are posting more often",
    observation: `${current} posts in the last 28 days, against ${previous} in the 28 days before.`,
    interpretation: fewer
      ? "Posting frequency usually moves reach; a drop in impressions may follow."
      : "More posts give the audience more to react to, but watch per-post engagement.",
    action: fewer
      ? "Use the planner to schedule your next posts."
      : "Check that per-post engagement is holding up.",
    signal: "Impressions and median engagements per post over the next 28 days.",
    confidence: "high",
    evidence: [
      {
        id: "e1",
        label: "Posts, last 28 days",
        value: current,
        unit: "count",
        period: currentWindow,
        source: sources.posts,
      },
      {
        id: "e2",
        label: "Posts, previous 28 days",
        value: previous,
        unit: "count",
        period: previousWindow,
        source: sources.posts,
      },
    ],
  };
}

function postCounts(posts: PostRecord[], asOf: string): PostCounts | null {
  const coverage = postCountCoverage(posts);
  const currentWindow = lastDays(asOf, PERIOD_DAYS);
  const previousWindow = lastDays(addDays(asOf, -PERIOD_DAYS), PERIOD_DAYS);
  // Both windows must lie inside the archive's range, or a missing export reads as silence.
  if (!coverage || coverage.from > previousWindow.from || coverage.to < asOf) return null;
  const listed = posts.filter(isFullyListed);
  const count = ({ from, to }: Window) =>
    listed.filter((p) => p.publishedAt && isWithin(dayOf(p.publishedAt), from, to)).length;
  return {
    current: count(currentWindow),
    previous: count(previousWindow),
    currentWindow,
    previousWindow,
  };
}
