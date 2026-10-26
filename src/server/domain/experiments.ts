import { addDays, dayOf, daysBetween, isWithin } from "./dates";
import { type PostMetricKey, postMetricValue } from "./metrics";
import type { PostRecord } from "./posts";
import { type Growth, growth, median } from "./stats";

export interface ExperimentSpec {
  metric: PostMetricKey;
  startDate: string;
  endDate: string;
  /** A baseline the user set; when null, the window before the experiment is used. */
  baseline: number | null;
}

type Verdict = "insufficient_data" | "higher" | "lower" | "no_clear_change";

export interface ExperimentEvaluation {
  baseline: number | null;
  observed: number | null;
  change: Growth;
  sampleSize: number;
  baselineSampleSize: number | null;
  baselinePeriod: { from: string; to: string } | null;
  verdict: Verdict;
}

// ADR 0015 item 6. These are rules of thumb for a personal account, not a significance test.
const MIN_POSTS = 3;
const NOTABLE_CHANGE = 0.1;

function valuesIn(posts: PostRecord[], metric: PostMetricKey, from: string, to: string): number[] {
  return posts.flatMap((post) => {
    if (!post.publishedAt || !isWithin(dayOf(post.publishedAt), from, to)) return [];
    const value = postMetricValue(post.metrics, metric);
    return value === null ? [] : [value];
  });
}

export function evaluateExperiment(
  spec: ExperimentSpec,
  posts: PostRecord[],
  asOf: string,
): ExperimentEvaluation {
  const end = asOf < spec.endDate ? asOf : spec.endDate;
  const observedValues = valuesIn(posts, spec.metric, spec.startDate, end);
  const length = daysBetween(spec.startDate, spec.endDate) + 1;
  const baselinePeriod =
    spec.baseline === null
      ? { from: addDays(spec.startDate, -length), to: addDays(spec.startDate, -1) }
      : null;
  const baselineValues = baselinePeriod
    ? valuesIn(posts, spec.metric, baselinePeriod.from, baselinePeriod.to)
    : null;
  const baseline = spec.baseline ?? median(baselineValues ?? []);
  const observed = median(observedValues);
  const change = growth(baseline, observed);
  const enough =
    observedValues.length >= MIN_POSTS &&
    (baselineValues === null || baselineValues.length >= MIN_POSTS);
  return {
    baseline,
    observed,
    change,
    sampleSize: observedValues.length,
    baselineSampleSize: baselineValues?.length ?? null,
    baselinePeriod,
    verdict: verdictOf(enough, baseline, observed),
  };
}

function verdictOf(enough: boolean, baseline: number | null, observed: number | null): Verdict {
  if (!enough || baseline === null || observed === null) return "insufficient_data";
  // From a zero baseline any rise is a rise; a percentage would divide by zero.
  if (baseline === 0) return observed > 0 ? "higher" : "no_clear_change";
  const percent = (observed - baseline) / Math.abs(baseline);
  if (Math.abs(percent) < NOTABLE_CHANGE) return "no_clear_change";
  return percent > 0 ? "higher" : "lower";
}
