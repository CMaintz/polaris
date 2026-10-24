import { RECENT_DAYS, dayOf, isWithin, lastDays } from "./dates";
import type { Insight, InsightInputs } from "./insight-types";
import { postMetricValue } from "./metrics";
import type { PostRecord } from "./posts";
import { median } from "./stats";

interface Outlier {
  post: PostRecord;
  value: number;
  typical: number;
  window: { from: string; to: string };
}

const engagementsOf = (p: PostRecord) => postMetricValue(p.metrics, "engagements");

export function outlierPost({ posts, asOf, sources }: InsightInputs): Insight | null {
  const outlier = findOutlier(posts, asOf);
  if (!outlier) return null;
  const { post, value, typical, window } = outlier;
  return {
    key: "outlier-post",
    title: "One recent post far outperformed the rest",
    observation: `A post from ${dayOf(post.publishedAt as string)} got ${value} engagements, against a 90-day median of ${typical}.`,
    interpretation:
      "Outliers often show what your audience reacts to most strongly: topic, format, or a hook.",
    action: "Open the post and note what was different about it.",
    signal: "Whether follow-up posts in the same style beat the median.",
    confidence: "medium",
    evidence: [
      {
        id: "e1",
        label: "Engagements on the post",
        value,
        unit: "count",
        postId: post.id,
        source: sources.posts,
      },
      {
        id: "e2",
        label: "90-day median engagements",
        value: typical,
        unit: "count",
        period: window,
        source: sources.posts,
      },
    ],
  };
}

/** The recent post with the most engagements, if it got at least twice the recent median. */
function findOutlier(posts: PostRecord[], asOf: string): Outlier | null {
  const window = lastDays(asOf, RECENT_DAYS);
  const recent = posts.filter(
    (p) => p.publishedAt && isWithin(dayOf(p.publishedAt), window.from, window.to),
  );
  const typical = median(recent.map(engagementsOf));
  const rated = recent.filter((p) => engagementsOf(p) !== null);
  const top = [...rated].sort((a, b) => (engagementsOf(b) ?? 0) - (engagementsOf(a) ?? 0))[0];
  const value = top ? engagementsOf(top) : null;
  if (!top || rated.length < 5 || !typical || value === null || value < typical * 2) return null;
  return { post: top, value, typical, window };
}
