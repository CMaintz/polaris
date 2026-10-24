import type { Insight, InsightInputs } from "./insight-types";
import { type SegmentPerformance, summarisePosts } from "./posts";

// A segment must beat the overall median by this factor to be called out.
const LIFT = 1.2;
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const SEGMENT_TEXT: Record<
  string,
  { name: (key: string) => string; minPosts: number; minGroups: number }
> = {
  "content-type": { name: (k) => `${k} posts`, minPosts: 3, minGroups: 2 },
  topic: { name: (k) => `posts tagged #${k}`, minPosts: 3, minGroups: 2 },
  weekday: { name: (k) => `posts published on ${WEEKDAYS[Number(k)]}`, minPosts: 2, minGroups: 3 },
};

export function bestSegment(
  inputs: InsightInputs,
  kind: string,
  segments: SegmentPerformance[],
): Insight | null {
  const rules = SEGMENT_TEXT[kind];
  if (!rules) return null;
  const eligible = segments.filter(
    (s) => s.withMetrics >= rules.minPosts && s.medianEngagements !== null,
  );
  const overall = summarisePosts("all", inputs.posts).medianEngagements;
  const best = eligible[0];
  if (
    !best ||
    eligible.length < rules.minGroups ||
    !overall ||
    (best.medianEngagements ?? 0) < overall * LIFT
  ) {
    return null;
  }
  return segmentInsight(kind, rules.name(best.key), best, overall, inputs.sources.posts);
}

function segmentInsight(
  kind: string,
  name: string,
  best: SegmentPerformance,
  overall: number,
  source: string,
): Insight {
  const lift = (best.medianEngagements as number) / overall;
  return {
    key: `best-${kind}`,
    title: `${name[0]?.toUpperCase()}${name.slice(1)} perform best`,
    observation: `The median ${name} got ${best.medianEngagements} engagements, ${lift.toFixed(1)} times your overall median of ${overall}.`,
    interpretation:
      "This is a pattern in your own history, not proof of cause: other differences between these posts may explain it.",
    action: `Plan a few more ${name} and see whether the pattern holds.`,
    signal: `Median engagements of new ${name} against the overall median.`,
    confidence: best.withMetrics >= 8 ? "medium" : "low",
    evidence: [
      {
        id: "e1",
        label: `Median engagements, ${name}`,
        value: best.medianEngagements,
        unit: "count",
        source,
      },
      { id: "e2", label: "Median engagements, all posts", value: overall, unit: "count", source },
      {
        id: "e3",
        label: `Posts with metrics, ${name}`,
        value: best.withMetrics,
        unit: "count",
        source,
      },
    ],
  };
}
