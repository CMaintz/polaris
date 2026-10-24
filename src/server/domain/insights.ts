import { cadenceChange } from "./cadence-insight";
import { impressionsChange } from "./impressions-insight";
import type { Insight, InsightInputs } from "./insight-types";
import { outlierPost } from "./outlier-insight";
import { postingTimes, segmentPerformance } from "./posts";
import { bestSegment } from "./segment-insights";

export function ruleInsights(inputs: InsightInputs): Insight[] {
  const { posts } = inputs;
  const types = segmentPerformance(posts, (p) =>
    p.contentType === "unknown" ? [] : [p.contentType],
  );
  return [
    impressionsChange(inputs),
    bestSegment(inputs, "content-type", types),
    bestSegment(
      inputs,
      "topic",
      segmentPerformance(posts, (p) => p.topics),
    ),
    bestSegment(inputs, "weekday", postingTimes(posts, inputs.tzOffsetMinutes).weekdays),
    outlierPost(inputs),
    cadenceChange(inputs),
  ].filter((insight): insight is Insight => insight !== null);
}
